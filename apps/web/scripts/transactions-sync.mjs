/**
 * Pull recent transactions per imported client and store them. The Addepar
 * transactions API takes columns as plain strings (not {key} objects) and
 * returns account_name / security as { name, entity_id } objects.
 *
 *   node scripts/transactions-sync.mjs [clientEntityId ...]   # default: all imported
 *   node scripts/transactions-sync.mjs --days 365
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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const die = (m) => {
  console.error("FAILED:", m);
  process.exit(1);
};
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

const TX_COLUMNS = [
  "trade_date",
  "settlement_date",
  "type",
  "security",
  "ticker_symbol",
  "units",
  "price_per_share",
  "value",
  "currency",
  "account_name",
];

/** Normalize Addepar transaction type onto our activity enum. */
function activityOf(type) {
  const t = (type ?? "").toLowerCase();
  if (t.includes("buy") || t.includes("purchase")) return "buy";
  if (t.includes("sell") || t.includes("sale")) return "sell";
  if (t.includes("dividend")) return "dividend";
  if (t.includes("interest") || t.includes("coupon")) return "interest";
  if (t.includes("deposit") || t.includes("contribution")) return "contribution";
  if (t.includes("withdrawal") || t.includes("distribution")) return "withdrawal";
  if (t.includes("fee") || t.includes("tax") || t.includes("expense")) return "fee";
  if (t.includes("transfer") || t.includes("spinoff") || t.includes("merger")) return "transfer";
  return "other";
}

async function txForEntity(entityId, start, end) {
  const res = await fetch(`${ADDEPAR.base}/v1/transactions/query`, {
    method: "POST",
    headers: {
      Authorization: ADDEPAR.auth,
      "Addepar-Firm": ADDEPAR.firm,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "transaction_query",
        attributes: {
          columns: TX_COLUMNS,
          portfolio_type: "ENTITY",
          portfolio_id: [Number(entityId)],
          start_date: start,
          end_date: end,
        },
      },
    }),
  });
  if (!res.ok) die(`transactions query ${entityId} -> ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf("--days");
  const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 180;
  // Exclude the --days flag and its value when collecting client entity ids.
  const argIds = args.filter(
    (a, i) => /^\d+$/.test(a) && a !== "--days" && args[i - 1] !== "--days",
  );

  let q = supabase.from("clients").select("id, name, addepar_entity_id").not("addepar_entity_id", "is", null);
  if (argIds.length) q = q.in("addepar_entity_id", argIds);
  const { data: clients } = await q;
  if (!clients?.length) die("no imported clients with addepar_entity_id");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, addepar_entity_id")
    .not("addepar_entity_id", "is", null);
  const accountByEntity = new Map((accounts ?? []).map((a) => [String(a.addepar_entity_id), a.id]));

  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startD = new Date(today);
  startD.setDate(startD.getDate() - days);
  const start = startD.toISOString().slice(0, 10);

  let total = 0;
  for (const c of clients) {
    const rows = await txForEntity(c.addepar_entity_id, start, end);
    const clientAccountIds = new Set();
    const inserts = [];
    for (const t of rows) {
      const a = t.attributes;
      const acctEntity = a.account_name?.entity_id;
      const accountId = acctEntity != null ? accountByEntity.get(String(acctEntity)) : undefined;
      if (!accountId) continue;
      clientAccountIds.add(accountId);
      inserts.push({
        account_id: accountId,
        trade_date: a.trade_date,
        settle_date: a.settlement_date || null,
        activity: activityOf(a.type),
        description: a.security?.name ?? a.type ?? null,
        symbol: a.ticker_symbol || null,
        quantity: num(a.units),
        amount: num(a.value) ?? 0,
        currency: a.currency || "USD",
        raw: {
          type: a.type ?? null,
          price_per_share: num(a.price_per_share),
          security_entity_id: a.security?.entity_id ?? null,
        },
      });
    }
    // Idempotent per window: clear this client's accounts in [start, end], reinsert.
    if (clientAccountIds.size > 0) {
      await supabase
        .from("transactions")
        .delete()
        .in("account_id", [...clientAccountIds])
        .gte("trade_date", start)
        .lte("trade_date", end);
    }
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await supabase.from("transactions").insert(inserts.slice(i, i + 500));
      if (error) die(`tx insert ${c.name}: ${error.message}`);
    }
    total += inserts.length;
    console.log(`  ${c.name}: ${inserts.length} transactions (${start}..${end})`);
  }

  await supabase.from("audit_log").insert({
    actor_id: null,
    action: "sync.transactions",
    entity_type: "transactions",
    after: { clients: clients.length, days, total },
  });
  console.log(`\nStored ${total} transactions across ${clients.length} client(s).`);
}

main().catch((e) => die(e.message));
