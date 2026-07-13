/**
 * Dev seed (spec Section 13): 2 households wrapping 3 fake clients (one
 * Brazilian NRA holding GLD to light up flags), 2 accounts each, one
 * snapshot, 90 days of transactions, YTD + 1Y TWR series, 2 draft models,
 * 5 tickets, 3 intake rows.
 *
 * Everything is tagged [SEED] (or source='seed') so `--undo` removes exactly
 * what seeding created. Never run automatically.
 *
 *   node scripts/seed.mjs         # seed
 *   node scripts/seed.mjs --undo  # remove seeded data
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TAG = "[SEED]";
const die = (msg) => {
  console.error(`FAILED: ${msg}`);
  process.exit(1);
};
const ok = async (promise, label) => {
  const { data, error } = await promise;
  if (error) die(`${label}: ${error.message}`);
  return data;
};

async function undo() {
  const households = (await ok(
    supabase.from("households").select("id").like("name", `${TAG}%`),
    "households",
  )).map((h) => h.id);
  const clients = (await ok(
    supabase.from("clients").select("id").like("name", `${TAG}%`),
    "clients",
  )).map((c) => c.id);
  const accounts = clients.length
    ? (await ok(supabase.from("accounts").select("id").in("client_id", clients), "accounts")).map(
        (a) => a.id,
      )
    : [];
  const scopeIds = [...households, ...clients];

  if (scopeIds.length) {
    await ok(supabase.from("portfolio_flags").delete().in("scope_id", scopeIds), "flags");
    await ok(supabase.from("performance_points").delete().in("scope_id", scopeIds), "perf");
    await ok(supabase.from("portfolio_reviews").delete().in("scope_id", scopeIds), "reviews");
  }
  await ok(supabase.from("snapshots").delete().eq("source", "seed"), "snapshots"); // holdings cascade
  await ok(supabase.from("sync_jobs").delete().eq("kind", "addepar_nightly").filter("stats->>seed", "eq", "true"), "sync_jobs");
  if (accounts.length) {
    await ok(supabase.from("transactions").delete().in("account_id", accounts), "transactions");
  }
  await ok(supabase.from("tickets").delete().like("title", `${TAG}%`), "tickets"); // events cascade
  await ok(supabase.from("intake_submissions").delete().eq("source", "seed"), "intake");
  await ok(supabase.from("proposals").delete().like("client_name", `${TAG}%`), "proposals");
  await ok(supabase.from("models").delete().like("name", `${TAG}%`), "models"); // sleeves cascade
  if (accounts.length) await ok(supabase.from("accounts").delete().in("id", accounts), "accounts");
  if (clients.length) await ok(supabase.from("clients").delete().in("id", clients), "clients");
  if (households.length)
    await ok(supabase.from("households").delete().in("id", households), "households");
  console.log("seed data removed");
}

async function seed() {
  const existing = await ok(
    supabase.from("households").select("id").like("name", `${TAG}%`).limit(1),
    "households check",
  );
  if (existing.length) die("seed data already present; run with --undo first");

  const users = await ok(supabase.from("users").select("id").limit(1), "users");
  if (!users.length) die("no users exist; sign in once before seeding");
  const adminId = users[0].id;

  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  // Households + clients + accounts
  const [h1, h2] = await ok(
    supabase
      .from("households")
      .insert([
        { name: `${TAG} Almeida Family`, primary_advisor_id: adminId },
        { name: `${TAG} Costa Family`, primary_advisor_id: adminId },
      ])
      .select("id"),
    "households",
  );
  const [ricardo, beatriz, fernanda] = await ok(
    supabase
      .from("clients")
      .insert([
        {
          name: `${TAG} Ricardo Almeida`,
          status: "active",
          advisor_id: adminId,
          household_id: h1.id,
          domicile_country: "BR",
          tax_residency: "BR",
          is_brazil_taxpayer: true,
          is_us_nra: true,
          risk_profile: "moderado",
        },
        {
          name: `${TAG} Beatriz Almeida`,
          status: "active",
          advisor_id: adminId,
          household_id: h1.id,
          domicile_country: "US",
          is_brazil_taxpayer: false,
          is_us_nra: false,
          risk_profile: "conservador",
        },
        {
          name: `${TAG} Fernanda Costa`,
          status: "active",
          advisor_id: adminId,
          household_id: h2.id,
          domicile_country: "BR",
          is_brazil_taxpayer: true,
          is_us_nra: false,
          risk_profile: "agressivo",
        },
      ])
      .select("id, name"),
    "clients",
  );
  const accountRows = [];
  [ricardo, beatriz, fernanda].forEach((c, ci) => {
    accountRows.push(
      { client_id: c.id, custodian: "ibkr", account_number_masked: `••••1${ci}01`, base_currency: "USD", status: "open" },
      { client_id: c.id, custodian: "morgan_stanley", account_number_masked: `••••2${ci}02`, base_currency: "USD", status: "open" },
    );
  });
  const accounts = await ok(
    supabase.from("accounts").insert(accountRows).select("id, client_id"),
    "accounts",
  );
  const accountsOf = (clientId) => accounts.filter((a) => a.client_id === clientId);

  // Sync job + snapshot + holdings
  const job = (await ok(
    supabase
      .from("sync_jobs")
      .insert({
        kind: "addepar_nightly",
        status: "done",
        stats: { seed: "true", positions: 14 },
        started_at: today.toISOString(),
        finished_at: today.toISOString(),
      })
      .select("id"),
    "sync_job",
  ))[0];
  const snapshot = (await ok(
    supabase
      .from("snapshots")
      .insert({ sync_job_id: job.id, as_of: iso(today), source: "seed" })
      .select("id"),
    "snapshot",
  ))[0];

  const H = (accountId, symbol, description, assetClass, mv, qty = null, price = null) => ({
    snapshot_id: snapshot.id,
    account_id: accountId,
    as_of: iso(today),
    symbol,
    description,
    asset_class: assetClass,
    quantity: qty,
    price,
    market_value: mv,
    currency: "USD",
  });
  const [r1, r2] = accountsOf(ricardo.id).map((a) => a.id);
  const [b1, b2] = accountsOf(beatriz.id).map((a) => a.id);
  const [f1, f2] = accountsOf(fernanda.id).map((a) => a.id);
  await ok(
    supabase.from("holdings").insert([
      // Ricardo: GLD (US-situs flag) + cash heavy (cash drag)
      H(r1, "GLD", "SPDR Gold Shares", "Gold", 180000, 550, 327.27),
      H(r1, "VOO", "Vanguard S&P 500", "US equities", 620000, 1000, 620),
      H(r1, null, "USD Cash", "Cash & equivalents", 150000),
      H(r2, "AGGU", "iShares Global Agg UCITS", "IG fixed income", 450000, 9000, 50),
      H(r2, "EMB", "iShares JPM EM Bond", "HY & EM fixed income", 100000, 1100, 90.9),
      // Beatriz: conservative
      H(b1, "IB01", "iShares $ Treasury 0-1yr UCITS", "Cash & equivalents", 90000, 900, 100),
      H(b1, "AGGU", "iShares Global Agg UCITS", "IG fixed income", 700000, 14000, 50),
      H(b2, "VEA", "Vanguard Developed Markets", "Intl developed equities", 210000, 4000, 52.5),
      H(b2, null, "USD Cash", "Cash & equivalents", 15000),
      // Fernanda: aggressive
      H(f1, "QQQ", "Invesco QQQ", "US equities", 520000, 900, 577.78),
      H(f1, "VWO", "Vanguard EM", "EM equities", 260000, 5500, 47.27),
      H(f2, "VNQ", "Vanguard REIT", "Real assets & REITs", 130000, 1400, 92.86),
      H(f2, "ICLN", "iShares Clean Energy", "Intl developed equities", 90000, 6000, 15),
      H(f2, null, "USD Cash", "Cash & equivalents", 20000),
    ]),
    "holdings",
  );

  // 90 days of transactions
  const activities = ["buy", "sell", "dividend", "contribution", "withdrawal", "fee"];
  const txRows = [];
  let txN = 0;
  for (const a of accounts) {
    for (let d = 85; d >= 5; d -= 10) {
      const activity = activities[txN % activities.length];
      const amount =
        activity === "withdrawal" || activity === "fee" || activity === "buy"
          ? -(1000 + (txN % 7) * 850)
          : 1200 + (txN % 5) * 990;
      txRows.push({
        account_id: a.id,
        addepar_transaction_id: `seed-tx-${++txN}`,
        trade_date: iso(daysAgo(d)),
        activity,
        description: `${TAG} ${activity}`,
        amount,
        currency: "USD",
      });
    }
  }
  await ok(supabase.from("transactions").insert(txRows), "transactions");

  // TWR series: weekly cumulative fractions for 1Y + YTD
  const perfRows = [];
  const targets = [
    { scope: "household", id: h1.id, drift: 0.0018 },
    { scope: "household", id: h2.id, drift: 0.0026 },
    { scope: "client", id: ricardo.id, drift: 0.0016 },
    { scope: "client", id: beatriz.id, drift: 0.001 },
    { scope: "client", id: fernanda.id, drift: 0.003 },
  ];
  for (const t of targets) {
    let cum1y = 0;
    for (let w = 52; w >= 0; w--) {
      const wobble = Math.sin((52 - w) * 1.7 + t.drift * 1000) * 0.011;
      cum1y = (1 + cum1y) * (1 + t.drift + wobble) - 1;
      perfRows.push({
        scope: t.scope,
        scope_id: t.id,
        period: "one_year",
        as_of: iso(daysAgo(w * 7)),
        twr: Number(cum1y.toFixed(6)),
      });
    }
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const weeksYtd = Math.floor((today - yearStart) / (7 * 86400000));
    let cumYtd = 0;
    for (let w = weeksYtd; w >= 0; w--) {
      const wobble = Math.sin((weeksYtd - w) * 1.3) * 0.009;
      cumYtd = (1 + cumYtd) * (1 + t.drift + wobble) - 1;
      perfRows.push({
        scope: t.scope,
        scope_id: t.id,
        period: "ytd",
        as_of: iso(daysAgo(w * 7)),
        twr: Number(cumYtd.toFixed(6)),
      });
    }
  }
  await ok(supabase.from("performance_points").insert(perfRows), "performance_points");

  // Flags the engine would raise for this data
  await ok(
    supabase.from("portfolio_flags").insert([
      {
        scope: "client",
        scope_id: ricardo.id,
        snapshot_id: snapshot.id,
        code: "US_SITUS_BR_CLIENT",
        severity: "warning",
        message: `${TAG} Ricardo Almeida holds US-situs instruments (GLD) with US estate-tax exposure for Brazil-domiciled NRAs. UCITS alternatives: SGLN, IGLN.`,
      },
      {
        scope: "household",
        scope_id: h1.id,
        snapshot_id: snapshot.id,
        code: "CASH_DRAG",
        severity: "warning",
        message: `${TAG} Cash & equivalents are 11.3% of portfolio value (threshold 5%). IB01 may serve as interim parking; advisor decision.`,
      },
    ]),
    "portfolio_flags",
  );

  // 2 draft models from seeded strategies
  const strategies = await ok(supabase.from("strategies").select("id, key"), "strategies");
  const sid = (key) => strategies.find((s) => s.key === key)?.id;
  const [m1, m2] = await ok(
    supabase
      .from("models")
      .insert([
        { name: `${TAG} Moderado Global`, risk_profile: "moderado", status: "draft" },
        { name: `${TAG} Agressivo Growth`, risk_profile: "agressivo", status: "draft" },
      ])
      .select("id"),
    "models",
  );
  await ok(
    supabase.from("model_sleeves").insert([
      { model_id: m1.id, strategy_id: sid("NEUTRAL"), target_weight: 40 },
      { model_id: m1.id, strategy_id: sid("FUNDAMENTALS_CONSERVATIVE"), target_weight: 30 },
      { model_id: m1.id, strategy_id: sid("CASH_SIGNAL"), target_weight: 20 },
      { model_id: m1.id, strategy_id: sid("OURO"), target_weight: 10 },
      { model_id: m2.id, strategy_id: sid("NEW_TRENDS"), target_weight: 40 },
      { model_id: m2.id, strategy_id: sid("GLOBAL_GROWTH"), target_weight: 30 },
      { model_id: m2.id, strategy_id: sid("ENERGY"), target_weight: 20 },
      { model_id: m2.id, strategy_id: sid("OURO"), target_weight: 10 },
    ]),
    "model_sleeves",
  );

  // 5 tickets (one breached urgent) + a system event each
  const ticketDefs = [
    { title: `${TAG} Wire instructions for Almeida IBKR`, category: "operations", priority: "urgent", status: "in_progress", due: daysAgo(2), client: ricardo.id },
    { title: `${TAG} Rebalance Costa household`, category: "trading", priority: "high", status: "new", due: daysAgo(-2), client: fernanda.id },
    { title: `${TAG} Q2 report for Beatriz`, category: "reporting", priority: "medium", status: "waiting_client", due: daysAgo(-4), client: beatriz.id },
    { title: `${TAG} W-8BEN renewal`, category: "tax", priority: "medium", status: "waiting_custodian", due: daysAgo(-5), client: ricardo.id },
    { title: `${TAG} Onboard Costa second account`, category: "onboarding", priority: "low", status: "resolved", due: daysAgo(-9), client: fernanda.id },
  ];
  const tickets = await ok(
    supabase
      .from("tickets")
      .insert(
        ticketDefs.map((t) => ({
          title: t.title,
          description: "Seeded ticket for development.",
          client_id: t.client,
          category: t.category,
          priority: t.priority,
          status: t.status,
          created_by: adminId,
          assignee_id: adminId,
          due_at: t.due.toISOString(),
        })),
      )
      .select("id"),
    "tickets",
  );
  await ok(
    supabase.from("ticket_events").insert(
      tickets.map((t) => ({
        ticket_id: t.id,
        author_id: adminId,
        kind: "system",
        body: "Seeded for development.",
      })),
    ),
    "ticket_events",
  );

  // 3 intake rows
  await ok(
    supabase.from("intake_submissions").insert([
      {
        source: "seed",
        raw: { name: "Paulo Mendes", email: "paulo@example.com", country: "BR", investable_range: "USD 1-5M" },
        name: "Paulo Mendes",
        email: "paulo@example.com",
        country: "BR",
        investable_range: "USD 1-5M",
        status: "new_lead",
        dedupe_hash: "seed-intake-1",
        signature_valid: false,
      },
      {
        source: "seed",
        raw: { name: "Carla Nunes", email: "carla@example.com", country: "BR" },
        name: "Carla Nunes",
        email: "carla@example.com",
        country: "BR",
        status: "discovery_scheduled",
        dedupe_hash: "seed-intake-2",
        signature_valid: false,
      },
      {
        source: "seed",
        raw: { name: "John Harris", email: "john@example.com", country: "US" },
        name: "John Harris",
        email: "john@example.com",
        country: "US",
        status: "proposal_in_progress",
        dedupe_hash: "seed-intake-3",
        signature_valid: false,
      },
    ]),
    "intake",
  );

  console.log("seeded: 2 households, 3 clients, 6 accounts, 1 snapshot (14 holdings),");
  console.log(`${txRows.length} transactions, ${perfRows.length} TWR points, 2 flags, 2 draft models, 5 tickets, 3 intake rows`);
  console.log("undo with: node scripts/seed.mjs --undo");
}

if (process.argv.includes("--undo")) {
  await undo();
} else {
  await seed();
}
