"use server";

import { TICKET_STATUS_LABEL, ticketDueAt, type TicketStatus } from "@ls/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
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
const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const statusSchema = z.enum([
  "new",
  "in_progress",
  "waiting_client",
  "waiting_custodian",
  "resolved",
  "closed",
]);

/** Any active internal user creates tickets as themselves (approved deviation
 *  from the spec's ops+admin table: advisors have "Open Ticket" on review pages). */
export async function createTicket(formData: FormData): Promise<void> {
  const user = await requireUser();
  const title = z.string().trim().min(3).parse(formData.get("title"));
  const description = (formData.get("description") as string | null)?.trim() || null;
  const category = categorySchema.parse(formData.get("category"));
  const priority = prioritySchema.parse(formData.get("priority"));
  const clientId = (formData.get("clientId") as string | null) || null;
  const assigneeId = (formData.get("assigneeId") as string | null) || null;

  const supabase = await createClient();
  const now = new Date();
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      title,
      description,
      category,
      priority,
      client_id: clientId ? uuid.parse(clientId) : null,
      assignee_id: assigneeId ? uuid.parse(assigneeId) : null,
      created_by: user.id,
      due_at: ticketDueAt(now, priority).toISOString(),
    })
    .select("id, number")
    .single();
  if (error || !ticket) throw new Error(`ticket insert failed: ${error?.message}`);

  await supabase.from("ticket_events").insert({
    ticket_id: ticket.id,
    author_id: user.id,
    kind: "system",
    body: `Ticket ${ticket.number} created.`,
  });
  await writeAudit({
    action: "ticket.create",
    entityType: "tickets",
    entityId: ticket.id,
    after: { number: ticket.number, title, category, priority },
  });
  revalidatePath("/tickets");
  redirect(`/tickets/${ticket.id}`);
}

export async function updateTicketStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const to = statusSchema.parse(formData.get("to"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("tickets")
    .select("id, number, status")
    .eq("id", id)
    .single();
  if (!before) throw new Error("ticket not found");
  if (before.status === to) return;

  const { error } = await supabase.from("tickets").update({ status: to }).eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("ticket_events").insert({
    ticket_id: id,
    author_id: user.id,
    kind: "status_change",
    body: `Status: ${TICKET_STATUS_LABEL[before.status as TicketStatus]} -> ${TICKET_STATUS_LABEL[to]}`,
    meta: { from: before.status, to },
  });
  await writeAudit({
    action: "ticket.status",
    entityType: "tickets",
    entityId: id,
    before: { status: before.status },
    after: { status: to },
  });
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
}

export async function assignTicket(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const assigneeRaw = (formData.get("assigneeId") as string | null) || "";
  const assigneeId = assigneeRaw === "" ? null : uuid.parse(assigneeRaw);

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("tickets")
    .select("id, assignee_id")
    .eq("id", id)
    .single();
  if (!before) throw new Error("ticket not found");

  const { error } = await supabase.from("tickets").update({ assignee_id: assigneeId }).eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("ticket_events").insert({
    ticket_id: id,
    author_id: user.id,
    kind: "assignment",
    body: assigneeId ? "Ticket assigned." : "Ticket unassigned.",
    meta: { from: before.assignee_id, to: assigneeId },
  });
  await writeAudit({
    action: "ticket.assign",
    entityType: "tickets",
    entityId: id,
    before: { assignee_id: before.assignee_id },
    after: { assignee_id: assigneeId },
  });
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
}

export async function commentTicket(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const body = z.string().trim().min(1).parse(formData.get("body"));

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_events").insert({
    ticket_id: id,
    author_id: user.id,
    kind: "comment",
    body,
  });
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "ticket.comment",
    entityType: "tickets",
    entityId: id,
    after: { body_length: body.length },
  });
  revalidatePath(`/tickets/${id}`);
}
