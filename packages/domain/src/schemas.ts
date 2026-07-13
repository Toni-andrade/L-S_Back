import { z } from "zod";

export const userRoleSchema = z.enum(["advisor", "ops", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const appUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  active: z.boolean(),
});
export type AppUser = z.infer<typeof appUserSchema>;

export const auditEntrySchema = z.object({
  actor_id: z.string().uuid().nullable(),
  action: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().uuid().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
});
