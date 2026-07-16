import { NextResponse } from "next/server";
import { notifyTicketBreaches } from "@/lib/notify";
import { runAddeparSync } from "@/lib/sync/run-sync";

export const maxDuration = 300;

/**
 * Vercel Cron target (vercel.json: 10:30 UTC ≈ 05:30 ET during DST).
 * Protected by CRON_SECRET: Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runAddeparSync({ kind: "addepar_nightly" });

  // Piggyback on the nightly wake-up: notify assignees of SLA breaches
  // (deduped per ticket). Never lets a notification failure fail the sync.
  let ticketBreachNotifications = 0;
  try {
    ticketBreachNotifications = await notifyTicketBreaches();
  } catch (err) {
    console.error("nightly-sync: breach notification pass failed", err);
  }

  return NextResponse.json(
    { ...result, ticketBreachNotifications },
    { status: result.status === "error" ? 500 : 200 },
  );
}
