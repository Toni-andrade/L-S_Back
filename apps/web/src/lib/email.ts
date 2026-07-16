/**
 * Outbound email via Resend's REST API (no SDK dependency).
 * Configure RESEND_API_KEY (and optionally RESEND_FROM) in Vercel env vars
 * and apps/web/.env.local. When the key is absent this is a silent no-op so
 * the platform works unchanged without email. Best-effort by design: a mail
 * failure must never fail the business mutation that triggered it.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false };
  const from = process.env.RESEND_FROM ?? "L&S Backoffice <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      console.error(`resend: ${res.status} ${await res.text().catch(() => "")}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error("resend: request failed", err);
    return { sent: false };
  }
}
