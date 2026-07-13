-- 0001 revoked update/delete on audit_log but the default grants also include
-- TRUNCATE, which is not subject to RLS. Remove every write path except INSERT
-- for the client-facing roles so audit_log is append-only without exceptions.

revoke truncate, references, trigger on public.audit_log from anon, authenticated;
