"use server";

import {
  INTAKE_STAGES,
  mapIntakePayload,
  parseCsv,
  ticketDueAt,
  type IntakeStatus,
} from "@ls/domain";
import { intakeDedupeHash } from "@ls/domain/webhook";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { INTAKE_FIELD_MAP } from "@/lib/intake/config";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const stageSchema = z.enum([
  "new_lead",
  "discovery_scheduled",
  "proposal_in_progress",
  "pending_onboarding",
]);

/** One-click stage move between active pipeline stages (Section 5). */
export async function moveIntakeStage(formData: FormData): Promise<void> {
  await requireRole("ops", "admin");
  const id = uuid.parse(formData.get("id"));
  const to = stageSchema.parse(formData.get("to"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("intake_submissions")
    .select("id, status")
    .eq("id", id)
    .single();
  if (!before) throw new Error("submission not found");
  if (!INTAKE_STAGES.includes(before.status as IntakeStatus)) {
    throw new Error("submission is in a terminal state");
  }

  const { error } = await supabase.from("intake_submissions").update({ status: to }).eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "intake.stage_move",
    entityType: "intake_submissions",
    entityId: id,
    before: { status: before.status },
    after: { status: to },
  });
  revalidatePath("/intake");
  revalidatePath(`/intake/${id}`);
}

/** Discard with a mandatory reason. */
export async function discardIntake(formData: FormData): Promise<void> {
  await requireRole("ops", "admin");
  const id = uuid.parse(formData.get("id"));
  const reason = z.string().trim().min(3).parse(formData.get("reason"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("intake_submissions")
    .select("id, status")
    .eq("id", id)
    .single();
  if (!before) throw new Error("submission not found");

  const { error } = await supabase
    .from("intake_submissions")
    .update({ status: "discarded", discard_reason: reason })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "intake.discard",
    entityType: "intake_submissions",
    entityId: id,
    before: { status: before.status },
    after: { status: "discarded", discard_reason: reason },
  });
  revalidatePath("/intake");
  revalidatePath(`/intake/${id}`);
}

/**
 * Convert to prospect: creates the clients row (status prospect) and
 * optionally an onboarding ticket. Uses the service client for the multi-table
 * write because intake conversion is an ops/admin operation while the clients
 * RLS write policy is advisor/admin; the requireRole guard plus audit rows
 * cover the bypass. The prefilled draft proposal hook lands in Phase 3.
 */
export async function convertIntake(formData: FormData): Promise<void> {
  const user = await requireRole("ops", "admin");
  const id = uuid.parse(formData.get("id"));
  const createTicket = formData.get("createTicket") === "on";

  const service = createServiceClient();
  const { data: submission } = await service
    .from("intake_submissions")
    .select("id, status, name, email, phone, country, investable_range, message")
    .eq("id", id)
    .single();
  if (!submission) throw new Error("submission not found");
  if (submission.status === "converted" || submission.status === "discarded") {
    throw new Error("submission is in a terminal state");
  }

  const notes = [
    submission.email && `Email: ${submission.email}`,
    submission.phone && `Phone: ${submission.phone}`,
    submission.investable_range && `Investable range: ${submission.investable_range}`,
    submission.message && `Message: ${submission.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: client, error: clientError } = await service
    .from("clients")
    .insert({
      name: submission.name ?? submission.email ?? "Unnamed prospect",
      status: "prospect",
      domicile_country: submission.country?.length === 2 ? submission.country.toUpperCase() : null,
      created_from_intake_id: submission.id,
      notes: notes || null,
    })
    .select("id, name")
    .single();
  if (clientError || !client) throw new Error(`client insert failed: ${clientError?.message}`);

  const { error: updateError } = await service
    .from("intake_submissions")
    .update({ status: "converted", converted_client_id: client.id })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  await writeAudit({
    action: "intake.convert",
    entityType: "intake_submissions",
    entityId: id,
    before: { status: submission.status },
    after: { status: "converted", converted_client_id: client.id },
  });

  let ticketId: string | null = null;
  if (createTicket) {
    const now = new Date();
    const { data: ticket, error: ticketError } = await service
      .from("tickets")
      .insert({
        title: `Onboard ${client.name}`,
        description: `Created automatically from intake conversion.`,
        client_id: client.id,
        category: "onboarding",
        priority: "medium",
        created_by: user.id,
        due_at: ticketDueAt(now, "medium").toISOString(),
      })
      .select("id, number")
      .single();
    if (ticketError || !ticket) throw new Error(`ticket insert failed: ${ticketError?.message}`);
    ticketId = ticket.id;
    await service.from("ticket_events").insert({
      ticket_id: ticket.id,
      author_id: user.id,
      kind: "system",
      body: `Created from intake conversion of ${client.name}.`,
    });
    await writeAudit({
      action: "ticket.create",
      entityType: "tickets",
      entityId: ticket.id,
      after: { number: ticket.number, source: "intake_conversion", client_id: client.id },
    });
  }

  revalidatePath("/intake");
  revalidatePath("/clients");
  redirect(ticketId ? `/tickets/${ticketId}` : `/intake/${id}`);
}

/**
 * Manual import fallback (Section 5): paste JSON (object or array) or CSV.
 * Same mapper and dedupe path as the webhook; signature_valid=false,
 * source=manual_import.
 */
export async function importIntakeManual(formData: FormData): Promise<void> {
  await requireRole("ops", "admin");
  const format = z.enum(["json", "csv"]).parse(formData.get("format"));
  const text = z.string().trim().min(2).parse(formData.get("payload"));

  let rows: Record<string, unknown>[];
  if (format === "csv") {
    rows = parseCsv(text);
  } else {
    const parsed: unknown = JSON.parse(text);
    rows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [parsed as Record<string, unknown>];
  }
  if (rows.length === 0) throw new Error("no records found in the pasted payload");
  if (rows.length > 500) throw new Error("import capped at 500 records per paste");

  const service = createServiceClient();
  const receivedDate = new Date().toISOString().slice(0, 10);
  let imported = 0;
  let duplicates = 0;

  for (const raw of rows) {
    const mapped = mapIntakePayload(raw, INTAKE_FIELD_MAP);
    const dedupeHash = intakeDedupeHash(mapped.email, receivedDate, mapped as Record<string, unknown>);
    const { data, error } = await service
      .from("intake_submissions")
      .insert({
        source: "manual_import",
        raw,
        ...mapped,
        dedupe_hash: dedupeHash,
        signature_valid: false,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        duplicates += 1;
        continue;
      }
      throw new Error(error.message);
    }
    imported += 1;
    await writeAudit({
      action: "intake.manual_import",
      entityType: "intake_submissions",
      entityId: data.id,
      after: { email: mapped.email, name: mapped.name },
    });
  }

  revalidatePath("/intake");
  redirect(`/intake?imported=${imported}&duplicates=${duplicates}`);
}
