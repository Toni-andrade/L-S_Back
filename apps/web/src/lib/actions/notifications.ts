"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

/** Owner-scoped by RLS: users can only mark their own notifications. */
export async function markNotificationRead(formData: FormData): Promise<void> {
  await requireUser();
  const id = uuid.parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
