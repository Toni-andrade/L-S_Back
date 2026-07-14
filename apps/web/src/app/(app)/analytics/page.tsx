import { assessClientSla, formatCurrencyUS, worstSlaState } from "@ls/domain";
import { BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, userSeesAll } from "@/lib/auth";
import {
  complianceItems,
  firmAum,
  intakeStageCounts,
  openFlagsCount,
  slaBoard,
  ticketsList,
  workflowRuns,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/** Firm management analytics. Admin/ops only (firmwide read). */
export default async function AnalyticsPage() {
  const user = await requireUser();
  if (!userSeesAll(user)) redirect("/");

  const supabase = await createClient();
  const [aum, { data: clients }, intake, tickets, sla, flags, runs, compliance] = await Promise.all([
    firmAum(),
    supabase.from("clients").select("status"),
    intakeStageCounts(),
    ticketsList(),
    slaBoard(),
    openFlagsCount(),
    workflowRuns({ openOnly: true }),
    complianceItems(),
  ]);

  const clientCounts = (clients ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const openTickets = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed");
  const now = new Date();
  const breaching = openTickets.filter((t) => t.due_at && new Date(t.due_at) < now).length;
  const urgent = openTickets.filter((t) => t.priority === "urgent").length;

  const slaAttention = sla.rows.filter((r) => {
    const w = worstSlaState(
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
    return w === "breached" || w === "overdue" || w === "due_soon";
  }).length;

  const todayStr = now.toISOString().slice(0, 10);
  const complianceOverdue = compliance.filter(
    (c) => (c.status === "open" || c.status === "in_progress") && c.due_date && c.due_date <= todayStr,
  ).length;

  const intakePipeline = ["new_lead", "discovery_scheduled", "proposal_in_progress", "pending_onboarding"].reduce(
    (s, k) => s + (intake[k] ?? 0),
    0,
  );

  const kpis = [
    { label: "Firm AUM", value: aum ? formatCurrencyUS(aum.total) : "—", sub: aum ? `as of ${aum.asOf}` : "no snapshot" },
    { label: "Active clients", value: String(clientCounts.active ?? 0), sub: `${clientCounts.prospect ?? 0} prospects` },
    { label: "Intake pipeline", value: String(intakePipeline), sub: `${intake.new_lead ?? 0} new leads` },
    { label: "Open tickets", value: String(openTickets.length), sub: `${urgent} urgent · ${breaching} breaching`, alert: breaching > 0 },
    { label: "Contacts due", value: String(slaAttention), sub: "SLA overdue / due soon", alert: slaAttention > 0 },
    { label: "Open flags", value: String(flags), sub: "unacknowledged", alert: flags > 0 },
    { label: "Workflows in flight", value: String(runs.length), sub: "playbooks running" },
    { label: "Compliance overdue", value: String(complianceOverdue), sub: "past due items", alert: complianceOverdue > 0 },
  ];

  return (
    <div>
      <PageHeader
        title="Management analytics"
        subtitle="Firmwide health: AUM, clients, workload, SLA and compliance."
        action={<BarChart3 className="h-5 w-5 text-slate-400" />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-card border border-hairline bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{k.label}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${k.alert ? "text-alert" : "text-oxford"}`}>
              {k.value}
            </div>
            <div className="text-xs text-slate-400">{k.sub}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AUM by advisor</CardTitle>
        </CardHeader>
        <CardContent>
          {!aum || aum.byAdvisor.length === 0 ? (
            <p className="text-sm text-slate-400">Populates from the latest Addepar snapshot.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {aum.byAdvisor.map((a) => {
                const pct = aum.total > 0 ? (a.mv / aum.total) * 100 : 0;
                return (
                  <li key={a.advisor} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate text-slate-600">{a.advisor}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-app-bg">
                      <div className="h-full rounded-full bg-royal" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-28 text-right tabular-nums text-oxford">{formatCurrencyUS(a.mv)}</span>
                    <span className="w-12 text-right text-xs text-slate-400">{pct.toFixed(0)}%</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
