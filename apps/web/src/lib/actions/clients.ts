"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const country = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s.toUpperCase()))
  .refine((s) => s === null || /^[A-Z]{2}$/.test(s), "2-letter country code")
  .nullable();

const profileSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["individual", "joint", "entity", "trust"]),
  status: z.enum(["prospect", "active", "closed"]),
  riskProfile: z
    .enum(["conservador", "moderado", "agressivo"])
    .nullable()
    .or(z.literal("").transform(() => null)),
  domicileCountry: country,
  taxResidency: country,
  isBrazilTaxpayer: z.boolean(),
  isUsNra: z.boolean(),
  notes: z.string().trim().nullable(),
});

/** Edit a client's profile / KYC fields (advisor + admin). Every change audited. */
export async function updateClientProfile(formData: FormData): Promise<void> {
  await requireRole("advisor", "admin");
  const id = uuid.parse(formData.get("id"));
  const parsed = profileSchema.parse({
    name: formData.get("name"),
    type: formData.get("type"),
    status: formData.get("status"),
    riskProfile: (formData.get("riskProfile") as string | null) || "",
    domicileCountry: (formData.get("domicileCountry") as string | null) ?? "",
    taxResidency: (formData.get("taxResidency") as string | null) ?? "",
    isBrazilTaxpayer: formData.get("isBrazilTaxpayer") === "on",
    isUsNra: formData.get("isUsNra") === "on",
    notes: ((formData.get("notes") as string | null)?.trim() || null) as string | null,
  });

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("clients")
    .select("name, type, status, risk_profile, domicile_country, tax_residency, is_brazil_taxpayer, is_us_nra, notes")
    .eq("id", id)
    .single();

  const after = {
    name: parsed.name,
    type: parsed.type,
    status: parsed.status,
    risk_profile: parsed.riskProfile,
    domicile_country: parsed.domicileCountry,
    tax_residency: parsed.taxResidency,
    is_brazil_taxpayer: parsed.isBrazilTaxpayer,
    is_us_nra: parsed.isUsNra,
    notes: parsed.notes,
  };
  const { error } = await supabase.from("clients").update(after).eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit({
    action: "client.update_profile",
    entityType: "clients",
    entityId: id,
    before,
    after,
  });
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}
