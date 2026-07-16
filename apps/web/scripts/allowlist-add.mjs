// One-off ops helper: add an email to the signup allowlist (service role) with
// a system audit row. Usage: node scripts/allowlist-add.mjs someone@ls.finance "note"
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const note = process.argv[3] ?? null;
if (!email || !email.includes("@")) {
  console.error("usage: node scripts/allowlist-add.mjs <email> [note]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existing } = await supabase
  .from("allowed_emails")
  .select("id, email")
  .eq("email", email)
  .maybeSingle();
if (existing) {
  console.log(`already allowlisted: ${email} (${existing.id})`);
  process.exit(0);
}

const { data, error } = await supabase
  .from("allowed_emails")
  .insert({ email, ...(note ? { note } : {}) })
  .select("id")
  .single();
if (error) {
  console.error(`insert failed: ${error.message}`);
  process.exit(1);
}

const { error: auditErr } = await supabase.from("audit_log").insert({
  actor_id: null,
  action: "allowlist.add_email",
  entity_type: "allowed_emails",
  entity_id: data.id,
  before: null,
  after: { email, note, source: "ops_script" },
  ip: null,
});
if (auditErr) console.error(`warning: audit write failed: ${auditErr.message}`);

console.log(`allowlisted: ${email} (${data.id})`);
