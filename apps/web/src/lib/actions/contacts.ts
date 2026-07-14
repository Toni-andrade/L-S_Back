"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const contactType = z.enum(["call", "email", "meeting", "review", "note", "task", "other"]);
const contactDirection = z.enum(["inbound", "outbound", "internal"]);

/** Log a client contact/interaction (any active user, for a visible client). */
export async function logContact(formData: FormData): Promise<void> {
  const user = await requireUser();
  const clientId = uuid.parse(formData.get("clientId"));
  const type = contactType.parse(formData.get("type"));
  const direction = contactDirection.parse(formData.get("direction") ?? "outbound");
  const subject = (formData.get("subject") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;
  const occurredRaw = (formData.get("occurredAt") as string | null)?.trim();
  const followRaw = (formData.get("followUpAt") as string | null)?.trim();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      client_id: clientId,
      type,
      direction,
      subject,
      notes,
      logged_by: user.id,
      occurred_at: occurredRaw ? new Date(occurredRaw).toISOString() : new Date().toISOString(),
      follow_up_at: followRaw ? new Date(followRaw).toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "contact.log",
    entityType: "contacts",
    entityId: data.id,
    after: { client_id: clientId, type, direction },
  });
  revalidatePath(`/portfolio-review/client/${clientId}`);
  revalidatePath("/contacts");
}

export async function deleteContact(formData: FormData): Promise<void> {
  await requireUser();
  const id = uuid.parse(formData.get("id"));
  const clientId = uuid.parse(formData.get("clientId"));
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await writeAudit({ action: "contact.delete", entityType: "contacts", entityId: id });
  revalidatePath(`/portfolio-review/client/${clientId}`);
  revalidatePath("/contacts");
}

/** Admin: adjust an SLA policy's threshold or active state. */
export async function updateSlaPolicy(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = uuid.parse(formData.get("id"));
  const thresholdDays = z.coerce.number().int().positive().parse(formData.get("thresholdDays"));
  const businessDays = formData.get("businessDays") === "on";
  const active = formData.get("active") === "on";

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("sla_policies")
    .select("threshold_days, business_days, active")
    .eq("id", id)
    .single();
  const { error } = await supabase
    .from("sla_policies")
    .update({ threshold_days: thresholdDays, business_days: businessDays, active })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "sla.update",
    entityType: "sla_policies",
    entityId: id,
    before,
    after: { threshold_days: thresholdDays, business_days: businessDays, active },
  });
  revalidatePath("/settings");
}
