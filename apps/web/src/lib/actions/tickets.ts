"use server";

import { TICKET_STATUS_LABEL, ticketDueAt, type TicketStatus } from "@ls/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole, requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
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
  const comment = (formData.get("comment") as string | null)?.trim() || null;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("tickets")
    .select("id, number, title, assignee_id")
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
  if (comment) {
    await supabase.from("ticket_events").insert({
      ticket_id: id,
      author_id: user.id,
      kind: "comment",
      body: comment,
    });
  }
  await writeAudit({
    action: "ticket.assign",
    entityType: "tickets",
    entityId: id,
    before: { assignee_id: before.assignee_id },
    after: { assignee_id: assigneeId },
  });
  if (assigneeId && assigneeId !== user.id && assigneeId !== before.assignee_id) {
    await notify({
      userId: assigneeId,
      kind: "ticket_assigned",
      title: `Ticket assigned to you: ${before.number} ${before.title}`,
      body: comment,
      href: `/tickets/${id}`,
    });
  }
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
}

/** Re-prioritize one ticket; the SLA clock recomputes from creation. */
export async function changeTicketPriority(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const to = prioritySchema.parse(formData.get("to"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("tickets")
    .select("id, priority, created_at")
    .eq("id", id)
    .single();
  if (!before) throw new Error("ticket not found");
  if (before.priority === to) return;

  const due = ticketDueAt(new Date(before.created_at), to);
  const { error } = await supabase
    .from("tickets")
    .update({ priority: to, due_at: due.toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("ticket_events").insert({
    ticket_id: id,
    author_id: user.id,
    kind: "system",
    body: `Priority: ${before.priority} -> ${to}; SLA recalculated.`,
    meta: { from: before.priority, to },
  });
  await writeAudit({
    action: "ticket.priority",
    entityType: "tickets",
    entityId: id,
    before: { priority: before.priority },
    after: { priority: to, due_at: due.toISOString() },
  });
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
}

/** One-click "assign to me" from the ops queue / list views. */
export async function claimTicket(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("tickets")
    .select("id, assignee_id")
    .eq("id", id)
    .single();
  if (!before) throw new Error("ticket not found");
  if (before.assignee_id === user.id) return;

  const { error } = await supabase.from("tickets").update({ assignee_id: user.id }).eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("ticket_events").insert({
    ticket_id: id,
    author_id: user.id,
    kind: "assignment",
    body: "Ticket claimed.",
    meta: { from: before.assignee_id, to: user.id },
  });
  await writeAudit({
    action: "ticket.assign",
    entityType: "tickets",
    entityId: id,
    before: { assignee_id: before.assignee_id },
    after: { assignee_id: user.id, claimed: true },
  });
  revalidatePath("/");
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
}

const bulkOpSchema = z.enum(["assign", "status", "priority"]);

/** Batch triage from the ticket list: assign / set status / set priority. */
export async function bulkTicketAction(formData: FormData): Promise<void> {
  const user = await requireRole("ops", "admin");
  const ids = z.array(uuid).min(1).parse(formData.getAll("ids"));
  const op = bulkOpSchema.parse(formData.get("op"));
  const back = (formData.get("back") as string | null) || "/tickets";

  const supabase = await createClient();
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, number, title, status, priority, assignee_id, created_at")
    .in("id", ids);
  const rows = tickets ?? [];

  let assigneeId: string | null = null;
  let status: TicketStatus | null = null;
  let priority: "low" | "medium" | "high" | "urgent" | null = null;
  if (op === "assign") {
    const raw = (formData.get("value") as string | null) || "";
    assigneeId = raw === "" ? null : uuid.parse(raw);
  } else if (op === "status") {
    status = statusSchema.parse(formData.get("value"));
  } else {
    priority = prioritySchema.parse(formData.get("value"));
  }

  for (const t of rows) {
    if (op === "assign") {
      if (t.assignee_id === assigneeId) continue;
      const { error } = await supabase
        .from("tickets")
        .update({ assignee_id: assigneeId })
        .eq("id", t.id);
      if (error) throw new Error(error.message);
      await supabase.from("ticket_events").insert({
        ticket_id: t.id,
        author_id: user.id,
        kind: "assignment",
        body: assigneeId ? "Ticket assigned (bulk)." : "Ticket unassigned (bulk).",
        meta: { from: t.assignee_id, to: assigneeId, bulk: true },
      });
      await writeAudit({
        action: "ticket.assign",
        entityType: "tickets",
        entityId: t.id,
        before: { assignee_id: t.assignee_id },
        after: { assignee_id: assigneeId, bulk: true },
      });
      if (assigneeId && assigneeId !== user.id) {
        await notify({
          userId: assigneeId,
          kind: "ticket_assigned",
          title: `Ticket assigned to you: ${t.number} ${t.title}`,
          href: `/tickets/${t.id}`,
        });
      }
    } else if (op === "status") {
      if (t.status === status) continue;
      const { error } = await supabase.from("tickets").update({ status }).eq("id", t.id);
      if (error) throw new Error(error.message);
      await supabase.from("ticket_events").insert({
        ticket_id: t.id,
        author_id: user.id,
        kind: "status_change",
        body: `Status: ${TICKET_STATUS_LABEL[t.status as TicketStatus]} -> ${TICKET_STATUS_LABEL[status!]} (bulk)`,
        meta: { from: t.status, to: status, bulk: true },
      });
      await writeAudit({
        action: "ticket.status",
        entityType: "tickets",
        entityId: t.id,
        before: { status: t.status },
        after: { status, bulk: true },
      });
    } else {
      if (t.priority === priority) continue;
      // Re-triage recomputes the SLA clock from creation at the new priority.
      const due = ticketDueAt(new Date(t.created_at), priority!);
      const { error } = await supabase
        .from("tickets")
        .update({ priority, due_at: due.toISOString() })
        .eq("id", t.id);
      if (error) throw new Error(error.message);
      await supabase.from("ticket_events").insert({
        ticket_id: t.id,
        author_id: user.id,
        kind: "system",
        body: `Priority: ${t.priority} -> ${priority} (bulk); SLA recalculated.`,
        meta: { from: t.priority, to: priority, bulk: true },
      });
      await writeAudit({
        action: "ticket.priority",
        entityType: "tickets",
        entityId: t.id,
        before: { priority: t.priority },
        after: { priority, due_at: due.toISOString(), bulk: true },
      });
    }
  }

  revalidatePath("/tickets");
  redirect(back.startsWith("/tickets") ? back : "/tickets");
}

/** Override the SLA due date; a reason is mandatory and audit-logged. */
export async function changeTicketDue(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const due = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("due"));
  const reason = z.string().trim().min(3).parse(formData.get("reason"));
  const dueAt = new Date(`${due}T23:59:59Z`);

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("tickets")
    .select("id, due_at")
    .eq("id", id)
    .single();
  if (!before) throw new Error("ticket not found");

  const { error } = await supabase
    .from("tickets")
    .update({ due_at: dueAt.toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("ticket_events").insert({
    ticket_id: id,
    author_id: user.id,
    kind: "system",
    body: `Due date changed to ${due}. Reason: ${reason}`,
    meta: { event: "due_change", from: before.due_at, to: dueAt.toISOString(), reason },
  });
  await writeAudit({
    action: "ticket.due_change",
    entityType: "tickets",
    entityId: id,
    before: { due_at: before.due_at },
    after: { due_at: dueAt.toISOString(), reason },
  });
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
}

const linkKindSchema = z.enum(["relates_to", "blocks", "duplicate_of"]);

/** Link two tickets by number (LS-YYYY-NNNN). */
export async function linkTicket(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const number = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^LS-\d{4}-\d{4}$/, "expected a ticket number like LS-2026-0042")
    .parse(formData.get("number"));
  const kind = linkKindSchema.parse(formData.get("kind"));

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("tickets")
    .select("id, number")
    .eq("number", number)
    .maybeSingle();
  if (!target) throw new Error(`ticket ${number} not found`);
  if (target.id === id) throw new Error("a ticket cannot link to itself");

  const { error } = await supabase.from("ticket_links").insert({
    ticket_id: id,
    linked_ticket_id: target.id,
    kind,
    created_by: user.id,
  });
  if (error) {
    if (error.code === "23505") throw new Error(`already linked to ${number}`);
    throw new Error(error.message);
  }

  await supabase.from("ticket_events").insert({
    ticket_id: id,
    author_id: user.id,
    kind: "system",
    body: `Linked ${kind.replace("_", " ")} ${target.number}.`,
    meta: { event: "link", kind, linked_ticket_id: target.id },
  });
  await writeAudit({
    action: "ticket.link",
    entityType: "tickets",
    entityId: id,
    after: { kind, linked_ticket_id: target.id, linked_number: target.number },
  });
  revalidatePath(`/tickets/${id}`);
}

export async function unlinkTicket(formData: FormData): Promise<void> {
  const user = await requireUser();
  const linkId = uuid.parse(formData.get("linkId"));
  const ticketId = uuid.parse(formData.get("ticketId"));

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_links").delete().eq("id", linkId);
  if (error) throw new Error(error.message);

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    author_id: user.id,
    kind: "system",
    body: "Ticket link removed.",
    meta: { event: "unlink", link_id: linkId },
  });
  await writeAudit({
    action: "ticket.unlink",
    entityType: "tickets",
    entityId: ticketId,
    after: { link_id: linkId },
  });
  revalidatePath(`/tickets/${ticketId}`);
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
