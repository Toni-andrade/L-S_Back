import "server-only";
import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * The single audit helper. Every mutation in the app goes through this,
 * no exceptions (Section 12). Writes as the acting user so the RLS policy
 * (insert-only, actor_id = auth.uid()) holds; audit_log rows are append-only
 * at the database level.
 *
 * Throws if the write fails: a mutation whose audit trail cannot be recorded
 * must not be treated as successful.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("writeAudit: no authenticated user");

  const ip = await requestIp();

  const { error } = await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip,
  });
  if (error) throw new Error(`writeAudit failed: ${error.message}`);
}

/** System-actor variant for sync workers and webhooks (service role, no session). */
export async function writeSystemAudit(input: AuditInput): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("audit_log").insert({
    actor_id: null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: null,
  });
  if (error) throw new Error(`writeSystemAudit failed: ${error.message}`);
}

async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return fwd ? (fwd.split(",")[0]?.trim() ?? null) : (h.get("x-real-ip") ?? null);
  } catch {
    return null;
  }
}
