/**
 * In-app notifications (+ optional Resend email fan-out). Rows are inserted
 * with the service client because notifications target OTHER users and the
 * notifications table has no user insert policy (owner-only read/update).
 * Always best-effort: a notification failure never fails the mutation.
 */

import { sendEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";

function appBaseUrl(): string | null {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

export type NotifyInput = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  /** Set false to suppress the email fan-out (in-app only). Default true. */
  email?: boolean;
};

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const service = createServiceClient();
    const { error } = await service.from("notifications").insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    });
    if (error) {
      console.error("notify: insert failed", error.message);
      return;
    }

    if (input.email === false) return;
    const { data: user } = await service
      .from("users")
      .select("email, active")
      .eq("id", input.userId)
      .maybeSingle();
    if (!user?.email || !user.active) return;

    const base = appBaseUrl();
    const link = input.href && base ? `${base}${input.href}` : null;
    await sendEmail({
      to: user.email,
      subject: `[L&S Backoffice] ${input.title}`,
      html: [
        `<p>${input.title}</p>`,
        input.body ? `<p>${input.body}</p>` : "",
        link ? `<p><a href="${link}">Open in L&amp;S Backoffice</a></p>` : "",
      ].join(""),
    });
  } catch (err) {
    console.error("notify: failed", err);
  }
}

/** Insert only if no notification with the same (user, kind, href) exists yet. */
export async function notifyOnce(input: NotifyInput): Promise<void> {
  try {
    const service = createServiceClient();
    let q = service
      .from("notifications")
      .select("id")
      .eq("user_id", input.userId)
      .eq("kind", input.kind);
    q = input.href ? q.eq("href", input.href) : q.is("href", null);
    const { data: existing } = await q.limit(1).maybeSingle();
    if (existing) return;
  } catch (err) {
    console.error("notifyOnce: dedupe check failed", err);
    return;
  }
  await notify(input);
}

/**
 * Nightly pass: tell assignees about open tickets past their SLA deadline.
 * Deduped per ticket via notifyOnce, so each breach notifies exactly once.
 */
export async function notifyTicketBreaches(): Promise<number> {
  const service = createServiceClient();
  const { data: breached } = await service
    .from("tickets")
    .select("id, number, title, assignee_id, due_at")
    .not("assignee_id", "is", null)
    .not("due_at", "is", null)
    .lt("due_at", new Date().toISOString())
    .not("status", "in", "(resolved,closed)");

  let count = 0;
  for (const t of breached ?? []) {
    await notifyOnce({
      userId: t.assignee_id as string,
      kind: "ticket_breach",
      title: `SLA breached: ${t.number} ${t.title}`,
      body: `Due ${new Date(t.due_at as string).toLocaleDateString("en-US")}.`,
      href: `/tickets/${t.id}`,
    });
    count += 1;
  }
  return count;
}
