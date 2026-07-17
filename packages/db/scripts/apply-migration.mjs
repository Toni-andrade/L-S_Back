// Apply a migration file to the L&S database via the Supabase session pooler.
// Credentials come from env vars only (never files, never argv):
//   LS_DB_PASSWORD (required), LS_DB_USER, LS_DB_HOST
// Usage: node packages/db/scripts/apply-migration.mjs packages/db/migrations/0013_ops_productivity.sql
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node apply-migration.mjs <path-to-migration.sql>");
  process.exit(1);
}
if (!process.env.LS_DB_PASSWORD) {
  console.error("LS_DB_PASSWORD is not set");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({
  host: process.env.LS_DB_HOST ?? "aws-1-us-west-2.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: process.env.LS_DB_USER ?? "postgres.pxkyrrvpjvxjmxxslzeq",
  password: process.env.LS_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  // A multi-statement simple query runs as one implicit transaction:
  // the whole migration applies atomically or not at all.
  await client.query(sql);
  console.log(`applied: ${file}`);
} finally {
  await client.end();
}
