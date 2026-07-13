"use server";

import { userRoleSchema } from "@ls/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

export async function setUserActive(formData: FormData): Promise<void> {
  await requireRole("admin");
  const userId = uuid.parse(formData.get("userId"));
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("users")
    .select("id, email, role, active")
    .eq("id", userId)
    .single();

  const { error } = await supabase.from("users").update({ active }).eq("id", userId);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: active ? "user.activate" : "user.deactivate",
    entityType: "users",
    entityId: userId,
    before,
    after: { ...before, active },
  });
  revalidatePath("/settings");
}

export async function setUserRole(formData: FormData): Promise<void> {
  await requireRole("admin");
  const userId = uuid.parse(formData.get("userId"));
  const role = userRoleSchema.parse(formData.get("role"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("users")
    .select("id, email, role, active")
    .eq("id", userId)
    .single();

  const { error } = await supabase.from("users").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "user.role_change",
    entityType: "users",
    entityId: userId,
    before,
    after: { ...before, role },
  });
  revalidatePath("/settings");
}

export async function addAllowedEmail(formData: FormData): Promise<void> {
  await requireRole("admin");
  const email = z.string().trim().toLowerCase().email().parse(formData.get("email"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("allowed_emails")
    .insert({ email })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "allowlist.add_email",
    entityType: "allowed_emails",
    entityId: data.id,
    after: { email },
  });
  revalidatePath("/settings");
}

export async function removeAllowedEmail(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = uuid.parse(formData.get("id"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("allowed_emails")
    .select("id, email")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("allowed_emails").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "allowlist.remove_email",
    entityType: "allowed_emails",
    entityId: id,
    before,
  });
  revalidatePath("/settings");
}
