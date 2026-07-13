import { mapIntakePayload } from "@ls/domain";
import { intakeDedupeHash, verifyIntakeSignature } from "@ls/domain/webhook";
import { NextResponse } from "next/server";
import { writeSystemAudit } from "@/lib/audit";
import { INTAKE_FIELD_MAP, INTAKE_SIGNATURE_HEADER } from "@/lib/intake/config";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Website intake webhook (Section 5). Public route, no session: authenticity
 * comes from the HMAC-SHA256 signature over the raw body. Invalid signatures
 * are rejected with 401 but the attempt is still logged. Replays dedupe on
 * dedupe_hash and return 200 { duplicate: true } without a new row.
 */
export async function POST(request: Request) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "intake webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(INTAKE_SIGNATURE_HEADER);

  if (!verifyIntakeSignature(rawBody, signature, secret)) {
    await writeSystemAudit({
      action: "intake.rejected",
      entityType: "intake_submissions",
      after: { reason: "invalid_signature", body_length: rawBody.length },
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("body must be a JSON object");
    }
    raw = parsed as Record<string, unknown>;
  } catch {
    await writeSystemAudit({
      action: "intake.rejected",
      entityType: "intake_submissions",
      after: { reason: "invalid_json", body_length: rawBody.length },
    });
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const mapped = mapIntakePayload(raw, INTAKE_FIELD_MAP);
  const receivedDate = new Date().toISOString().slice(0, 10);
  const dedupeHash = intakeDedupeHash(mapped.email, receivedDate, mapped as Record<string, unknown>);

  const service = createServiceClient();
  const { data, error } = await service
    .from("intake_submissions")
    .insert({
      source: "website",
      raw,
      ...mapped,
      dedupe_hash: dedupeHash,
      signature_valid: true,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation on dedupe_hash: idempotent replay
    if (error.code === "23505") {
      return NextResponse.json({ duplicate: true });
    }
    await writeSystemAudit({
      action: "intake.error",
      entityType: "intake_submissions",
      after: { reason: error.message },
    });
    return NextResponse.json({ error: "storage failure" }, { status: 500 });
  }

  await writeSystemAudit({
    action: "intake.received",
    entityType: "intake_submissions",
    entityId: data.id,
    after: { email: mapped.email, name: mapped.name },
  });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
