import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { holdingsForScope, snapshotByDate, type Scope } from "@/lib/data";

/** Positions CSV export for a scope + as-of date (linked from the review page). */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const id = url.searchParams.get("id");
  const asOf = url.searchParams.get("asOf");
  if ((scope !== "household" && scope !== "client") || !id || !asOf) {
    return NextResponse.json({ error: "scope, id and asOf are required" }, { status: 400 });
  }

  const snapshot = await snapshotByDate(asOf);
  if (!snapshot) return NextResponse.json({ error: "no snapshot for that date" }, { status: 404 });

  const holdings = await holdingsForScope(scope as Scope, id, snapshot.id);

  const header = [
    "as_of",
    "account_id",
    "symbol",
    "description",
    "asset_class",
    "quantity",
    "price",
    "market_value",
    "currency",
    "weight",
  ];
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...holdings.map((h) =>
      [
        h.as_of,
        h.account_id,
        h.symbol,
        h.description,
        h.asset_class,
        h.quantity,
        h.price,
        h.market_value,
        h.currency,
        h.weight,
      ]
        .map(escape)
        .join(","),
    ),
  ];

  await writeAudit({
    action: "export.positions",
    entityType: "snapshots",
    entityId: snapshot.id,
    after: { scope, scope_id: id, as_of: asOf, rows: holdings.length },
  });

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="positions-${scope}-${asOf}.csv"`,
    },
  });
}
