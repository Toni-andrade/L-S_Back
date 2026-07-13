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

export async function holdingsForScope(
  scope: Scope,
  scopeId: string,
  snapshotId: string,
): Promise<(HoldingRow & { clientId: string })[]> {
  const supabase = await createClient();
  const accountIds = await accountIdsForScope(scope, scopeId);
  if (accountIds.length === 0) return [];
  const [{ data: holdings }, { data: accounts }] = await Promise.all([
    supabase
      .from("holdings")
      .select(
        "id, account_id, as_of, symbol, description, asset_class, quantity, price, market_value, currency, weight",
      )
      .eq("snapshot_id", snapshotId)
      .in("account_id", accountIds),
    supabase.from("accounts").select("id, client_id").in("id", accountIds),
  ]);
  const clientByAccount = new Map((accounts ?? []).map((a) => [a.id, a.client_id]));
  return (holdings ?? []).map((h) => ({
    ...h,
    market_value: Number(h.market_value),
    quantity: h.quantity === null ? null : Number(h.quantity),
    price: h.price === null ? null : Number(h.price),
    weight: h.weight === null ? null : Number(h.weight),
    clientId: clientByAccount.get(h.account_id) ?? "",
  }));
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

export function addeparConfigured(): boolean {
  return Boolean(
    process.env.ADDEPAR_SUBDOMAIN &&
      process.env.ADDEPAR_FIRM_ID &&
      process.env.ADDEPAR_API_KEY &&
      process.env.ADDEPAR_API_SECRET,
  );
}
