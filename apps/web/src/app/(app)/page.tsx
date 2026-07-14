import {
  INTAKE_STAGES,
  INTAKE_STATUS_LABEL,
  assessClientSla,
  formatCurrencyUS,
  worstSlaState,
} from "@ls/domain";
import { CalendarClock, FileText, Flag, Inbox, Plug, Ticket, Wallet } from "lucide-react";
import Link from "next/link";
import { requireUser, userSeesAll } from "@/lib/auth";
import {
  addeparConfigured,
  firmAum,
  intakeStageCounts,
  lastIntakeReceivedAt,
  lastSyncJob,
  openFlagsCount,
  slaBoard,
  ticketRailCounts,
  workQueue,
} from "@/lib/data";
import { WorkQueue } from "@/components/work-queue";
import { intakeWebhookConfigured } from "@/lib/intake/config";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export default async function DashboardPage() {
  const user = await requireUser();
  const [stageCounts, ticketCounts, lastReceived, syncJob, aum, flagsCount, sla, queue] =
    await Promise.all([
      intakeStageCounts(),
      ticketRailCounts(),
      lastIntakeReceivedAt(),
      lastSyncJob(),
      firmAum(),
      openFlagsCount(),
      slaBoard(),
      workQueue(user),
    ]);
  const slaAttention = sla.rows.filter((r) => {
    const worst = worstSlaState(
      assessClientSla(
        {
          riskProfile: r.riskProfile,
          lastTouchAt: r.lastTouchAt,
          activatedAt: r.activatedAt,
          oldestOpenBlockerAt: r.oldestOpenBlockerAt,
        },
        sla.policies,
      ),
    );
    return worst === "breached" || worst === "overdue" || worst === "due_soon";
  }).length;

  const syncFailed = syncJob?.status === "error";

  return (
    <div>
      <PageHeader
        title={`Good to see you, ${user.name || user.email}`}
        subtitle="Your day: what needs attention across your clients and the desk."
      />

      {syncFailed ? (
        <div className="mb-4 rounded-lg border border-alert/30 bg-alert/5 px-4 py-2.5 text-sm text-alert">
          Last Addepar sync failed: {syncJob?.error ?? "unknown error"}. The previous snapshot
          remains authoritative. See{" "}
          <Link href="/integrations" className="underline">
            Integrations
          </Link>
          .
        </div>
      ) : null}

      {/* The operating brain: action center leads the page */}
      <div
        className={`mb-6 grid gap-4 ${queue.opsQueue.length > 0 || userSeesAll(user) ? "lg:grid-cols-2" : ""}`}
      >
        <WorkQueue
          title="Needs your attention"
          subtitle="Reviews due, compliance flags, follow-ups and notable moves across your clients."
          items={queue.clientActions}
          emptyText="You're all caught up. No client actions pending."
        />
        {userSeesAll(user) ? (
          <WorkQueue
            title="Operations queue"
            subtitle="Unassigned and breaching tickets, intake triage, and data-quality items."
            items={queue.opsQueue}
            emptyText="Operations desk is clear."
          />
        ) : null}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <div className="text-sm font-semibold text-oxford">Addepar</div>
              <div className="text-xs text-slate-500">
                {syncJob?.finished_at
                  ? `Last sync ${new Date(syncJob.finished_at).toLocaleString("en-US")}`
                  : "Nightly sync"}
              </div>
            </div>
            {addeparConfigured() ? (
              syncFailed ? (
                <Badge variant="alert">Failed</Badge>
              ) : (
                <Badge variant="success">Connected</Badge>
              )
            ) : (
              <Badge>Not configured</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <div className="text-sm font-semibold text-oxford">Website Intake</div>
              <div className="text-xs text-slate-500">
                {lastReceived
                  ? `Last received ${new Date(lastReceived).toLocaleString("en-US")}`
                  : "Signed webhook + manual import"}
              </div>
            </div>
            {intakeWebhookConfigured() ? (
              <Badge variant="success">
                <span className="h-1.5 w-1.5 rounded-full bg-verde" /> Live
              </Badge>
            ) : (
              <Badge>Not configured</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <div className="text-sm font-semibold text-oxford">System</div>
              <div className="text-xs text-slate-500">Auth and audit online</div>
            </div>
            <Badge variant={syncFailed ? "alert" : "success"}>
              {syncFailed ? "Attention needed" : "All systems operational"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-royal" /> {userSeesAll(user) ? "Firm AUM" : "Your AUM"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aum ? (
                <>
                  <div className="text-2xl font-semibold tabular-nums text-oxford">
                    {formatCurrencyUS(aum.total)}
                  </div>
                  <div className="mb-2 text-xs text-slate-400">as of {aum.asOf}</div>
                  <div className="flex flex-col gap-1 text-sm">
                    {aum.byAdvisor.slice(0, 5).map((a) => (
                      <div key={a.advisor} className="flex items-center justify-between">
                        <span className="text-slate-500">{a.advisor}</span>
                        <span className="tabular-nums text-oxford">{formatCurrencyUS(a.mv)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Populates from the first Addepar snapshot.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-royal" /> Open Flags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-semibold tabular-nums ${flagsCount > 0 ? "text-alert" : "text-oxford"}`}
              >
                {flagsCount}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Unacknowledged portfolio flags across all households and clients.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-royal" /> Contacts due
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-semibold tabular-nums ${slaAttention > 0 ? "text-alert" : "text-oxford"}`}
              >
                {slaAttention}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Clients overdue or due soon against their SLA cadence.
              </p>
              <Link href="/contacts" className="mt-2 inline-block text-sm text-royal hover:underline">
                View contacts &amp; SLAs →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-royal" /> Client Intake Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {INTAKE_STAGES.map((stage) => (
                <div key={stage} className="flex items-center justify-between">
                  <span className="text-slate-500">{INTAKE_STATUS_LABEL[stage]}</span>
                  <span className="font-medium tabular-nums text-oxford">
                    {stageCounts[stage] ?? 0}
                  </span>
                </div>
              ))}
              <Link href="/intake" className="mt-2 text-sm text-royal hover:underline">
                View pipeline →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-royal" /> Support Tickets
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {ticketCounts.map((t) => (
                <div key={t.label} className="flex items-center justify-between">
                  <span className="text-slate-500">{t.label}</span>
                  <span
                    className={`font-medium tabular-nums ${
                      t.urgent && t.count > 0 ? "text-alert" : "text-oxford"
                    }`}
                  >
                    {t.count}
                  </span>
                </div>
              ))}
              <Link href="/tickets" className="mt-2 text-sm text-royal hover:underline">
                View tickets →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-royal" /> Addepar sync
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">
                {syncJob
                  ? `Last job: ${syncJob.kind} · ${syncJob.status}${
                      syncJob.error ? ` · ${syncJob.error}` : ""
                    }`
                  : "Holdings, transactions and TWR series populate after the first sync. Failed syncs surface here, never silently."}
              </p>
              <Link href="/integrations" className="mt-2 inline-block text-sm text-royal hover:underline">
                View integrations →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-royal" /> Proposals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">
                Draft, in-review and approved proposal counts arrive with the proposal engine in
                Phase 3.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Link href="/clients" className={buttonVariants({ variant: "primary" })}>
                Review Portfolios
              </Link>
              <Link href="/tickets/new" className={buttonVariants({ variant: "outline" })}>
                Open Ticket
              </Link>
              <Link href="/proposals" className={buttonVariants({ variant: "outline" })}>
                Generate Proposal
              </Link>
              {user.role === "admin" ? (
                <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
                  Manage Users
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
