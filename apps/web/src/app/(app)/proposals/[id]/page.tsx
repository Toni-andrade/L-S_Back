import { formatCurrencyUS } from "@ls/domain";
import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  acknowledgeProposalFlag,
  approveProposal,
  generateProposalArtifacts,
  markProposalSent,
  submitProposalForReview,
} from "@/lib/actions/proposals";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT = {
  draft: "default",
  in_review: "celeste",
  approved: "success",
  sent: "royal",
  superseded: "marrom",
} as const;

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!p) notFound();

  const { data: flags } = await supabase
    .from("proposal_flags")
    .select("id, code, severity, message, acknowledged_at, ack_reason")
    .eq("proposal_id", id)
    .order("severity", { ascending: false })
    .order("created_at");

  const unackedBlockers = (flags ?? []).filter(
    (f) => f.severity === "blocker" && !f.acknowledged_at,
  );
  const allocation = (p.allocation ?? []) as {
    key: string;
    name: string;
    weight: number;
    risk_label: string | null;
    return_source: string;
  }[];

  const status = p.status as keyof typeof STATUS_VARIANT;

  return (
    <div>
      <PageHeader
        title={`${p.client_name} · ${p.month_year}`}
        subtitle={`Proposal v${p.version} · ${formatCurrencyUS(Number(p.total_aum))} · perfil ${p.risk_profile}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[status]}>{status.replace("_", " ")}</Badge>
        {p.locked ? <Badge variant="marrom">Locked (immutable)</Badge> : null}
        {p.pptx_path ? (
          <a
            href={`/api/proposals/${p.id}/pptx`}
            className="inline-flex items-center gap-1 text-sm text-royal hover:underline"
          >
            <Download className="h-3.5 w-3.5" /> PPTX
          </a>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 font-medium">Strategy</th>
                    <th className="py-2 text-right font-medium">Weight</th>
                    <th className="py-2 font-medium">Risk</th>
                    <th className="py-2 font-medium">Return source</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation.map((row) => (
                    <tr key={row.key} className="border-b border-hairline last:border-0">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 text-right tabular-nums">{row.weight}%</td>
                      <td className="py-2 text-slate-500">{row.risk_label ?? "n/d"}</td>
                      <td className="py-2 capitalize text-slate-500">{row.return_source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Flags ({unackedBlockers.length} blocking approval)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {(flags ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No flags. Clean proposal.</p>
              ) : (
                (flags ?? []).map((f) => (
                  <div key={f.id} className="rounded-lg border border-hairline p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.severity === "blocker" ? "alert" : "marrom"}>
                        {f.severity}
                      </Badge>
                      <span className="font-mono text-xs text-slate-400">{f.code}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-oxford">{f.message}</p>
                    {f.acknowledged_at ? (
                      <p className="mt-1.5 text-xs text-verde">
                        Acknowledged: {f.ack_reason}
                      </p>
                    ) : (
                      <form action={acknowledgeProposalFlag} className="mt-2 flex gap-2">
                        <input type="hidden" name="flagId" value={f.id} />
                        <input
                          name="reason"
                          required
                          minLength={3}
                          placeholder="Reason (required, audited)"
                          className="flex-1 rounded-lg border border-hairline px-3 py-1.5 text-sm focus:border-royal focus:outline-none"
                        />
                        <Button type="submit" variant="outline">
                          Acknowledge
                        </Button>
                      </form>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {p.email_draft ? (
            <Card>
              <CardHeader>
                <CardTitle>Email draft (copy-paste; the platform never sends email)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-lg bg-app-bg p-3 text-xs text-oxford">
                  {p.email_draft}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {status === "draft" ? (
                <>
                  <Link
                    href={`/proposals/new?draft=${p.id}`}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Edit Draft
                  </Link>
                  <form action={submitProposalForReview}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" className="w-full">
                      Submit for Review
                    </Button>
                  </form>
                </>
              ) : null}

              {status === "in_review" ? (
                unackedBlockers.length > 0 ? (
                  <Button disabled className="w-full" title="Unacknowledged blockers gate approval">
                    Approve ({unackedBlockers.length} blocker{unackedBlockers.length > 1 ? "s" : ""})
                  </Button>
                ) : (
                  <form action={approveProposal}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" className="w-full">
                      Approve &amp; Lock
                    </Button>
                  </form>
                )
              ) : null}

              {status === "approved" ? (
                <form action={markProposalSent}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" className="w-full">
                    Mark Sent
                  </Button>
                </form>
              ) : null}

              {(status === "approved" || status === "sent") && (
                <Link
                  href={`/proposals/new?from=${p.id}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Revise (new version)
                </Link>
              )}

              {status !== "superseded" ? (
                <form action={generateProposalArtifacts}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" variant="outline" className="w-full">
                    {p.pptx_path ? "Regenerate Artifacts" : "Generate PPTX + Email"}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-slate-400">
                  Superseded by a newer version; read-only.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 text-xs text-slate-400">
              Created {new Date(p.created_at).toLocaleString("en-US")}.
              {p.approved_at
                ? ` Approved ${new Date(p.approved_at).toLocaleString("en-US")}.`
                : ""}
              {p.supersedes_id ? (
                <>
                  {" "}
                  <Link href={`/proposals/${p.supersedes_id}`} className="text-royal hover:underline">
                    Previous version →
                  </Link>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
