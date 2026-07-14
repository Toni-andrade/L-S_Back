"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const kind = z.enum(["filing", "attestation", "review", "complaint", "gift", "personal_trade", "other"]);
const status = z.enum(["open", "in_progress", "done", "waived"]);

/** Add a compliance item / register entry (ops + admin). */
export async function addComplianceItem(formData: FormData): Promise<void> {
  const user = await requireRole("ops", "admin");
  const parsed = {
    kind: kind.parse(formData.get("kind")),
    title: z.string().trim().min(2).parse(formData.get("title")),
    description: (formData.get("description") as string | null)?.trim() || null,
    dueDate: (formData.get("dueDate") as string | null)?.trim() || null,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compliance_items")
    .insert({
      kind: parsed.kind,
      title: parsed.title,
      description: parsed.description,
      due_date: parsed.dueDate,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "compliance.add",
    entityType: "compliance_items",
    entityId: data.id,
    after: parsed,
  });
  revalidatePath("/compliance");
}

export async function setComplianceStatus(formData: FormData): Promise<void> {
  const user = await requireRole("ops", "admin");
  const id = uuid.parse(formData.get("id"));
  const to = status.parse(formData.get("to"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("compliance_items")
    .select("status")
    .eq("id", id)
    .single();
  const resolved = to === "done" || to === "waived";
  const { error } = await supabase
    .from("compliance_items")
    .update({
      status: to,
      resolved_by: resolved ? user.id : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "compliance.status",
    entityType: "compliance_items",
    entityId: id,
    before,
    after: { status: to },
  });
  revalidatePath("/compliance");
}
