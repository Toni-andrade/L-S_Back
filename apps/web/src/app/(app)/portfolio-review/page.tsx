import { formatCurrencyUS } from "@ls/domain";
import { PieChart } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { GroupSelector } from "@/components/review/group-selector";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, userSeesAll } from "@/lib/auth";
import { holdingsForScope, latestSnapshot } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function PortfolioReviewIndex() {
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data: households }, { data: soloClients }, snapshot] = await Promise.all([
    supabase.from("households").select("id, name").order("name"),
    supabase.from("clients").select("id, name").is("household_id", null).order("name"),
    latestSnapshot(),
  ]);

  const withMv = async (scope: "household" | "client", id: string) => {
    if (!snapshot) return 0;
    const holdings = await holdingsForScope(scope, id, snapshot.id);
    return holdings.reduce((s, h) => s + h.market_value, 0);
  };

  const householdRows = await Promise.all(
    (households ?? []).map(async (h) => ({ ...h, mv: await withMv("household", h.id) })),
  );
  const clientRows = await Promise.all(
    (soloClients ?? []).map(async (c) => ({ ...c, mv: await withMv("client", c.id) })),
  );

  const empty = householdRows.length === 0 && clientRows.length === 0;
  const selectorOptions = [
    ...householdRows.map((h) => ({ scope: "household" as const, id: h.id, name: h.name })),
    ...clientRows.map((c) => ({ scope: "client" as const, id: c.id, name: c.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Portfolio Review"
        subtitle={
          userSeesAll(me)
            ? `All households (Addepar GROUPs) and household-less clients${snapshot ? `, values as of ${snapshot.as_of}` : ""}`
            : `Households and clients you can access${snapshot ? `, values as of ${snapshot.as_of}` : ""}`
        }
        action={<GroupSelector options={selectorOptions} />}
      />
      {empty ? (
        <EmptyState
          icon={PieChart}
          title="No households or clients yet"
          description="Map Addepar entities under Integrations, or add clients directly."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {householdRows.map((h) => (
            <Link key={h.id} href={`/portfolio-review/household/${h.id}`}>
              <Card className="transition-colors hover:border-celeste/60">
                <CardHeader>
                  <CardTitle>{h.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-400">Household</span>
                  <span className="text-lg font-semibold tabular-nums text-oxford">
                    {formatCurrencyUS(h.mv)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
          {clientRows.map((c) => (
            <Link key={c.id} href={`/portfolio-review/client/${c.id}`}>
              <Card className="transition-colors hover:border-celeste/60">
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-400">Client</span>
                  <span className="text-lg font-semibold tabular-nums text-oxford">
                    {formatCurrencyUS(c.mv)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
