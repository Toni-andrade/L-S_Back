// Post-apply verification for migration 0013.
import pg from "pg";

const client = new pg.Client({
  host: "aws-1-us-west-2.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.pxkyrrvpjvxjmxxslzeq",
  password: process.env.LS_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const tables = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public'
       and table_name in ('canned_responses','ticket_links','notifications')
     order by table_name`,
  );
  console.log("new tables:", tables.rows.map((r) => r.table_name).join(", ") || "MISSING");

  const cols = await client.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and ((table_name = 'workflow_template_steps' and column_name in ('due_days','fields'))
         or (table_name = 'workflow_run_steps' and column_name in ('due_at','fields','data'))
         or (table_name = 'workflow_runs' and column_name = 'intake_submission_id'))
     order by table_name, column_name`,
  );
  console.log("new columns:", cols.rows.map((r) => `${r.table_name}.${r.column_name}`).join(", "));

  const seeds = await client.query(
    `select t.key, count(*) filter (where s.due_days is not null) as with_due,
            count(*) filter (where s.fields is not null) as with_fields
     from workflow_template_steps s join workflow_templates t on t.id = s.template_id
     group by t.key order by t.key`,
  );
  for (const r of seeds.rows) console.log(`seed ${r.key}: due_days=${r.with_due}, fields=${r.with_fields}`);

  const policies = await client.query(
    `select tablename, count(*) as policies from pg_policies
     where tablename in ('canned_responses','ticket_links','notifications')
     group by tablename order by tablename`,
  );
  for (const r of policies.rows) console.log(`rls ${r.tablename}: ${r.policies} policies`);
} finally {
  await client.end();
}
