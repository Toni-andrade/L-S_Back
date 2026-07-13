import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { addeparConfigured, lastIntakeReceivedAt } from "@/lib/data";
import { intakeWebhookConfigured } from "@/lib/intake/config";
import { createClient } from "@/lib/supabase/server";

type UnmappedEntry = { id: string | number; name: string | null };

export default async function IntegrationsPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: jobs }, lastReceived] = await Promise.all([
    supabase
      .from("sync_jobs")
      .select("id, kind, status, stats, error, started_at, finished_at, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    lastIntakeReceivedAt(),
  ]);

  const lastFinished = (jobs ?? []).find((j) => j.status === "done" || j.status === "error");
  const stats = (lastFinished?.stats ?? {}) as {
    unmapped_entities?: UnmappedEntry[];
    unmapped_groups?: UnmappedEntry[];
    positions?: number;
    transactions_upserted?: number;
    twr_unavailable?: boolean;
    transactions_unavailable?: boolean;
  };
  const unmappedEntities = stats.unmapped_entities ?? [];
  const unmappedGroups = stats.unmapped_groups ?? [];

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Feed health, sync history and entity mapping for external systems."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <div className="text-sm font-semibold text-oxford">Addepar</div>
              <div className="text-xs text-slate-500">
                Nightly sync 10:30 UTC (Vercel Cron) + on-demand refresh.
                {lastFinished?.finished_at
                  ? ` Last run ${new Date(lastFinished.finished_at).toLocaleString("en-US")}.`
                  : " No runs yet."}
              </div>
            </div>
            {addeparConfigured() ? (
              lastFinished?.status === "error" ? (
                <Badge variant="alert">Last sync failed</Badge>
              ) : (
                <Badge variant="success">Connected</Badge>
              )
            ) : (
              <Badge variant="marrom">Awaiting credentials (Open Item 1)</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <div className="text-sm font-semibold text-oxford">Website Intake</div>
              <div className="text-xs text-slate-500">
                HMAC-signed webhook at /api/intake, manual JSON/CSV import fallback.
                {lastReceived
                  ? ` Last received ${new Date(lastReceived).toLocaleString("en-US")}.`
                  : " Nothing received yet."}
              </div>
            </div>
            {intakeWebhookConfigured() ? (
              <Badge variant="success">
                <span className="h-1.5 w-1.5 rounded-full bg-verde" /> Live
              </Badge>
            ) : (
              <Badge variant="marrom">Awaiting secret (Open Item 2)</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {(stats.twr_unavailable || stats.transactions_unavailable) && (
        <div className="mb-4 rounded-lg border border-marrom/30 bg-marrom/5 px-4 py-2.5 text-sm text-marrom">
          Addepar licensing gaps detected on the last sync:
          {stats.twr_unavailable ? " TWR attributes returned 403 (performance cards degrade)." : ""}
          {stats.transactions_unavailable ? " Transaction attributes returned 403." : ""}{" "}
          Confirm API licensing with Addepar (Open Item 8).
        </div>
      )}

      {(unmappedEntities.length > 0 || unmappedGroups.length > 0) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              Unmapped Addepar records{" "}
              <span className="text-xs font-normal text-slate-400">
                (reported, never auto-created; map via clients/accounts/households)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                Entities ({unmappedEntities.length})
              </div>
              <ul className="flex flex-col gap-1 text-sm text-slate-600">
                {unmappedEntities.slice(0, 25).map((e) => (
                  <li key={String(e.id)}>
                    <span className="font-mono text-xs text-slate-400">{String(e.id)}</span>{" "}
                    {e.name ?? "unnamed"}
                  </li>
                ))}
                {unmappedEntities.length > 25 ? (
                  <li className="text-xs text-slate-400">
                    +{unmappedEntities.length - 25} more (see sync stats)
                  </li>
                ) : null}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                Groups ({unmappedGroups.length})
              </div>
              <ul className="flex flex-col gap-1 text-sm text-slate-600">
                {unmappedGroups.slice(0, 25).map((g) => (
                  <li key={String(g.id)}>
                    <span className="font-mono text-xs text-slate-400">{String(g.id)}</span>{" "}
                    {g.name ?? "unnamed"}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sync history</CardTitle>
        </CardHeader>
        <CardContent>
          {(jobs ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              No sync jobs yet. The nightly cron runs at 10:30 UTC once Addepar credentials are
              configured; on-demand refresh is available on review pages.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Kind</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Positions</th>
                  <th className="py-2 font-medium">Transactions</th>
                  <th className="py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {(jobs ?? []).map((j) => {
                  const s = (j.stats ?? {}) as { positions?: number; transactions_upserted?: number };
                  return (
                    <tr key={j.id} className="border-b border-hairline last:border-0">
                      <td className="py-2 text-slate-500">
                        {new Date(j.started_at ?? j.created_at).toLocaleString("en-US")}
                      </td>
                      <td className="py-2 text-slate-500">{j.kind}</td>
                      <td className="py-2">
                        <Badge
                          variant={
                            j.status === "done"
                              ? "success"
                              : j.status === "error"
                                ? "alert"
                                : "celeste"
                          }
                        >
                          {j.status}
                        </Badge>
                      </td>
                      <td className="py-2 tabular-nums text-slate-500">{s.positions ?? "—"}</td>
                      <td className="py-2 tabular-nums text-slate-500">
                        {s.transactions_upserted ?? "—"}
                      </td>
                      <td className="py-2 text-xs text-alert">{j.error ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
