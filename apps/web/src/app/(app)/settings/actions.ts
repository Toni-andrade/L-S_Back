"use server";

import { userRoleSchema } from "@ls/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
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

/**
 * Email a login invite (via Resend) to an allowlisted address. The invite is
 * informational: signup still goes through the allowlist + admin activation.
 */
export async function sendUserInvite(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const email = z.string().trim().toLowerCase().email().parse(formData.get("email"));

  const supabase = await createClient();
  const { data: allowed } = await supabase
    .from("allowed_emails")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (!allowed) throw new Error(`${email} is not on the allowlist; add it first`);

  const base =
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  const loginUrl = base ? `${base}/login` : null;

  const { sent } = await sendEmail({
    to: email,
    subject: "You have been invited to L&S Backoffice",
    html: [
      "<p>Hello,</p>",
      `<p>You have been invited to the L&amp;S Investment Advisors backoffice platform.</p>`,
      loginUrl
        ? `<p><a href="${loginUrl}">Create your account / sign in</a> using this email address.</p>`
        : "<p>Create your account using this email address at the L&amp;S Backoffice login page.</p>",
      "<p>After signing up, an administrator activates your access.</p>",
    ].join(""),
  });
  if (!sent) throw new Error("invite email not sent: RESEND_API_KEY is not configured");

  await writeAudit({
    action: "allowlist.invite_sent",
    entityType: "allowed_emails",
    entityId: allowed.id,
    after: { email, invited_by: admin.email },
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
