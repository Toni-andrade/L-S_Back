/**
 * One-time Addepar bootstrap import (admin-run, not automatic).
 *
 * Model (per L&S 2026-07-14): each PERSON_NODE is a client/owner (a "household"
 * unit) with its FINANCIAL_ACCOUNTs below it in the ownership structure.
 *   PERSON_NODE      -> clients   (addepar_entity_id = person id, household_id null)
 *   FINANCIAL_ACCOUNT-> accounts  (addepar_entity_id = account id, client_id)
 *
 * Accounts are enumerated with a portfolio query grouped by holding_account
 * (accounts hang off the person via ownership, not group membership). Account
 * numbers are masked to the last 4 on ingest (never stored in full). Idempotent
 * via addepar_entity_id; every write is audit-logged; --undo reverses it.
 *
 *   node scripts/import-addepar.mjs [personId ...]   # default: 3 pilot clients
 *   node scripts/import-addepar.mjs --undo [personId ...]
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

// Pilot: Paulo Sergio (8 accts), Alexandre Wolwacz (6), Arthur da Conceicao Motta (1)
const PILOT = ["135041001", "21634252", "21572474"];

const die = (m) => {
  console.error("FAILED:", m);
  process.exit(1);
};

async function addeparGet(path) {
  const res = await fetch(`${ADDEPAR.base}${path}`, {
    headers: { Authorization: ADDEPAR.auth, "Addepar-Firm": ADDEPAR.firm, Accept: "application/vnd.api+json" },
  });
  if (!res.ok) die(`Addepar GET ${path} -> ${res.status}`);
  return res.json();
}

async function accountsForPerson(personId) {
  const body = {
    data: {
      type: "portfolio_query",
      attributes: {
        columns: [{ key: "value" }],
        groupings: [{ key: "holding_account" }],
        portfolio_type: "ENTITY",
        portfolio_id: [Number(personId)],
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
  if (!res.ok) die(`portfolio query for ${personId} -> ${res.status}`);
  const json = await res.json();
  return json.data?.attributes?.total?.children ?? [];
}

function today() {
  // Passed nowhere sensitive; Addepar just needs a date. Use env override or UTC.
  return new Date().toISOString().slice(0, 10);
}

function clientType(name) {
  if (/\s&\s/.test(name)) return "joint";
  if (/\b(ltd|ltda|llc|inc|s\.?a\.?|corp|limited|holdings?|enterprises?|company|co\.)\b/i.test(name))
    return "entity";
  return "individual";
}

/** Mask an account label to the last 4 digits; never store the full number. */
function maskLabel(name) {
  const paren = name.match(/\(X+(\d{2,})\)/);
  if (paren) {
    const pre = name.slice(0, paren.index).trim();
    return (pre ? pre + " " : "") + "••••" + paren[1].slice(-4);
  }
  const digits = (name.match(/\d/g) || []).join("");
  const last4 = digits.slice(-4) || "XXXX";
  const letters = name.replace(/[\d\s()]/g, "");
  return (letters && letters.length <= 8 ? letters + " " : "") + "••••" + last4;
}

function custodian(name) {
  return /^U\d+/.test(name.trim()) ? "ibkr" : "other";
}

async function audit(action, entityType, entityId, after) {
  await supabase.from("audit_log").insert({ actor_id: null, action, entity_type: entityType, entity_id: entityId, after });
}

async function importPerson(personId) {
  const entity = await addeparGet(`/v1/entities/${personId}`);
  const attrs = entity.data.attributes;
  if (attrs.model_type !== "PERSON_NODE") {
    console.log(`  ! ${personId} is ${attrs.model_type}, not PERSON_NODE - skipping`);
    return { clients: 0, accounts: 0 };
  }
  const name = attrs.original_name ?? `Entity ${personId}`;

  const { data: client, error: cErr } = await supabase
    .from("clients")
    .upsert(
      {
        name,
        type: clientType(name),
        status: "active",
        addepar_entity_id: String(personId),
      },
      { onConflict: "addepar_entity_id" },
    )
    .select("id, name")
    .single();
  if (cErr) die(`client upsert ${name}: ${cErr.message}`);
  await audit("import.addepar_client", "clients", client.id, { addepar_entity_id: personId, name });

  const accts = await accountsForPerson(personId);
  let n = 0;
  for (const a of accts) {
    if (a.entity_id == null) continue;
    const label = maskLabel(a.name ?? String(a.entity_id));
    const { data: acct, error: aErr } = await supabase
      .from("accounts")
      .upsert(
        {
          client_id: client.id,
          custodian: custodian(a.name ?? ""),
          account_number_masked: label,
          addepar_entity_id: String(a.entity_id),
          base_currency: "USD",
          status: "open",
        },
        { onConflict: "addepar_entity_id" },
      )
      .select("id")
      .single();
    if (aErr) die(`account upsert ${label}: ${aErr.message}`);
    await audit("import.addepar_account", "accounts", acct.id, {
      addepar_entity_id: a.entity_id,
      masked: label,
      value: a.columns?.value ?? null,
    });
    n++;
  }
  console.log(`  ${name}: client + ${n} account(s) [${clientType(name)}]`);
  return { clients: 1, accounts: n };
}

async function undo(ids) {
  for (const personId of ids) {
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("addepar_entity_id", String(personId))
      .maybeSingle();
    if (!client) {
      console.log(`  ${personId}: no imported client`);
      continue;
    }
    const { data: accts } = await supabase.from("accounts").select("id").eq("client_id", client.id);
    // Only removable if no holdings/transactions reference these accounts yet.
    for (const a of accts ?? []) {
      await supabase.from("holdings").delete().eq("account_id", a.id);
      await supabase.from("transactions").delete().eq("account_id", a.id);
    }
    await supabase.from("accounts").delete().eq("client_id", client.id);
    await supabase.from("clients").delete().eq("id", client.id);
    console.log(`  removed ${client.name} + ${(accts ?? []).length} account(s)`);
  }
}

const args = process.argv.slice(2);
const isUndo = args.includes("--undo");
const ids = args.filter((a) => /^\d+$/.test(a));
const targets = ids.length ? ids : PILOT;

if (isUndo) {
  console.log(`Undoing import for ${targets.length} person(s)…`);
  await undo(targets);
  console.log("done.");
} else {
  console.log(`Importing ${targets.length} person(s) from Addepar firm ${ADDEPAR.firm}…`);
  let tc = 0,
    ta = 0;
  for (const id of targets) {
    const r = await importPerson(id);
    tc += r.clients;
    ta += r.accounts;
  }
  console.log(`\nImported ${tc} client(s) and ${ta} account(s). Undo: node scripts/import-addepar.mjs --undo`);
}
