/**
 * Portfolio x-ray: pull every position for imported clients and write a
 * snapshot + holdings (the full portfolio look-through).
 *
 * Accounts are enumerated via a portfolio query grouped by
 * [holding_account, position]; each leaf is a position. Rows are mapped to our
 * accounts by addepar_entity_id and stored with symbol, asset class, quantity,
 * price, market value and currency, plus the full raw node (sub-asset-class,
 * security type, country) for the look-through. Firm-specific column keys come
 * from ADDEPAR_COL_* env (discovered from /v1/attributes for firm 1244).
 *
 *   node scripts/xray-sync.mjs [clientEntityId ...]   # default: all imported clients
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

const COL = {
  value: env.ADDEPAR_COL_VALUE ?? "value",
  units: env.ADDEPAR_COL_UNITS ?? "shares",
  price: env.ADDEPAR_COL_PRICE ?? "price_per_share",
  currency: env.ADDEPAR_COL_CURRENCY ?? "currency_factor",
  assetClass: env.ADDEPAR_COL_ASSET_CLASS ?? "_custom_ls_asset_class_1285149",
  subAssetClass: env.ADDEPAR_COL_SUB_ASSET_CLASS ?? "_custom_ls_sub_asset_class_1285148",
  symbol: env.ADDEPAR_COL_SYMBOL ?? "_md_ticker",
  securityType: env.ADDEPAR_COL_SECURITY_TYPE ?? "actual_security_type",
  country: env.ADDEPAR_COL_COUNTRY ?? "country",
};
const COL_KEYS = [...new Set(Object.values(COL))];

const ADDEPAR = {
  base: `https://${env.ADDEPAR_SUBDOMAIN}.addepar.com/api`,
  firm: env.ADDEPAR_FIRM_ID,
  auth: "Basic " + Buffer.from(`${env.ADDEPAR_API_KEY}:${env.ADDEPAR_API_SECRET}`).toString("base64"),
};
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const die = (m) => {
  console.error("FAILED:", m);
  process.exit(1);
};
const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

async function positionsForEntity(entityId) {
  const body = {
    data: {
      type: "portfolio_query",
      attributes: {
        columns: COL_KEYS.map((key) => ({ key })),
        groupings: [{ key: "holding_account" }, { key: "position" }],
        portfolio_type: "ENTITY",
        portfolio_id: [Number(entityId)],
        start_date: today(),
        end_date: today(),
      },
    },
  };
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
  if (!res.ok) die(`portfolio query ${entityId} -> ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const accounts = json.data?.attributes?.total?.children ?? [];
  const leaves = [];
  for (const acct of accounts) {
    for (const pos of acct.children ?? []) {
      leaves.push({ acct, pos });
    }
  }
  return { leaves, accounts };
}

async function main() {
  const argIds = process.argv.slice(2).filter((a) => /^\d+$/.test(a));

  let q = supabase.from("clients").select("id, name, addepar_entity_id").not("addepar_entity_id", "is", null);
  if (argIds.length) q = q.in("addepar_entity_id", argIds);
  const { data: clients } = await q;
  if (!clients?.length) die("no imported clients with addepar_entity_id");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, addepar_entity_id")
    .not("addepar_entity_id", "is", null);
  const accountByEntity = new Map((accounts ?? []).map((a) => [String(a.addepar_entity_id), a.id]));

  const { data: job } = await supabase
    .from("sync_jobs")
    .insert({ kind: "addepar_on_demand", status: "running", target: { xray: true }, started_at: new Date().toISOString() })
    .select("id")
    .single();
  const { data: snapshot } = await supabase
    .from("snapshots")
    .insert({ sync_job_id: job.id, as_of: today(), source: "addepar" })
    .select("id")
    .single();

  const rows = [];
  let unmappedMv = 0;
  const perClient = [];
  for (const c of clients) {
    const { leaves } = await positionsForEntity(c.addepar_entity_id);
    let clientMv = 0;
    let held = 0;
    for (const { acct, pos } of leaves) {
      const value = num(pos.columns?.[COL.value]) ?? 0;
      if (!value) continue; // x-ray of funded positions
      const accountId = acct.entity_id != null ? accountByEntity.get(String(acct.entity_id)) : undefined;
      clientMv += value;
      if (!accountId) {
        unmappedMv += value;
        continue;
      }
      held++;
      rows.push({
        snapshot_id: snapshot.id,
        account_id: accountId,
        as_of: today(),
        security_id: pos.entity_id != null ? String(pos.entity_id) : null,
        symbol: pos.columns?.[COL.symbol] ?? null,
        description: pos.name ?? null,
        asset_class: pos.columns?.[COL.assetClass] ?? null,
        quantity: num(pos.columns?.[COL.units]),
        price: num(pos.columns?.[COL.price]),
        market_value: value,
        currency: pos.columns?.[COL.currency] ?? "USD",
        raw: {
          sub_asset_class: pos.columns?.[COL.subAssetClass] ?? null,
          security_type: pos.columns?.[COL.securityType] ?? null,
          country: pos.columns?.[COL.country] ?? null,
          account_name: acct.name ?? null,
        },
      });
    }
    perClient.push({ name: c.name, mv: clientMv, positions: held });
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("holdings").insert(rows.slice(i, i + 500));
    if (error) die(`holdings insert: ${error.message}`);
  }

  const totalMv = rows.reduce((s, r) => s + r.market_value, 0);
  await supabase
    .from("sync_jobs")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      stats: { xray: true, positions: rows.length, total_mv: totalMv, unmapped_mv: unmappedMv, clients: clients.length },
    })
    .eq("id", job.id);
  await supabase.from("audit_log").insert({
    actor_id: null,
    action: "sync.xray",
    entity_type: "snapshots",
    entity_id: snapshot.id,
    after: { positions: rows.length, total_mv: totalMv, clients: clients.length },
  });

  console.log(`X-ray snapshot ${snapshot.id} (as of ${today()})`);
  for (const p of perClient) console.log(`  ${p.name}: ${p.positions} positions, MV=${p.mv.toFixed(2)}`);
  console.log(`\nTotal ${rows.length} holdings, MV=${totalMv.toFixed(2)}${unmappedMv ? `, unmapped MV=${unmappedMv.toFixed(2)}` : ""}`);
}

main().catch((e) => die(e.message));
