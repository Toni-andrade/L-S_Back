import "server-only";
import {
  evaluatePortfolioFlags,
  type BlockedIssuerLike,
  type ClientLike,
  type RiskFactorLike,
} from "@ls/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recomputes flags for one scope from the given snapshot and stores them.
 * Unacknowledged flags are replaced wholesale; acknowledged flags are kept
 * (they carry the ack reason for the audit trail).
 * Runs with the service client (called from sync workers and the seed path).
 */
export async function recomputeFlagsForScope(
  service: SupabaseClient,
  scope: "household" | "client",
  scopeId: string,
  snapshotId: string,
  snapshotAsOf: string,
  today = new Date(),
): Promise<number> {
  const clientsQuery =
    scope === "household"
      ? service.from("clients").select("*").eq("household_id", scopeId)
      : service.from("clients").select("*").eq("id", scopeId);
  const { data: clients } = await clientsQuery;
  if (!clients || clients.length === 0) return 0;

  const clientIds = clients.map((c) => c.id);
  const { data: accounts } = await service
    .from("accounts")
    .select("id, client_id")
    .in("client_id", clientIds);
  const accountIds = (accounts ?? []).map((a) => a.id);
  const clientByAccount = new Map((accounts ?? []).map((a) => [a.id, a.client_id]));

  const { data: holdings } = accountIds.length
    ? await service
        .from("holdings")
        .select("account_id, symbol, description, asset_class, market_value")
        .eq("snapshot_id", snapshotId)
        .in("account_id", accountIds)
    : { data: [] as never[] };

  const [{ data: factors }, { data: issuers }] = await Promise.all([
    service.from("risk_factors").select("asset_class, factor, vol_assumption"),
    service.from("blocked_issuers").select("name, ticker, active"),
  ]);

  const flags = evaluatePortfolioFlags({
    clients: clients.map(
      (c): ClientLike => ({
        id: c.id,
        name: c.name,
        isBrazilTaxpayer: c.is_brazil_taxpayer,
        isUsNra: c.is_us_nra,
        domicileCountry: c.domicile_country,
        riskProfile: c.risk_profile,
      }),
    ),
    holdings: (holdings ?? []).map((h) => ({
      clientId: clientByAccount.get(h.account_id) ?? "",
      symbol: h.symbol,
      description: h.description,
      assetClass: h.asset_class,
      marketValue: Number(h.market_value),
    })),
    riskFactors: (factors ?? []).map(
      (f): RiskFactorLike => ({
        assetClass: f.asset_class,
        factor: Number(f.factor),
        volAssumption: Number(f.vol_assumption),
      }),
    ),
    blockedIssuers: (issuers ?? []).map(
      (b): BlockedIssuerLike => ({ name: b.name, ticker: b.ticker, active: b.active }),
    ),
    snapshotAsOf: new Date(snapshotAsOf),
    today,
  });

  await service
    .from("portfolio_flags")
    .delete()
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .is("acknowledged_at", null);

  if (flags.length > 0) {
    await service.from("portfolio_flags").insert(
      flags.map((f) => ({
        scope,
        scope_id: scopeId,
        snapshot_id: snapshotId,
        code: f.code,
        severity: f.severity,
        message: f.message,
      })),
    );
  }
  return flags.length;
}

/** Recompute flags for every household and every household-less client. */
export async function recomputeAllFlags(
  service: SupabaseClient,
  snapshotId: string,
  snapshotAsOf: string,
): Promise<{ scopes: number; flags: number }> {
  const [{ data: households }, { data: clients }] = await Promise.all([
    service.from("households").select("id"),
    service.from("clients").select("id, household_id"),
  ]);
  const scopeList: { scope: "household" | "client"; id: string }[] = [
    ...(households ?? []).map((h) => ({ scope: "household" as const, id: h.id })),
    // Per-client flags always run (US_SITUS is client-specific even inside a household)
    ...(clients ?? []).map((c) => ({ scope: "client" as const, id: c.id })),
  ];

  // Process scopes in concurrent batches (DB-bound; safe to parallelize).
  const CONCURRENCY = 8;
  let flags = 0;
  for (let i = 0; i < scopeList.length; i += CONCURRENCY) {
    const batch = scopeList.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((s) => recomputeFlagsForScope(service, s.scope, s.id, snapshotId, snapshotAsOf)),
    );
    flags += results.reduce((a, b) => a + b, 0);
  }
  return { scopes: scopeList.length, flags };
}
