"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const profileSchema = z.enum(["conservador", "moderado", "agressivo"]);
const modelStatusSchema = z.enum(["draft", "active", "retired"]);

/** Admin creates a model with its sleeves; weights must sum to 100 (DB trigger). */
export async function createModel(formData: FormData): Promise<void> {
  await requireRole("admin");
  const name = z.string().trim().min(2).parse(formData.get("name"));
  const riskProfile = profileSchema.parse(formData.get("riskProfile"));
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  const strategyIds = formData.getAll("sleeveStrategyId").map(String);
  const weights = formData.getAll("sleeveWeight").map(String);
  const sleeves = strategyIds
    .map((sid, i) => ({ strategy_id: sid, target_weight: Number(weights[i] ?? 0) }))
    .filter((s) => s.strategy_id !== "" && s.target_weight > 0);
  if (sleeves.length === 0) throw new Error("a model needs at least one sleeve");
  const total = sleeves.reduce((sum, s) => sum + s.target_weight, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(`sleeve weights must sum to 100 (got ${total})`);
  }

  const supabase = await createClient();
  const { data: model, error } = await supabase
    .from("models")
    .insert({ name, risk_profile: riskProfile, notes })
    .select("id")
    .single();
  if (error || !model) throw new Error(`model insert failed: ${error?.message}`);

  const { error: sleevesError } = await supabase.from("model_sleeves").insert(
    sleeves.map((s) => ({
      model_id: model.id,
      strategy_id: uuid.parse(s.strategy_id),
      target_weight: s.target_weight,
    })),
  );
  if (sleevesError) {
    await supabase.from("models").delete().eq("id", model.id);
    throw new Error(`sleeves insert failed: ${sleevesError.message}`);
  }

  await writeAudit({
    action: "model.create",
    entityType: "models",
    entityId: model.id,
    after: { name, risk_profile: riskProfile, sleeves },
  });
  revalidatePath("/models");
}

export async function updateModelStatus(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = uuid.parse(formData.get("id"));
  const to = modelStatusSchema.parse(formData.get("to"));

  const supabase = await createClient();
  const { data: before } = await supabase.from("models").select("status").eq("id", id).single();
  if (!before) throw new Error("model not found");

  if (to === "active") {
    const { data: sleeves } = await supabase
      .from("model_sleeves")
      .select("target_weight")
      .eq("model_id", id);
    const total = (sleeves ?? []).reduce((s, r) => s + Number(r.target_weight), 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new Error("a model can only be activated with sleeves summing to 100");
    }
  }

  const { error } = await supabase.from("models").update({ status: to }).eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "model.status",
    entityType: "models",
    entityId: id,
    before: { status: before.status },
    after: { status: to },
  });
  revalidatePath("/models");
}
