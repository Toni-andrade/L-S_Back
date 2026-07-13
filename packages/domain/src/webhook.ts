/**
 * Intake webhook security (Section 5): HMAC-SHA256 signature over the raw
 * body and the idempotency dedupe hash.
 *
 * Node-only (uses node:crypto). Exported via the "@ls/domain/webhook" subpath
 * on purpose: never import from client components or from the package index.
 */

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Verifies an HMAC-SHA256 hex signature over the raw request body.
 * Accepts an optional "sha256=" prefix. Constant-time comparison.
 */
export function verifyIntakeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const provided = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

export function signIntakePayload(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * dedupe_hash = sha256(email + received_date + normalized payload), spec
 * Section 5. The normalized payload is stably stringified (sorted keys) so the
 * hash is insensitive to key order.
 */
export function intakeDedupeHash(
  email: string | null,
  receivedDate: string,
  normalized: Record<string, unknown>,
): string {
  const basis = `${email ?? ""}|${receivedDate}|${stableStringify(normalized)}`;
  return createHash("sha256").update(basis, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
