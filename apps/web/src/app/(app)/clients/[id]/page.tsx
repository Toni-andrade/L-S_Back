import {
  assessClientSla,
  formatCurrencyUS,
  formatPercentUS,
  summarizeActivity,
} from "@ls/domain";
import { FileText, PieChart, Ticket } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiDraftPanel } from "@/components/ai-draft-panel";
import { ClientRelationship } from "@/components/contacts/client-relationship";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aiConfigured } from "@/lib/ai";
import { suggestClientCheckin } from "@/lib/actions/ai";
import { updateClientProfile } from "@/lib/actions/clients";
import { deleteDocument, uploadDocument } from "@/lib/actions/documents";
import { generateClientStatement } from "@/lib/actions/reports";
import { startWorkflow } from "@/lib/actions/workflows";
import { requireUser } from "@/lib/auth";
import {
  activityForScope,
  contactsForClient,
  documentsForClient,
  flagsForScope,
  holdingsForScope,
  latestSnapshot,
  lastTouchForClient,
  oldestOpenBlockerForClient,
  slaPolicies,
  workflowRuns,
  workflowTemplates,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*, households(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!client) notFound();

  const snapshot = await latestSnapshot();
  const [holdings, activity, flags, contacts, policies, lastTouchAt, oldestBlocker, accounts, tickets, proposals, users, wfRuns, wfTemplates] =
    await Promise.all([
      snapshot ? holdingsForScope("client", id, snapshot.id) : Promise.resolve([]),
      activityForScope("client", id, "trailing_30d"),
      flagsForScope("client", id),
      contactsForClient(id),
      slaPolicies(),
      lastTouchForClient(id),
      oldestOpenBlockerForClient(id),
      supabase.from("accounts").select("id, custodian, account_number_masked, base_currency, status").eq("client_id", id),
      supabase
        .from("tickets")
        .select("id, number, title, status, priority")
        .eq("client_id", id)
        .not("status", "in", "(resolved,closed)"),
      supabase.from("proposals").select("id, client_name, status, version, month_year").eq("client_id", id),
      supabase.from("users").select("id, name, email"),
      workflowRuns({ clientId: id }),
      workflowTemplates(),
    ]);
  const documents = await documentsForClient(id);

  const aum = holdings.reduce((s, h) => s + h.market_value, 0);
  const openFlags = flags.filter((f) => !f.acknowledged_at).length;
  const userName = new Map((users.data ?? []).map((u) => [u.id, u.name || u.email]));
  const household = client.households as { id: string; name: string } | null;

  const assessments = assessClientSla(
    { riskProfile: client.risk_profile, lastTouchAt, activatedAt: client.status === "active" ? new Date(client.created_at) : null, oldestOpenBlockerAt: oldestBlocker },
    policies,
  );
  const nextReview = assessments.find((a) => a.kind === "periodic_review");
  const canEdit = me.role === "advisor" || me.role === "admin";

  const kpiClass = "rounded-card border border-hairline bg-white p-4";
  const inputClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

  return (
    <div>
      <PageHeader
        title={client.name}
        subtitle={`${client.type} · ${household ? `Household: ${household.name}` : "No household"}`}
        action={
          <div className="flex gap-2">
            <Link href={`/portfolio-review/client/${id}`} className={buttonVariants({ variant: "primary", size: "sm" })}>
              <PieChart className="h-4 w-4" /> Portfolio
            </Link>
            <Link href={`/proposals/new?clientId=${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileText className="h-4 w-4" /> Proposal
            </Link>
            <Link href={`/tickets/new?clientId=${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Ticket className="h-4 w-4" /> Ticket
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={client.status === "active" ? "success" : client.status === "closed" ? "default" : "celeste"}>
          {client.status}
        </Badge>
        {client.risk_profile ? <Badge variant="celeste" className="capitalize">{client.risk_profile}</Badge> : null}
        {client.is_brazil_taxpayer ? <Badge variant="marrom">BR taxpayer</Badge> : null}
        {client.is_us_nra ? <Badge variant="marrom">US NRA</Badge> : null}
        {client.domicile_country ? <span className="text-xs text-slate-400">Domicile {client.domicile_country}</span> : null}
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className={kpiClass}>
          <div className="text-xs uppercase tracking-wide text-slate-400">AUM</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-oxford">{formatCurrencyUS(aum)}</div>
          {snapshot ? <div className="text-xs text-slate-400">as of {snapshot.as_of}</div> : null}
        </div>
        <div className={kpiClass}>
          <div className="text-xs uppercase tracking-wide text-slate-400">30-day return</div>
          {activity ? (
            <div
              className={`mt-1 text-xl font-semibold tabular-nums ${
                (activity.metrics.twr ?? 0) >= 0 ? "text-verde" : "text-alert"
              }`}
            >
              {formatPercentUS((activity.metrics.twr ?? 0) * 100, 2)}
            </div>
          ) : (
            <div className="mt-1 text-xl text-slate-300">—</div>
          )}
        </div>
        <div className={kpiClass}>
          <div className="text-xs uppercase tracking-wide text-slate-400">Open flags</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${openFlags > 0 ? "text-alert" : "text-oxford"}`}>
            {openFlags}
          </div>
        </div>
        <div className={kpiClass}>
          <div className="text-xs uppercase tracking-wide text-slate-400">Next review</div>
          <div
            className={`mt-1 text-sm font-medium ${
              nextReview?.state === "overdue" ? "text-alert" : "text-oxford"
            }`}
          >
            {nextReview?.dueAt ? nextReview.dueAt.toLocaleDateString("en-US") : "—"}
          </div>
          {nextReview ? <div className="text-xs text-slate-400">{nextReview.detail}</div> : null}
        </div>
      </div>

      {activity ? (
        <div className="mb-6 rounded-card border border-hairline bg-white p-4 text-sm text-slate-600">
          <span className="font-medium text-oxford">{summarizeActivity(activity.metrics, "trailing_30d").headline}. </span>
          {summarizeActivity(activity.metrics, "trailing_30d").detail}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <ClientRelationship clientId={id} assessments={assessments} contacts={contacts} userName={userName} />

          {aiConfigured() ? (
            <AiDraftPanel
              title="Check-in message (AI draft)"
              description="Drafts a Portuguese check-in message grounded in the relationship timeline and recent portfolio movement."
              action={suggestClientCheckin.bind(null, id)}
              rows={6}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Accounts ({(accounts.data ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent>
              {(accounts.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">No accounts linked.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {(accounts.data ?? []).map((a) => (
                      <tr key={a.id} className="border-b border-hairline last:border-0">
                        <td className="py-2 font-mono text-oxford">{a.account_number_masked}</td>
                        <td className="py-2">
                          <Badge variant="celeste">{a.custodian}</Badge>
                        </td>
                        <td className="py-2 text-slate-500">{a.base_currency}</td>
                        <td className="py-2 text-right text-slate-400">{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Documents ({documents.length})</span>
                {snapshot ? (
                  <form action={generateClientStatement}>
                    <input type="hidden" name="clientId" value={id} />
                    <Button type="submit" variant="outline" size="sm">
                      Generate statement
                    </Button>
                  </form>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <form action={uploadDocument} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="clientId" value={id} />
                <select name="category" defaultValue="kyc" className={`${inputClass} w-36`}>
                  {["kyc", "agreement", "statement", "tax", "correspondence", "other"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="file"
                  name="file"
                  required
                  className="flex-1 text-sm text-slate-600 file:mr-2 file:rounded-lg file:border file:border-hairline file:bg-white file:px-3 file:py-1.5 file:text-sm"
                />
                <Button type="submit" size="sm">Upload</Button>
              </form>
              {documents.length === 0 ? (
                <p className="text-sm text-slate-400">No documents yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline text-sm">
                  {documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <a href={`/api/documents/${d.id}`} className="truncate font-medium text-royal hover:underline">
                          {d.name}
                        </a>
                        <div className="text-xs text-slate-400">
                          <Badge variant="default">{d.category}</Badge>{" "}
                          {new Date(d.created_at).toLocaleDateString("en-US")}
                          {d.size_bytes ? ` · ${Math.round(Number(d.size_bytes) / 1024)} KB` : ""}
                        </div>
                      </div>
                      <form action={deleteDocument}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="clientId" value={id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-alert">
                          Delete
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {/* Profile / KYC */}
          <Card>
            <CardHeader>
              <CardTitle>Profile &amp; KYC</CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <form action={updateClientProfile} className="flex flex-col gap-3 text-sm">
                  <input type="hidden" name="id" value={id} />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-slate-400">Name</span>
                    <input name="name" defaultValue={client.name} className={inputClass} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-slate-400">Type</span>
                      <select name="type" defaultValue={client.type} className={inputClass}>
                        {["individual", "joint", "entity", "trust"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-slate-400">Status</span>
                      <select name="status" defaultValue={client.status} className={inputClass}>
                        {["prospect", "active", "closed"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-slate-400">Risk profile</span>
                      <select name="riskProfile" defaultValue={client.risk_profile ?? ""} className={inputClass}>
                        <option value="">—</option>
                        {["conservador", "moderado", "agressivo"].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-slate-400">Domicile</span>
                      <input name="domicileCountry" maxLength={2} defaultValue={client.domicile_country ?? ""} className={inputClass} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-slate-400">Tax residency</span>
                      <input name="taxResidency" maxLength={2} defaultValue={client.tax_residency ?? ""} className={inputClass} />
                    </label>
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="isBrazilTaxpayer" defaultChecked={client.is_brazil_taxpayer} />
                    <span>Brazil taxpayer</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="isUsNra" defaultChecked={client.is_us_nra} />
                    <span>US non-resident alien (NRA)</span>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-slate-400">Notes</span>
                    <textarea name="notes" rows={3} defaultValue={client.notes ?? ""} className={inputClass} />
                  </label>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm">Save profile</Button>
                  </div>
                </form>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Type" value={client.type} />
                  <Field label="Risk profile" value={client.risk_profile ?? "—"} />
                  <Field label="Domicile" value={client.domicile_country ?? "—"} />
                  <Field label="Tax residency" value={client.tax_residency ?? "—"} />
                </dl>
              )}
            </CardContent>
          </Card>

          {/* Workflows */}
          <Card>
            <CardHeader>
              <CardTitle>Workflows</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {wfRuns.filter((r) => r.status !== "done" && r.status !== "canceled").length === 0 ? (
                <p className="text-sm text-slate-400">No active workflows.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {wfRuns
                    .filter((r) => r.status !== "done" && r.status !== "canceled")
                    .map((r) => (
                      <li key={r.id}>
                        <Link href={`/workflows/${r.id}`} className="flex items-center justify-between hover:underline">
                          <span className="truncate text-royal">{r.title}</span>
                          <Badge variant={r.status === "blocked" ? "alert" : "celeste"}>
                            {r.status.replace("_", " ")}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
              <form action={startWorkflow} className="flex gap-2">
                <input type="hidden" name="clientId" value={id} />
                <select name="templateId" className={inputClass}>
                  {wfTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm">Start</Button>
              </form>
            </CardContent>
          </Card>

          {/* Open tickets */}
          <Card>
            <CardHeader>
              <CardTitle>Open tickets ({(tickets.data ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent>
              {(tickets.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">No open tickets.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {(tickets.data ?? []).map((t) => (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.id}`} className="flex items-center justify-between hover:underline">
                        <span className="truncate text-royal">{t.number} · {t.title}</span>
                        <Badge variant={t.priority === "urgent" ? "alert" : "default"} className="capitalize">
                          {t.priority}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Proposals */}
          <Card>
            <CardHeader>
              <CardTitle>Proposals ({(proposals.data ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent>
              {(proposals.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">No proposals yet.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {(proposals.data ?? []).map((p) => (
                    <li key={p.id}>
                      <Link href={`/proposals/${p.id}`} className="flex items-center justify-between hover:underline">
                        <span className="text-royal">{p.month_year} · v{p.version}</span>
                        <Badge variant="default">{p.status.replace("_", " ")}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 capitalize text-oxford">{value}</dd>
    </div>
  );
}
