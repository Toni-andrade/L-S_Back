"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

/** Grant a user visibility of a whole household (cascades to its accounts). */
export async function grantHousehold(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const userId = uuid.parse(formData.get("userId"));
  const householdId = uuid.parse(formData.get("householdId"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_household_grants")
    .upsert(
      { user_id: userId, household_id: householdId, granted_by: admin.id },
      { onConflict: "user_id,household_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "access.grant_household",
    entityType: "user_household_grants",
    entityId: data?.id ?? null,
    after: { user_id: userId, household_id: householdId },
  });
  revalidatePath(`/settings/access/${userId}`);
}

export async function revokeHousehold(formData: FormData): Promise<void> {
  await requireRole("admin");
  const userId = uuid.parse(formData.get("userId"));
  const householdId = uuid.parse(formData.get("householdId"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_household_grants")
    .delete()
    .eq("user_id", userId)
    .eq("household_id", householdId);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "access.revoke_household",
    entityType: "user_household_grants",
    after: { user_id: userId, household_id: householdId },
  });
  revalidatePath(`/settings/access/${userId}`);
}

/** Grant a user visibility of a single account (for cross-household edge cases). */
export async function grantAccount(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const userId = uuid.parse(formData.get("userId"));
  const accountId = uuid.parse(formData.get("accountId"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_account_grants")
    .upsert(
      { user_id: userId, account_id: accountId, granted_by: admin.id },
      { onConflict: "user_id,account_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "access.grant_account",
    entityType: "user_account_grants",
    entityId: data?.id ?? null,
    after: { user_id: userId, account_id: accountId },
  });
  revalidatePath(`/settings/access/${userId}`);
}

export async function revokeAccount(formData: FormData): Promise<void> {
  await requireRole("admin");
  const userId = uuid.parse(formData.get("userId"));
  const accountId = uuid.parse(formData.get("accountId"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_account_grants")
    .delete()
    .eq("user_id", userId)
    .eq("account_id", accountId);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "access.revoke_account",
    entityType: "user_account_grants",
    after: { user_id: userId, account_id: accountId },
  });
  revalidatePath(`/settings/access/${userId}`);
}
