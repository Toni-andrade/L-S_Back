import "server-only";
import {
  AddeparLicenseError,
  addeparConfigFromEnv,
  flattenPortfolioView,
  listEntities,
  listGroups,
  normalizeActivity,
  queryTransactions,
  runPortfolioQuery,
  runPortfolioQueryViaJob,
  type AddeparConfig,
} from "@ls/addepar";
import { addBusinessDays } from "@ls/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { recomputeAllFlags } from "./flags";

/**
 * Firm-specific portfolio-query column keys (discovered from /v1/attributes for
 * firm 1244, 2026-07-14). Overridable via ADDEPAR_COL_* env. The generic keys
 * "units"/"currency"/"asset_class" are NOT valid for this firm.
 */
const COL = {
  value: process.env.ADDEPAR_COL_VALUE ?? "value",
  units: process.env.ADDEPAR_COL_UNITS ?? "shares",
  price: process.env.ADDEPAR_COL_PRICE ?? "price_per_share",
  currency: process.env.ADDEPAR_COL_CURRENCY ?? "currency_factor",
  assetClass: process.env.ADDEPAR_COL_ASSET_CLASS ?? "_custom_ls_asset_class_1285149",
  symbol: process.env.ADDEPAR_COL_SYMBOL ?? "_md_ticker",
  maturityDate: "maturity_date",
  couponRate: "coupon_rate",
  incomePerUnit: "projected_annual_income",
  incomeFrequency: "dividends_per_year",
  nextExDate: "next_ex_div_date",
};
const HOLDING_COLUMNS = [
  COL.value,
  COL.units,
  COL.price,
  COL.assetClass,
  COL.currency,
  COL.symbol,
  COL.maturityDate,
  COL.couponRate,
  COL.incomePerUnit,
  COL.incomeFrequency,
  COL.nextExDate,
].map((key) => ({ key }));

export type SyncResult = {
  jobId: string;
  status: "done" | "error" | "skipped";
  stats: Record<string, unknown>;
  error?: string;
};

/**
 * Addepar sync (Section 4). Firm-wide nightly uses the Jobs API; scoped
 * on-demand refresh uses a direct portfolio query. Writes are atomic per run:
 * a new snapshot + holdings either land completely or the snapshot is removed
 * and the previous one stays authoritative. TWR/transaction 403s degrade
 * (recorded in stats) without failing the rest of the sync.
 */
export async function runAddeparSync(options: {
  kind: "addepar_nightly" | "addepar_on_demand";
  /** Scope for on-demand refresh; nightly syncs the whole firm. */
  target?: { scope: "household" | "client"; scopeId: string };
}): Promise<SyncResult> {
  const service = createServiceClient();
  const config = addeparConfigFromEnv(process.env);

  const { data: job, error: jobError } = await service
    .from("sync_jobs")
    .insert({
      kind: options.kind,
      status: "running",
      target: options.target ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(`could not create sync job: ${jobError?.message}`);

  if (!config) {
    const stats = { skipped: "Addepar credentials not configured (Open Item 1)" };
    await service
      .from("sync_jobs")
      .update({ status: "error", stats, error: "Addepar not configured", finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return { jobId: job.id, status: "skipped", stats };
  }

  const stats: Record<string, unknown> = {};
  try {
    // 1. Enumerate + reconcile entities/groups. Never auto-create; report unmapped.
    const [entities, groups] = await Promise.all([listEntities(config), listGroups(config)]);
    const { data: accounts } = await service
      .from("accounts")
      .select("id, addepar_entity_id")
      .not("addepar_entity_id", "is", null);
    const { data: households } = await service
      .from("households")
      .select("id, addepar_group_id")
      .not("addepar_group_id", "is", null);
    const mappedEntityIds = new Set((accounts ?? []).map((a) => a.addepar_entity_id));
    const mappedGroupIds = new Set((households ?? []).map((h) => h.addepar_group_id));
    stats.entities_total = entities.length;
    stats.groups_total = groups.length;
    stats.unmapped_entities = entities
      .filter((e) => !mappedEntityIds.has(e.id))
      .map((e) => ({ id: e.id, name: (e.attributes as Record<string, unknown>).name ?? null }))
      .slice(0, 200);
    stats.unmapped_groups = groups
      .filter((g) => !mappedGroupIds.has(g.id))
      .map((g) => ({ id: g.id, name: (g.attributes as Record<string, unknown>).name ?? null }));

    // 2+3. Holdings snapshot (atomic)
    const today = new Date();
    const asOf = today.toISOString().slice(0, 10);
    const yearStart = `${today.getFullYear()}-01-01`;

    const response =
      options.kind === "addepar_nightly"
        ? await runPortfolioQueryViaJob(config, {
            portfolioType: "FIRM",
            portfolioId: 1,
            startDate: asOf,
            endDate: asOf,
            columns: HOLDING_COLUMNS,
          })
        : await runScopedQuery(config, service, options.target!, asOf);

    const positions = flattenPortfolioView(response);
    const accountByEntity = new Map(
      (accounts ?? []).map((a) => [String(a.addepar_entity_id), a.id]),
    );

    const holdingRows: Record<string, unknown>[] = [];
    let unmappedPositionMv = 0;
    for (const pos of positions) {
      const accountEntity = pos.path[0]?.entityId != null ? String(pos.path[0].entityId) : null;
      const accountId = accountEntity ? accountByEntity.get(accountEntity) : undefined;
      const value = Number(pos.columns[COL.value] ?? 0);
      if (!accountId) {
        unmappedPositionMv += value;
        continue;
      }
      holdingRows.push({
        account_id: accountId,
        as_of: asOf,
        security_id: pos.path[1]?.entityId != null ? String(pos.path[1].entityId) : null,
        symbol: (pos.columns[COL.symbol] as string | undefined) ?? null,
        description: pos.path[1]?.name ?? null,
        asset_class: (pos.columns[COL.assetClass] as string | undefined) ?? null,
        quantity: pos.columns[COL.units] == null ? null : Number(pos.columns[COL.units]),
        price: pos.columns[COL.price] == null ? null : Number(pos.columns[COL.price]),
        market_value: value,
        currency: (pos.columns[COL.currency] as string | undefined) ?? "USD",
        maturity_date: (pos.columns[COL.maturityDate] as string | undefined) || null,
        coupon_rate: pos.columns[COL.couponRate] == null ? null : Number(pos.columns[COL.couponRate]),
        income_per_unit:
          pos.columns[COL.incomePerUnit] == null ? null : Number(pos.columns[COL.incomePerUnit]),
        income_frequency:
          pos.columns[COL.incomeFrequency] == null
            ? null
            : Math.round(Number(pos.columns[COL.incomeFrequency])),
        next_ex_date: (pos.columns[COL.nextExDate] as string | undefined) || null,
        raw: pos.raw,
      });
    }
    stats.positions = holdingRows.length;
    stats.unmapped_position_mv = unmappedPositionMv;

    const { data: snapshot, error: snapError } = await service
      .from("snapshots")
      .insert({ sync_job_id: job.id, as_of: asOf, source: "addepar" })
      .select("id")
      .single();
    if (snapError || !snapshot) throw new Error(`snapshot insert failed: ${snapError?.message}`);

    try {
      for (let i = 0; i < holdingRows.length; i += 500) {
        const { error } = await service
          .from("holdings")
          .insert(holdingRows.slice(i, i + 500).map((r) => ({ ...r, snapshot_id: snapshot.id })));
        if (error) throw new Error(`holdings insert failed: ${error.message}`);
      }
    } catch (e) {
      // Atomicity: a failed run must leave the previous snapshot intact.
      await service.from("snapshots").delete().eq("id", snapshot.id);
      throw e;
    }

    // 4. Transactions delta with 5-business-day overlap
    try {
      const { data: lastDone } = await service
        .from("sync_jobs")
        .select("finished_at")
        .eq("status", "done")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const since = lastDone?.finished_at
        ? addBusinessDays(new Date(lastDone.finished_at), -5)
        : addBusinessDays(today, -90);
      const txResponse = await queryTransactions(config, {
        portfolioType: "FIRM",
        portfolioId: 1,
        startDate: since.toISOString().slice(0, 10),
        endDate: asOf,
      });
      let upserted = 0;
      for (const tx of txResponse.data) {
        const attrs = tx.attributes as Record<string, unknown>;
        const holdingAccount = attrs.holding_account_id ?? attrs.owner_id ?? null;
        const accountId = holdingAccount ? accountByEntity.get(String(holdingAccount)) : undefined;
        if (!accountId) continue;
        const { error } = await service.from("transactions").upsert(
          {
            account_id: accountId,
            addepar_transaction_id: tx.id,
            trade_date: String(attrs.trade_date ?? asOf),
            settle_date: (attrs.settle_date as string | null) ?? null,
            activity: normalizeActivity(attrs.type as string | null),
            description: (attrs.description as string | null) ?? null,
            symbol: (attrs.security as string | null) ?? null,
            quantity: attrs.units == null ? null : Number(attrs.units),
            amount: Number(attrs.amount ?? 0),
            currency: (attrs.currency as string | undefined) ?? "USD",
            raw: attrs,
          },
          { onConflict: "addepar_transaction_id" },
        );
        if (!error) upserted += 1;
      }
      stats.transactions_upserted = upserted;
    } catch (e) {
      if (e instanceof AddeparLicenseError) {
        stats.transactions_unavailable = true;
        stats.transactions_403 = e.message;
      } else throw e;
    }

    // 5. TWR series (degrade on 403 per Section 6)
    try {
      await pullPerformance(config, service, yearStart, asOf, stats);
    } catch (e) {
      if (e instanceof AddeparLicenseError) {
        stats.twr_unavailable = true;
        stats.twr_403 = e.message;
      } else throw e;
    }

    // 5b. Incremental performance history: append today's cumulative-TWR point
    // per client that already has a since-inception series. History is
    // persisted in Supabase; we never re-fetch it (see perf-history.mjs for the
    // one-time inception backfill). ~1 query per client, degrades on 403.
    try {
      await appendPerformanceHistory(config, service, asOf, stats);
    } catch (e) {
      if (!(e instanceof AddeparLicenseError)) throw e;
    }

    // Flags on every snapshot write
    const flagStats = await recomputeAllFlags(service, snapshot.id, asOf);
    stats.flag_scopes = flagStats.scopes;
    stats.flags = flagStats.flags;

    await service
      .from("sync_jobs")
      .update({ status: "done", stats, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return { jobId: job.id, status: "done", stats };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await service
      .from("sync_jobs")
      .update({ status: "error", stats, error: message, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return { jobId: job.id, status: "error", stats, error: message };
  }
}

async function runScopedQuery(
  config: AddeparConfig,
  service: SupabaseClient,
  target: { scope: "household" | "client"; scopeId: string },
  asOf: string,
) {
  let portfolioType: "GROUP" | "ENTITY" = "ENTITY";
  let portfolioId: number | null = null;
  if (target.scope === "household") {
    const { data } = await service
      .from("households")
      .select("addepar_group_id")
      .eq("id", target.scopeId)
      .single();
    portfolioType = "GROUP";
    portfolioId = data?.addepar_group_id ? Number(data.addepar_group_id) : null;
  } else {
    const { data } = await service
      .from("clients")
      .select("addepar_entity_id")
      .eq("id", target.scopeId)
      .single();
    portfolioId = data?.addepar_entity_id ? Number(data.addepar_entity_id) : null;
  }
  if (portfolioId === null) throw new Error("target has no Addepar mapping");
  return runPortfolioQuery(config, {
    portfolioType,
    portfolioId,
    startDate: asOf,
    endDate: asOf,
    columns: HOLDING_COLUMNS,
  });
}

/**
 * Cumulative TWR series per household (GROUP) and household-less client
 * (ENTITY) for YTD and trailing 1Y. Column key is firm-configurable
 * (ADDEPAR_TWR_COLUMN, default "time_weighted_return"); shape verified against
 * the portfolio-query docs, exact attribute availability is license-dependent
 * and degrades via AddeparLicenseError in the caller.
 */
async function pullPerformance(
  config: AddeparConfig,
  service: SupabaseClient,
  yearStart: string,
  asOf: string,
  stats: Record<string, unknown>,
) {
  const twrColumn = process.env.ADDEPAR_TWR_COLUMN ?? "time_weighted_return";
  const oneYearAgo = new Date(asOf);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const { data: households } = await service
    .from("households")
    .select("id, addepar_group_id")
    .not("addepar_group_id", "is", null);
  const { data: soloClients } = await service
    .from("clients")
    .select("id, addepar_entity_id")
    .is("household_id", null)
    .not("addepar_entity_id", "is", null);

  const targets = [
    ...(households ?? []).map((h) => ({
      scope: "household" as const,
      scopeId: h.id,
      portfolioType: "GROUP" as const,
      portfolioId: Number(h.addepar_group_id),
    })),
    ...(soloClients ?? []).map((c) => ({
      scope: "client" as const,
      scopeId: c.id,
      portfolioType: "ENTITY" as const,
      portfolioId: Number(c.addepar_entity_id),
    })),
  ];

  let points = 0;
  for (const t of targets) {
    for (const period of ["ytd", "one_year"] as const) {
      const startDate = period === "ytd" ? yearStart : oneYearAgo.toISOString().slice(0, 10);
      const response = await runPortfolioQuery(config, {
        portfolioType: t.portfolioType,
        portfolioId: t.portfolioId,
        startDate,
        endDate: asOf,
        columns: [{ key: twrColumn, arguments: { period: "custom" } }],
        groupings: [],
      });
      const twr = Number(response.data.attributes.total?.columns?.[twrColumn] ?? NaN);
      if (!Number.isNaN(twr)) {
        await service.from("performance_points").upsert(
          {
            scope: t.scope,
            scope_id: t.scopeId,
            period,
            as_of: asOf,
            twr,
            raw: response.data.attributes.total ?? null,
          },
          { onConflict: "scope,scope_id,period,as_of" },
        );
        points += 1;
      }
    }
  }
  stats.performance_points = points;
}

/**
 * Incremental since-inception history: for each client that already has a
 * since_inception series, append today's cumulative-TWR point (anchored at the
 * stored inception). The historical months are immutable and never re-fetched;
 * the one-time inception backfill lives in scripts/perf-history.mjs.
 */
async function appendPerformanceHistory(
  config: AddeparConfig,
  service: SupabaseClient,
  asOf: string,
  stats: Record<string, unknown>,
) {
  const twrColumn = process.env.ADDEPAR_TWR_COLUMN ?? "time_weighted_return";
  const { data: existing } = await service
    .from("performance_points")
    .select("scope_id, raw")
    .eq("scope", "client")
    .eq("period", "since_inception");
  if (!existing || existing.length === 0) return;

  // Distinct client -> inception (from any stored point's raw).
  const inceptionByClient = new Map<string, string>();
  for (const row of existing) {
    const inception = (row.raw as { inception?: string } | null)?.inception;
    if (inception && !inceptionByClient.has(row.scope_id)) {
      inceptionByClient.set(row.scope_id, inception);
    }
  }
  if (inceptionByClient.size === 0) return;

  const { data: clients } = await service
    .from("clients")
    .select("id, addepar_entity_id")
    .in("id", [...inceptionByClient.keys()])
    .not("addepar_entity_id", "is", null);

  let appended = 0;
  for (const c of clients ?? []) {
    const inception = inceptionByClient.get(c.id);
    if (!inception) continue;
    const response = await runPortfolioQuery(config, {
      portfolioType: "ENTITY",
      portfolioId: Number(c.addepar_entity_id),
      startDate: inception,
      endDate: asOf,
      columns: [{ key: twrColumn }],
      groupings: [],
    });
    const twr = Number(response.data.attributes.total?.columns?.[twrColumn] ?? NaN);
    if (!Number.isNaN(twr)) {
      await service.from("performance_points").upsert(
        {
          scope: "client",
          scope_id: c.id,
          period: "since_inception",
          as_of: asOf,
          twr,
          raw: { inception },
        },
        { onConflict: "scope,scope_id,period,as_of" },
      );
      appended += 1;
    }
  }
  stats.history_points_appended = appended;
}
