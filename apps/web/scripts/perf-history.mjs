/**
 * Backfill a full monthly cumulative-TWR history per client (the account's
 * whole life), stored in performance_points with period 'since_inception'.
 * Cumulative TWR from a fixed early anchor returns null before inception, so
 * those months are simply skipped.
 *
 *   node scripts/perf-history.mjs [clientEntityId ...] [--from 2022-01]
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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const die = (m) => {
  console.error("FAILED:", m);
  process.exit(1);
};
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST a portfolio query, retrying on 429/5xx with exponential backoff. */
async function postQuery(attributes, retries = 6) {
  const body = { data: { type: "portfolio_query", attributes } };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${ADDEPAR.base}/v1/portfolio/query`, {
      method: "POST",
      headers: {
        Authorization: ADDEPAR.auth,
        "Addepar-Firm": ADDEPAR.firm,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()).data?.attributes?.total?.columns ?? {};
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt;
      await sleep(wait);
      continue;
    }
    return null; // give up (best-effort)
  }
}

async function twrCum(entityId, start, end) {
  const cols = await postQuery({
    columns: [{ key: TWR }, { key: "value" }],
    groupings: [],
    portfolio_type: "ENTITY",
    portfolio_id: [Number(entityId)],
    start_date: start,
    end_date: end,
  });
  if (!cols) return { twr: null, value: null };
  return { twr: num(cols[TWR]), value: num(cols.value) };
}

const iso = (d) => d.toISOString().slice(0, 10);
const monthEndStr = (y, m) => iso(new Date(Date.UTC(y, m, 0))); // day 0 of next month

/** Value at a single date (point in time). Value-only query (no TWR). */
async function valueAt(entityId, date) {
  const cols = await postQuery({
    columns: [{ key: "value" }],
    groupings: [],
    portfolio_type: "ENTITY",
    portfolio_id: [Number(entityId)],
    start_date: date,
    end_date: date,
  });
  return cols ? num(cols.value) : null;
}

/**
 * Find the account's inception (first month with a non-zero value): coarse by
 * year, then narrow to the month. Cumulative TWR must be anchored here.
 */
async function inceptionDate(entityId) {
  const nowY = new Date().getUTCFullYear();
  let year = null;
  for (let y = 2015; y <= nowY; y++) {
    if (await valueAt(entityId, `${y}-12-31`)) {
      year = y;
      break;
    }
  }
  if (year === null) {
    if (!(await valueAt(entityId, iso(new Date())))) return null;
    year = nowY;
  }
  for (let y = year - 1; y <= year; y++) {
    for (let m = 1; m <= 12; m++) {
      if (await valueAt(entityId, monthEndStr(y, m))) {
        return `${y}-${String(m).padStart(2, "0")}-01`;
      }
    }
  }
  return `${year}-01-01`;
}

/** Month-end date strings from `startIso` to today, plus today. */
function monthEndsFrom(startIso) {
  const start = new Date(startIso);
  const now = new Date();
  const out = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  for (;;) {
    const end = new Date(Date.UTC(y, m, 0));
    if (end >= now) break;
    out.push(iso(end));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  out.push(iso(now));
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const argIds = args.filter((a) => /^\d+$/.test(a));

  let q = supabase.from("clients").select("id, name, addepar_entity_id").not("addepar_entity_id", "is", null);
  if (argIds.length) q = q.in("addepar_entity_id", argIds);
  const { data: clients } = await q;
  if (!clients?.length) die("no imported clients with addepar_entity_id");

  for (const c of clients) {
    const inception = await inceptionDate(c.addepar_entity_id);
    if (!inception) {
      console.log(`  ${c.name}: no valued history found`);
      continue;
    }
    const ends = monthEndsFrom(inception).filter((d) => d > inception);
    const points = [];
    for (const end of ends) {
      const { twr, value } = await twrCum(c.addepar_entity_id, inception, end);
      if (twr === null) continue;
      points.push({
        scope: "client",
        scope_id: c.id,
        period: "since_inception",
        as_of: end,
        twr,
        raw: { market_value: value, inception },
      });
    }
    if (points.length > 0) {
      // Clear any prior since_inception points for this client, then insert.
      await supabase
        .from("performance_points")
        .delete()
        .eq("scope", "client")
        .eq("scope_id", c.id)
        .eq("period", "since_inception");
      const { error } = await supabase.from("performance_points").insert(points);
      if (error) die(`insert ${c.name}: ${error.message}`);
    }
    const last = points[points.length - 1];
    console.log(
      `  ${c.name}: inception ${inception}, ${points.length} points${
        last ? ` -> ${last.as_of} ${(last.twr * 100).toFixed(1)}%` : ""
      }`,
    );
  }

  await supabase.from("audit_log").insert({
    actor_id: null,
    action: "sync.performance_history",
    entity_type: "performance_points",
    after: { clients: clients.length },
  });
  console.log("\ndone.");
}

main().catch((e) => die(e.message));
