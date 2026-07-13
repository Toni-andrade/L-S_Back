import type { IntakeFieldMap } from "@ls/domain";

/**
 * ============================================================================
 * OPEN ITEM 2 (Antonio): the website's exact form field names and the
 * signature header it sends are UNCONFIRMED. Everything below is the single
 * place to update once confirmed. The raw payload is always stored verbatim,
 * so historical rows can be re-mapped after a config fix.
 * ============================================================================
 */

/** Header carrying the HMAC-SHA256 hex signature of the raw body. */
export const INTAKE_SIGNATURE_HEADER = "x-ls-signature";

/** Canonical field -> candidate website field names, tried in order. */
export const INTAKE_FIELD_MAP: IntakeFieldMap = {
  name: ["name", "full_name", "fullName", "nome"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "phone_number", "tel", "telefone", "whatsapp"],
  country: ["country", "pais", "country_code"],
  investable_range: ["investable_range", "investment_range", "aum", "investable_assets", "faixa"],
  message: ["message", "comments", "mensagem", "notes"],
};

export function intakeWebhookConfigured(): boolean {
  return Boolean(process.env.INTAKE_WEBHOOK_SECRET);
}
