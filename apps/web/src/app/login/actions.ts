"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().toLowerCase().email();

export type AuthFormState = { error?: string; message?: string };

/**
 * App-side allowlist gate (defense in depth; the database trigger enforces the
 * same rule on auth.users insert). Allowed when the email is in allowed_emails,
 * its domain is in allowed_domains, or it matches ALLOWED_EMAIL_DOMAIN.
 */
async function isEmailAllowed(email: string): Promise<boolean> {
  const domain = email.split("@")[1] ?? "";
  const envDomain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
  if (envDomain && domain === envDomain) return true;

  const service = createServiceClient();
  const [byEmail, byDomain] = await Promise.all([
    service.from("allowed_emails").select("id").eq("email", email).maybeSingle(),
    service.from("allowed_domains").select("id").eq("domain", domain).maybeSingle(),
  ]);
  return Boolean(byEmail.data || byDomain.data);
}

export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = z.string().min(1).safeParse(formData.get("password"));
  if (!email.success || !password.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (error) return { error: "Invalid credentials." };
  redirect("/");
}

export async function signUpWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = z.string().min(8).safeParse(formData.get("password"));
  const name = z.string().trim().min(1).safeParse(formData.get("name"));
  if (!email.success) return { error: "Enter a valid email." };
  if (!password.success) return { error: "Password must be at least 8 characters." };
  if (!name.success) return { error: "Enter your name." };

  if (!(await isEmailAllowed(email.data))) {
    return { error: "This email is not on the allowlist. Ask an admin to add you." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: {
      data: { name: name.data },
      emailRedirectTo: `${process.env.APP_BASE_URL}/auth/callback`,
    },
  });
  if (error) {
    return { error: "Could not create the account. If you already signed up, sign in instead." };
  }
  return {
    message:
      "Account created. Confirm your email if prompted; an admin must activate your account before you can use the platform.",
  };
}

export async function sendMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email." };

  if (!(await isEmailAllowed(email.data))) {
    return { error: "This email is not on the allowlist. Ask an admin to add you." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${process.env.APP_BASE_URL}/auth/callback`,
    },
  });
  if (error) return { error: "Could not send the magic link. Try again." };
  return { message: "Magic link sent. Check your inbox." };
}
