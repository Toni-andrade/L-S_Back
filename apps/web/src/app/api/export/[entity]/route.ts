import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Books-and-records JSON export (Section 10.5, Advisers Act Rule 204-2).
 * Admin only; every export is itself audit-logged. Retention is
 * delete-protected at the DB level; this is the read path.
 */
const EXPORTABLE = [
  "households",
  "clients",
  "accounts",
  "intake_submissions",
  "tickets",
  "ticket_events",
  "proposals",
  "proposal_flags",
  "portfolio_reviews",
  "portfolio_flags",
  "audit_log",
] as const;

const PAGE = 1000;

export async function GET(_request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const user = await getSessionUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const { entity } = await params;
  if (!(EXPORTABLE as readonly string[]).includes(entity)) {
    return NextResponse.json(
      { error: `unknown entity; exportable: ${EXPORTABLE.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const orderColumn = entity === "audit_log" ? "at" : "created_at";
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(entity)
      .select("*")
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  await writeAudit({
    action: "export.entity",
    entityType: entity,
    after: { rows: rows.length },
  });

  return NextResponse.json(
    { entity, exported_at: new Date().toISOString(), count: rows.length, rows },
    {
      headers: {
        "Content-Disposition": `attachment; filename="${entity}-export.json"`,
      },
    },
  );
}
