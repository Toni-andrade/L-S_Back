/**
 * Performance + activity sync: per client, pull period metrics (trailing 30d,
 * YTD, 1Y) and the month's per-position movers, and store them in
 * portfolio_activity (+ TWR into performance_points). This powers the advisor
 * activity summary ("what happened this month") on the client review page.
 *
 *   node scripts/perf-sync.mjs [clientEntityId ...]   # default: all imported
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL("../.env.local", import.meta.url)), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const ADDEPAR = {
  base: `https://${env.ADDEPAR_SUBDOMAIN}.addepar.com/api`,
  firm: env.ADDEPAR_FIRM_ID,
  auth: "Basic " + Buffer.from(`${env.ADDEPAR_API_KEY}:${env.ADDEPAR_API_SECRET}`).toString("base64"),
};
const TWR = env.ADDEPAR_TWR_COLUMN ?? "time_weighted_return";
const ASSET_CLASS = env.ADDEPAR_COL_ASSET_CLASS ?? "_custom_ls_asset_class_1285149";
const SYMBOL = env.ADDEPAR_COL_SYMBOL ?? "_md_ticker";

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const die = (m) => {
  console.error("FAILED:", m);
  process.exit(1);
};
const iso = (d) => d.toISOString().slice(0, 10);
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

async function query(attrs) {
  const res = await fetch(`${ADDEPAR.base}/v1/portfolio/query`, {
    method: "POST",
    headers: {
      Authorization: ADDEPAR.auth,
      "Addepar-Firm": ADDEPAR.firm,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({ data: { type: "portfolio_query", attributes: attrs } }),
  });
  if (!res.ok) die(`portfolio query -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function periodMetrics(entityId, start, end) {
  const keys = [
    "value",
    TWR,
    "change_in_value",
    "percent_change_in_value",
    "inflow",
    "deposits",
    "income",
    "fund_distributions",
  ];
  const json = await query({
    columns: keys.map((key) => ({ key })),
    groupings: [],
    portfolio_type: "ENTITY",
    portfolio_id: [Number(entityId)],
    start_date: start,
    end_date: end,
  });
  const c = json.data?.attributes?.total?.columns ?? {};
  const changeInValue = num(c.change_in_value);
  const netFlows = num(c.inflow);
  return {
    twr: num(c[TWR]),
    change_in_value: changeInValue,
    percent_change: num(c.percent_change_in_value),
    net_flows: netFlows,
    net_deposits: num(c.deposits),
    income: num(c.income),
    dividends: num(c.fund_distributions),
    market_change:
      changeInValue !== null && netFlows !== null ? changeInValue - netFlows : null,
    raw: c,
  };
}

async function monthMovers(entityId, start, end) {
  const json = await query({
    columns: [{ key: "change_in_value" }, { key: "inflow" }, { key: SYMBOL }, { key: ASSET_CLASS }],
    groupings: [{ key: "position" }],
    portfolio_type: "ENTITY",
    portfolio_id: [Number(entityId)],
    start_date: start,
    end_date: end,
  });
  const positions = (json.data?.attributes?.total?.children ?? [])
    .map((p) => {
      const chg = num(p.columns?.change_in_value) ?? 0;
      const flow = num(p.columns?.inflow) ?? 0;
      return {
        name: p.name ?? null,
        symbol: p.columns?.[SYMBOL] ?? null,
        assetClass: p.columns?.[ASSET_CLASS] ?? "",
        // Performance gain = total value change minus money that flowed INTO the
        // position (deposits / buys). This isolates market performance so a new
        // purchase or a cash deposit is not counted as a "gainer".
        change: chg - flow,
      };
    })
    .filter((p) => {
      if (Math.abs(p.change) < 1) return false;
      const ac = (p.assetClass ?? "").toLowerCase();
      const nm = (p.name ?? "").toLowerCase();
      // Exclude cash & equivalents (not a performance mover).
      if (ac.includes("cash") || nm.includes("bank deposit") || nm === "cash") return false;
      return true;
    })
    .map(({ name, symbol, change }) => ({ name, symbol, change }));
  const gainers = [...positions].sort((a, b) => b.change - a.change).slice(0, 5);
  const losers = [...positions].sort((a, b) => a.change - b.change).slice(0, 5);
  return [...gainers, ...losers.filter((l) => !gainers.includes(l))];
}

async function main() {
  const argIds = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  let q = supabase.from("clients").select("id, name, addepar_entity_id").not("addepar_entity_id", "is", null);
  if (argIds.length) q = q.in("addepar_entity_id", argIds);
  const { data: clients } = await q;
  if (!clients?.length) die("no imported clients with addepar_entity_id");

  const today = new Date();
  const asOf = iso(today);
  const d30 = new Date(today);
  d30.setDate(d30.getDate() - 30);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const windows = [
    { period: "trailing_30d", start: iso(d30) },
    { period: "ytd", start: iso(yearStart) },
    { period: "one_year", start: iso(oneYearAgo) },
  ];

  for (const c of clients) {
    for (const w of windows) {
      const m = await periodMetrics(c.addepar_entity_id, w.start, asOf);
      const movers = w.period === "trailing_30d" ? await monthMovers(c.addepar_entity_id, w.start, asOf) : null;
      const { error } = await supabase.from("portfolio_activity").upsert(
        {
          scope: "client",
          scope_id: c.id,
          as_of: asOf,
          period: w.period,
          period_start: w.start,
          twr: m.twr,
          change_in_value: m.change_in_value,
          percent_change: m.percent_change,
          net_flows: m.net_flows,
          net_deposits: m.net_deposits,
          income: m.income,
          dividends: m.dividends,
          market_change: m.market_change,
          movers,
          raw: m.raw,
        },
        { onConflict: "scope,scope_id,period,as_of" },
      );
      if (error) die(`activity upsert ${c.name}/${w.period}: ${error.message}`);

      // Keep performance_points (TWR) in step for ytd / one_year.
      if (w.period === "ytd" || w.period === "one_year") {
        await supabase.from("performance_points").upsert(
          { scope: "client", scope_id: c.id, period: w.period, as_of: asOf, twr: m.twr ?? 0, raw: m.raw },
          { onConflict: "scope,scope_id,period,as_of" },
        );
      }
    }
    const mtd = await periodMetrics(c.addepar_entity_id, iso(d30), asOf).then((x) => x);
    console.log(
      `  ${c.name}: 30d TWR ${((mtd.twr ?? 0) * 100).toFixed(2)}%, change ${(mtd.change_in_value ?? 0).toFixed(0)}, flows ${(mtd.net_flows ?? 0).toFixed(0)}`,
    );
  }
  await supabase.from("audit_log").insert({
    actor_id: null,
    action: "sync.performance",
    entity_type: "portfolio_activity",
    after: { clients: clients.length, as_of: asOf },
  });
  console.log(`\nStored activity for ${clients.length} client(s) across 3 windows.`);
}

main().catch((e) => die(e.message));
