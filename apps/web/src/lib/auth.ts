import { appUserSchema, type AppUser, type UserRole } from "@ls/domain";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** The signed-in, active internal user, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, email, name, role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;

  const parsed = appUserSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
});

/** Route guard: require a signed-in active user (any role). */
export async function requireUser(): Promise<AppUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.active) redirect("/pending");
  return user;
}

/**
 * Route guard: require one of the given roles. Roles are enforced twice by
 * design (RLS in Postgres + this guard); this is the app half.
 */
export async function requireRole(...roles: UserRole[]): Promise<AppUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/**
 * Firmwide readers: admin and ops see all client/portfolio data (mirrors the
 * DB predicate public.current_user_sees_all). Advisors are scoped to their
 * granted households/accounts plus their own advisor book.
 */
export function userSeesAll(user: AppUser): boolean {
  return user.role === "admin" || user.role === "ops";
}
