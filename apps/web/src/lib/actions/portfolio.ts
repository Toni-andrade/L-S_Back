"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { addeparConfigured } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { runAddeparSync } from "@/lib/sync/run-sync";

const scopeSchema = z.enum(["household", "client"]);
const uuid = z.string().uuid();

/** "Review Portfolio": anchors the Portfolio Changes window (Section 6). */
export async function reviewPortfolio(formData: FormData): Promise<void> {
  const user = await requireUser();
  const scope = scopeSchema.parse(formData.get("scope"));
  const scopeId = uuid.parse(formData.get("scopeId"));
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_reviews")
    .insert({ scope, scope_id: scopeId, reviewed_by: user.id, notes })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "portfolio.review",
    entityType: "portfolio_reviews",
    entityId: data.id,
    after: { scope, scope_id: scopeId, notes },
  });
  revalidatePath(`/portfolio-review/${scope}/${scopeId}`);
}

/** Acknowledge a flag; a reason is mandatory (DB check enforces it too). */
export async function acknowledgeFlag(formData: FormData): Promise<void> {
  const user = await requireUser();
  const flagId = uuid.parse(formData.get("flagId"));
  const reason = z.string().trim().min(3).parse(formData.get("reason"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("portfolio_flags")
    .select("id, scope, scope_id, code, severity, acknowledged_at")
    .eq("id", flagId)
    .single();
  if (!before) throw new Error("flag not found");

  const { error } = await supabase
    .from("portfolio_flags")
    .update({
      acknowledged_by: user.id,
      acknowledged_at: new Date().toISOString(),
      ack_reason: reason,
    })
    .eq("id", flagId);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "flag.acknowledge",
    entityType: "portfolio_flags",
    entityId: flagId,
    before,
    after: { ack_reason: reason },
  });
  revalidatePath(`/portfolio-review/${before.scope}/${before.scope_id}`);
}

/** "Refresh Addepar Data": scoped GROUP/ENTITY query + transactions delta. */
export async function refreshAddeparData(formData: FormData): Promise<void> {
  await requireUser();
  const scope = scopeSchema.parse(formData.get("scope"));
  const scopeId = uuid.parse(formData.get("scopeId"));
  if (!addeparConfigured()) throw new Error("Addepar is not configured");

  const result = await runAddeparSync({
    kind: "addepar_on_demand",
    target: { scope, scopeId },
  });
  await writeAudit({
    action: "sync.on_demand",
    entityType: "sync_jobs",
    entityId: result.jobId,
    after: { scope, scopeId, status: result.status },
  });
  revalidatePath(`/portfolio-review/${scope}/${scopeId}`);
  revalidatePath("/integrations");
}
