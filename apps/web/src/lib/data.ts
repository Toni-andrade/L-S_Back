import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Scope = "household" | "client";

export type HoldingRow = {
  id: string;
  account_id: string;
  as_of: string;
  symbol: string | null;
  description: string | null;
  asset_class: string | null;
  quantity: number | null;
  price: number | null;
  market_value: number;
  currency: string;
  weight: number | null;
  cost_basis: number | null;
  unrealized_gain: number | null;
  twr_ytd: number | null;
  twr_1y: number | null;
  maturity_date: string | null;
  coupon_rate: number | null;
  modified_duration: number | null;
};

export type AccountRow = {
  id: string;
  client_id: string;
  custodian: "ibkr" | "morgan_stanley" | "other";
  account_number_masked: string;
  addepar_entity_id: string | null;
  base_currency: string;
  status: string;
};

export type ClientRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  advisor_id: string | null;
  household_id: string | null;
  domicile_country: string | null;
  tax_residency: string | null;
  is_brazil_taxpayer: boolean;
  is_us_nra: boolean;
  risk_profile: "conservador" | "moderado" | "agressivo" | null;
  addepar_entity_id: string | null;
};

/** Account ids belonging to a scope (household = all member clients' accounts). */
export async function accountIdsForScope(scope: Scope, scopeId: string): Promise<string[]> {
  const supabase = await createClient();
  if (scope === "client") {
    const { data } = await supabase.from("accounts").select("id").eq("client_id", scopeId);
    return (data ?? []).map((a) => a.id);
  }
  const { data: clients } = await supabase.from("clients").select("id").eq("household_id", scopeId);
  const clientIds = (clients ?? []).map((c) => c.id);
  if (clientIds.length === 0) return [];
  const { data } = await supabase.from("accounts").select("id").in("client_id", clientIds);
  return (data ?? []).map((a) => a.id);
}

export async function latestSnapshot(): Promise<{ id: string; as_of: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("snapshots")
    .select("id, as_of")
    .order("as_of", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function snapshotByDate(asOf: string): Promise<{ id: string; as_of: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("snapshots")
    .select("id, as_of")
    .eq("as_of", asOf)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function snapshotDates(limit = 30): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("snapshots")
    .select("as_of")
    .order("as_of", { ascending: false })
    .limit(limit);
  return [...new Set((data ?? []).map((s) => s.as_of))];
}

export type HoldingWithAccount = HoldingRow & {
  clientId: string;
  custodian: string;
  accountMasked: string;
};

export async function holdingsForScope(
  scope: Scope,
  scopeId: string,
  snapshotId: string,
): Promise<HoldingWithAccount[]> {
  const supabase = await createClient();
  const accountIds = await accountIdsForScope(scope, scopeId);
  if (accountIds.length === 0) return [];
  const [{ data: holdings }, { data: accounts }] = await Promise.all([
    supabase
      .from("holdings")
      .select(
        "id, account_id, as_of, symbol, description, asset_class, quantity, price, market_value, currency, weight, cost_basis, unrealized_gain, twr_ytd, twr_1y, maturity_date, coupon_rate, modified_duration",
      )
      .eq("snapshot_id", snapshotId)
      .in("account_id", accountIds),
    supabase
      .from("accounts")
      .select("id, client_id, custodian, account_number_masked")
      .in("id", accountIds),
  ]);
  const byAccount = new Map((accounts ?? []).map((a) => [a.id, a]));
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return (holdings ?? []).map((h) => {
    const acct = byAccount.get(h.account_id);
    return {
      ...h,
      market_value: Number(h.market_value),
      quantity: n(h.quantity),
      price: n(h.price),
      weight: n(h.weight),
      cost_basis: n(h.cost_basis),
      unrealized_gain: n(h.unrealized_gain),
      twr_ytd: n(h.twr_ytd),
      twr_1y: n(h.twr_1y),
      coupon_rate: n(h.coupon_rate),
      modified_duration: n(h.modified_duration),
      maturity_date: h.maturity_date ?? null,
      clientId: acct?.client_id ?? "",
      custodian: acct?.custodian ?? "other",
      accountMasked: acct?.account_number_masked ?? "",
    };
  });
}

export async function transactionsForScope(
  scope: Scope,
  scopeId: string,
  opts: { sinceDate?: string; limit?: number } = {},
) {
  const supabase = await createClient();
  const accountIds = await accountIdsForScope(scope, scopeId);
  if (accountIds.length === 0) return [];
  let query = supabase
    .from("transactions")
    .select("id, account_id, trade_date, activity, description, symbol, amount, currency")
    .in("account_id", accountIds)
    .order("trade_date", { ascending: false });
  if (opts.sinceDate) query = query.gte("trade_date", opts.sinceDate);
  if (opts.limit) query = query.limit(opts.limit);
  const { data } = await query;
  return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
}

export async function performanceSeries(scope: Scope, scopeId: string, period: "ytd" | "one_year") {
  const supabase = await createClient();
  const { data } = await supabase
    .from("performance_points")
    .select("as_of, twr, benchmark_twr")
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .eq("period", period)
    .order("as_of");
  return (data ?? []).map((p) => ({
    as_of: p.as_of,
    twr: Number(p.twr),
    benchmark_twr: p.benchmark_twr === null ? null : Number(p.benchmark_twr),
  }));
}

export async function flagsForScope(scope: Scope, scopeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("portfolio_flags")
    .select("id, code, severity, message, acknowledged_by, acknowledged_at, ack_reason, created_at")
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function lastReview(scope: Scope, scopeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("portfolio_reviews")
    .select("reviewed_at, reviewed_by, notes")
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function riskFactors() {
  const supabase = await createClient();
  const { data } = await supabase.from("risk_factors").select("asset_class, factor, vol_assumption");
  return (data ?? []).map((f) => ({
    assetClass: f.asset_class,
    factor: Number(f.factor),
    volAssumption: Number(f.vol_assumption),
  }));
}

export async function lastSyncJob(kinds: string[] = ["addepar_nightly", "addepar_on_demand"]) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sync_jobs")
    .select("id, kind, status, stats, error, started_at, finished_at, created_at")
    .in("kind", kinds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Intake + tickets (Phase 2)
// ---------------------------------------------------------------------------

export async function intakeStageCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("intake_submissions").select("status");
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

export async function lastIntakeReceivedAt(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("intake_submissions")
    .select("received_at")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.received_at ?? null;
}

export type TicketListRow = {
  id: string;
  number: string;
  title: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "new" | "in_progress" | "waiting_client" | "waiting_custodian" | "resolved" | "closed";
  assignee_id: string | null;
  created_by: string;
  client_id: string | null;
  due_at: string | null;
  created_at: string;
};

export async function ticketsList(): Promise<TicketListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select(
      "id, number, title, category, priority, status, assignee_id, created_by, client_id, due_at, created_at",
    )
    .order("created_at", { ascending: false });
  return (data ?? []) as TicketListRow[];
}

/** Right-rail / dashboard counts: Open, Urgent, Pending Reply, Due Today. */
export async function ticketRailCounts(): Promise<
  { label: string; count: number; urgent?: boolean }[]
> {
  const tickets = await ticketsList();
  const open = tickets.filter(
    (t) => t.status !== "resolved" && t.status !== "closed",
  );
  const now = new Date();
  const dueToday = open.filter((t) => {
    if (!t.due_at) return false;
    const due = new Date(t.due_at);
    return (
      due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate()
    );
  });
  return [
    { label: "Open", count: open.length },
    { label: "Urgent", count: open.filter((t) => t.priority === "urgent").length, urgent: true },
    { label: "Pending Reply", count: open.filter((t) => t.status === "waiting_client").length },
    { label: "Due Today", count: dueToday.length },
  ];
}

// ---------------------------------------------------------------------------
// Firm dashboard (Phase 4): total AUM, AUM by advisor, open flags
// ---------------------------------------------------------------------------

export async function firmAum(): Promise<{
  total: number;
  asOf: string;
  byAdvisor: { advisor: string; mv: number }[];
} | null> {
  const snapshot = await latestSnapshot();
  if (!snapshot) return null;

  const supabase = await createClient();
  const [{ data: holdings }, { data: accounts }, { data: clients }, { data: users }] =
    await Promise.all([
      supabase.from("holdings").select("account_id, market_value").eq("snapshot_id", snapshot.id),
      supabase.from("accounts").select("id, client_id"),
      supabase.from("clients").select("id, advisor_id"),
      supabase.from("users").select("id, name, email"),
    ]);
  if (!holdings || holdings.length === 0) return null;

  const clientByAccount = new Map((accounts ?? []).map((a) => [a.id, a.client_id]));
  const advisorByClient = new Map((clients ?? []).map((c) => [c.id, c.advisor_id]));
  const nameByUser = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));

  let total = 0;
  const byAdvisorMap = new Map<string, number>();
  for (const h of holdings) {
    const mv = Number(h.market_value);
    total += mv;
    const clientId = clientByAccount.get(h.account_id);
    const advisorId = clientId ? advisorByClient.get(clientId) : null;
    const label = advisorId ? (nameByUser.get(advisorId) ?? "Unknown advisor") : "Unassigned";
    byAdvisorMap.set(label, (byAdvisorMap.get(label) ?? 0) + mv);
  }
  const byAdvisor = [...byAdvisorMap.entries()]
    .map(([advisor, mv]) => ({ advisor, mv }))
    .sort((a, b) => b.mv - a.mv);
  return { total, asOf: snapshot.as_of, byAdvisor };
}

export async function openFlagsCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("portfolio_flags")
    .select("id", { count: "exact", head: true })
    .is("acknowledged_at", null);
  return count ?? 0;
}

export async function activityForScope(
  scope: Scope,
  scopeId: string,
  period: "trailing_30d" | "ytd" | "one_year" = "trailing_30d",
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("portfolio_activity")
    .select(
      "twr, change_in_value, percent_change, net_flows, income, dividends, market_change, movers, as_of, period",
    )
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .eq("period", period)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    metrics: {
      twr: data.twr === null ? null : Number(data.twr),
      changeInValue: data.change_in_value === null ? null : Number(data.change_in_value),
      percentChange: data.percent_change === null ? null : Number(data.percent_change),
      netFlows: data.net_flows === null ? null : Number(data.net_flows),
      income: data.income === null ? null : Number(data.income),
      dividends: data.dividends === null ? null : Number(data.dividends),
      marketChange: data.market_change === null ? null : Number(data.market_change),
    },
    movers: (data.movers ?? null) as
      | { name: string | null; symbol: string | null; change: number }[]
      | null,
    asOf: data.as_of as string,
  };
}

// ---------------------------------------------------------------------------
// Contacts + SLA (Phase: contact timelines)
// ---------------------------------------------------------------------------
import { assessClientSla, type SlaPolicy } from "@ls/domain";

export async function slaPolicies(): Promise<SlaPolicy[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sla_policies")
    .select("kind, name, threshold_days, business_days, applies_to, active")
    .eq("active", true);
  return (data ?? []).map((p) => ({
    kind: p.kind,
    name: p.name,
    thresholdDays: Number(p.threshold_days),
    businessDays: p.business_days,
    appliesTo: (p.applies_to ?? {}) as { risk_profile?: string[] },
  }));
}

export async function contactsForClient(clientId: string, limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, type, direction, occurred_at, subject, notes, logged_by, follow_up_at")
    .eq("client_id", clientId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Latest "touch" for a client: newest of any contact or portfolio review. */
export async function lastTouchForClient(clientId: string): Promise<Date | null> {
  const supabase = await createClient();
  const [{ data: c }, { data: r }] = await Promise.all([
    supabase
      .from("contacts")
      .select("occurred_at")
      .eq("client_id", clientId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("portfolio_reviews")
      .select("reviewed_at")
      .eq("scope", "client")
      .eq("scope_id", clientId)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const times = [c?.occurred_at, r?.reviewed_at].filter(Boolean).map((t) => new Date(t as string));
  return times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
}

export async function oldestOpenBlockerForClient(clientId: string): Promise<Date | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("portfolio_flags")
    .select("created_at")
    .eq("scope", "client")
    .eq("scope_id", clientId)
    .eq("severity", "blocker")
    .is("acknowledged_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.created_at ? new Date(data.created_at) : null;
}

/** SLA board across all visible clients (RLS-scoped). */
export async function slaBoard() {
  const supabase = await createClient();
  const [{ data: clients }, policies] = await Promise.all([
    supabase.from("clients").select("id, name, risk_profile, status, created_at"),
    slaPolicies(),
  ]);
  const rows = await Promise.all(
    (clients ?? []).map(async (c) => ({
      id: c.id,
      name: c.name,
      riskProfile: c.risk_profile as
        | "conservador"
        | "moderado"
        | "agressivo"
        | null,
      status: c.status,
      lastTouchAt: await lastTouchForClient(c.id),
      oldestOpenBlockerAt: await oldestOpenBlockerForClient(c.id),
      activatedAt: c.status === "active" ? new Date(c.created_at) : null,
    })),
  );
  return { rows, policies };
}

export async function complianceItems() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compliance_items")
    .select("id, kind, title, description, due_date, status, recurring, resolved_at")
    .order("due_date", { ascending: true, nullsFirst: false });
  return data ?? [];
}

export async function documentsForClient(clientId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, category, name, mime_type, size_bytes, uploaded_by, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Workflow playbooks
// ---------------------------------------------------------------------------
export async function workflowTemplates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workflow_templates")
    .select("id, key, name, kind, description")
    .eq("active", true)
    .order("name");
  return data ?? [];
}

export async function workflowRuns(opts: { clientId?: string; openOnly?: boolean } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("workflow_runs")
    .select("id, kind, title, status, client_id, assigned_to, created_at")
    .order("created_at", { ascending: false });
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (opts.openOnly) q = q.not("status", "in", "(done,canceled)");
  const { data } = await q;
  return data ?? [];
}

export async function workflowRunWithSteps(runId: string) {
  const supabase = await createClient();
  const [{ data: run }, { data: steps }] = await Promise.all([
    supabase
      .from("workflow_runs")
      .select("id, kind, title, status, client_id, assigned_to, started_by, created_at, completed_at")
      .eq("id", runId)
      .maybeSingle(),
    supabase
      .from("workflow_run_steps")
      .select("id, seq, title, role, required, status, completed_by, completed_at")
      .eq("run_id", runId)
      .order("seq"),
  ]);
  return { run, steps: steps ?? [] };
}

// ---------------------------------------------------------------------------
// Work queue: the per-persona action center ("My Day" + Ops queue).
// Read-only aggregation over flags, SLA, follow-ups, movements, tickets, intake
// and sync. Client-scoped items respect RLS automatically.
// ---------------------------------------------------------------------------
export type ActionItem = {
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  subtitle: string;
  href: string;
};

const SEV_RANK: Record<ActionItem["severity"], number> = { high: 0, medium: 1, low: 2 };
const bySeverity = (a: ActionItem, b: ActionItem) => SEV_RANK[a.severity] - SEV_RANK[b.severity];

export async function workQueue(user: {
  id: string;
  role: "advisor" | "ops" | "admin";
}): Promise<{ clientActions: ActionItem[]; opsQueue: ActionItem[] }> {
  const supabase = await createClient();
  const seesAll = user.role === "admin" || user.role === "ops";

  const [{ data: clients }, { data: households }] = await Promise.all([
    supabase.from("clients").select("id, name"),
    supabase.from("households").select("id, name"),
  ]);
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const hhName = new Map((households ?? []).map((h) => [h.id, h.name]));
  const nameFor = (scope: string, id: string) =>
    scope === "household" ? (hhName.get(id) ?? "Household") : (clientName.get(id) ?? "Client");

  const clientActions: ActionItem[] = [];

  // SLA: reviews due, onboarding, flag-response
  const { rows, policies } = await slaBoard();
  for (const r of rows) {
    const assess = assessClientSla(
      {
        riskProfile: r.riskProfile,
        lastTouchAt: r.lastTouchAt,
        activatedAt: r.activatedAt,
        oldestOpenBlockerAt: r.oldestOpenBlockerAt,
      },
      policies,
    );
    for (const a of assess) {
      if (a.state === "ok" || a.state === "none") continue;
      clientActions.push({
        kind: a.kind,
        severity: a.state === "breached" || a.state === "overdue" ? "high" : "medium",
        title: `${
          a.kind === "periodic_review"
            ? "Review due"
            : a.kind === "flag_response"
              ? "Flag response"
              : "Onboarding contact"
        }: ${r.name}`,
        subtitle: a.detail,
        href: `/portfolio-review/client/${r.id}`,
      });
    }
  }

  // Open compliance flags
  const { data: flags } = await supabase
    .from("portfolio_flags")
    .select("id, scope, scope_id, severity, code, message")
    .is("acknowledged_at", null)
    .limit(40);
  for (const f of flags ?? []) {
    clientActions.push({
      kind: "flag",
      severity: f.severity === "blocker" ? "high" : "medium",
      title: `${f.code}: ${nameFor(f.scope, f.scope_id)}`,
      subtitle: f.message,
      href: `/portfolio-review/${f.scope}/${f.scope_id}`,
    });
  }

  // Follow-ups due
  const { data: followups } = await supabase
    .from("contacts")
    .select("id, client_id, subject, follow_up_at")
    .not("follow_up_at", "is", null)
    .lte("follow_up_at", new Date().toISOString())
    .order("follow_up_at")
    .limit(30);
  for (const c of followups ?? []) {
    clientActions.push({
      kind: "follow_up",
      severity: "medium",
      title: `Follow-up: ${clientName.get(c.client_id) ?? "Client"}`,
      subtitle: c.subject ?? "Scheduled follow-up",
      href: `/portfolio-review/client/${c.client_id}`,
    });
  }

  // Notable 30-day movements
  const { data: act } = await supabase
    .from("portfolio_activity")
    .select("scope, scope_id, twr")
    .eq("period", "trailing_30d");
  for (const a of act ?? []) {
    const twr = a.twr === null ? null : Number(a.twr);
    if (twr !== null && Math.abs(twr) >= 0.05) {
      clientActions.push({
        kind: "movement",
        severity: Math.abs(twr) >= 0.1 ? "high" : "low",
        title: `${twr >= 0 ? "Up" : "Down"} ${(Math.abs(twr) * 100).toFixed(1)}% this month: ${nameFor(a.scope, a.scope_id)}`,
        subtitle: "Notable 30-day performance to review with the client",
        href: `/portfolio-review/${a.scope}/${a.scope_id}`,
      });
    }
  }

  // Tickets assigned to me
  const { data: myTickets } = await supabase
    .from("tickets")
    .select("id, number, title, priority, status")
    .eq("assignee_id", user.id)
    .not("status", "in", "(resolved,closed)")
    .limit(20);
  for (const t of myTickets ?? []) {
    clientActions.push({
      kind: "ticket",
      severity: t.priority === "urgent" ? "high" : t.priority === "high" ? "medium" : "low",
      title: `${t.number}: ${t.title}`,
      subtitle: `Assigned to you · ${t.priority}`,
      href: `/tickets/${t.id}`,
    });
  }

  // -------- Operations queue (ops + admin) --------
  const opsQueue: ActionItem[] = [];
  if (seesAll) {
    const tickets = await ticketsList();
    const now = new Date();
    for (const t of tickets) {
      if (t.status === "resolved" || t.status === "closed") continue;
      if (t.assignee_id === null) {
        opsQueue.push({
          kind: "ticket_unassigned",
          severity: t.priority === "urgent" ? "high" : "medium",
          title: `${t.number}: ${t.title}`,
          subtitle: `Unassigned · ${t.priority}`,
          href: `/tickets/${t.id}`,
        });
      } else if (t.due_at && new Date(t.due_at) < now) {
        opsQueue.push({
          kind: "ticket_breach",
          severity: "high",
          title: `${t.number}: ${t.title}`,
          subtitle: "SLA breached",
          href: `/tickets/${t.id}`,
        });
      } else if (t.status === "waiting_custodian") {
        opsQueue.push({
          kind: "ticket_custodian",
          severity: "low",
          title: `${t.number}: ${t.title}`,
          subtitle: "Waiting on custodian",
          href: `/tickets/${t.id}`,
        });
      }
    }

    const counts = await intakeStageCounts();
    if ((counts.new_lead ?? 0) > 0) {
      opsQueue.push({
        kind: "intake",
        severity: "medium",
        title: `${counts.new_lead} new intake lead(s)`,
        subtitle: "Awaiting triage",
        href: "/intake?stage=new_lead",
      });
    }

    // Open workflow runs (playbooks in flight)
    const runs = await workflowRuns({ openOnly: true });
    for (const r of runs) {
      opsQueue.push({
        kind: "workflow",
        severity: r.status === "blocked" ? "high" : "medium",
        title: r.title,
        subtitle: `Playbook · ${r.status.replace("_", " ")}`,
        href: `/workflows/${r.id}`,
      });
    }

    // Compliance items due / overdue
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: compliance } = await supabase
      .from("compliance_items")
      .select("id, title, due_date, status")
      .in("status", ["open", "in_progress"])
      .not("due_date", "is", null)
      .lte("due_date", todayStr);
    for (const c of compliance ?? []) {
      opsQueue.push({
        kind: "compliance",
        severity: "high",
        title: `Compliance due: ${c.title}`,
        subtitle: `Due ${c.due_date}`,
        href: "/compliance",
      });
    }

    const job = await lastSyncJob();
    if (job?.status === "error") {
      opsQueue.push({
        kind: "sync_error",
        severity: "high",
        title: "Addepar sync failed",
        subtitle: job.error ?? "See Integrations",
        href: "/integrations",
      });
    }
    const stats = (job?.stats ?? {}) as {
      unmapped_entities?: unknown[];
      unmapped_groups?: unknown[];
    };
    const unmapped = (stats.unmapped_entities?.length ?? 0) + (stats.unmapped_groups?.length ?? 0);
    if (unmapped > 0) {
      opsQueue.push({
        kind: "unmapped",
        severity: "low",
        title: `${unmapped} unmapped Addepar record(s)`,
        subtitle: "Map to clients / accounts under Integrations",
        href: "/integrations",
      });
    }
  }

  clientActions.sort(bySeverity);
  opsQueue.sort(bySeverity);
  return { clientActions, opsQueue };
}

export function addeparConfigured(): boolean {
  return Boolean(
    process.env.ADDEPAR_SUBDOMAIN &&
      process.env.ADDEPAR_FIRM_ID &&
      process.env.ADDEPAR_API_KEY &&
      process.env.ADDEPAR_API_SECRET,
  );
}
