"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const categorySchema = z.enum([
  "operations",
  "trading",
  "reporting",
  "tax",
  "onboarding",
  "tech",
  "other",
]);

export async function saveCannedResponse(formData: FormData): Promise<void> {
  const user = await requireRole("ops", "admin");
  const title = z.string().trim().min(3).parse(formData.get("title"));
  const body = z.string().trim().min(3).parse(formData.get("body"));
  const categoryRaw = (formData.get("category") as string | null) || "";
  const category = categoryRaw === "" ? null : categorySchema.parse(categoryRaw);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("canned_responses")
    .insert({ title, body, category, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(`canned response insert failed: ${error?.message}`);

  await writeAudit({
    action: "canned_response.create",
    entityType: "canned_responses",
    entityId: data.id,
    after: { title, category },
  });
  revalidatePath("/settings");
}

export async function setCannedResponseActive(formData: FormData): Promise<void> {
  await requireRole("ops", "admin");
  const id = uuid.parse(formData.get("id"));
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("canned_responses").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "canned_response.set_active",
    entityType: "canned_responses",
    entityId: id,
    after: { active },
  });
  revalidatePath("/settings");
}
