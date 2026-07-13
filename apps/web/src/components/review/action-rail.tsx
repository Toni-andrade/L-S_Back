import { INTAKE_STAGES, INTAKE_STATUS_LABEL } from "@ls/domain";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { refreshAddeparData, reviewPortfolio } from "@/lib/actions/portfolio";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { intakeStageCounts, ticketRailCounts } from "@/lib/data";

export async function ActionRail({
  scope,
  scopeId,
  addeparConfigured,
  intakeCounts,
  ticketCounts,
}: {
  scope: "household" | "client";
  scopeId: string;
  addeparConfigured: boolean;
  intakeCounts?: { stage: string; count: number }[];
  ticketCounts?: { label: string; count: number; urgent?: boolean }[];
}) {
  if (!intakeCounts || !ticketCounts) {
    const [stageCounts, railCounts] = await Promise.all([
      intakeStageCounts(),
      ticketRailCounts(),
    ]);
    intakeCounts ??= INTAKE_STAGES.map((stage) => ({
      stage: INTAKE_STATUS_LABEL[stage],
      count: stageCounts[stage] ?? 0,
    }));
    ticketCounts ??= railCounts;
  }
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <form action={reviewPortfolio}>
            <input type="hidden" name="scope" value={scope} />
            <input type="hidden" name="scopeId" value={scopeId} />
            <Button type="submit" className="w-full">
              Review Portfolio
            </Button>
          </form>
          <Link
            href="/tickets/new"
            className={buttonVariants({ variant: "outline" }) + " justify-between"}
          >
            Open Ticket <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href="/proposals" className={buttonVariants({ variant: "outline" }) + " justify-between"}>
            Generate Proposal <ChevronRight className="h-4 w-4" />
          </Link>
          {addeparConfigured ? (
            <form action={refreshAddeparData}>
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="scopeId" value={scopeId} />
              <Button type="submit" variant="outline" className="w-full justify-between">
                Refresh Addepar Data <ChevronRight className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <Button variant="outline" disabled title="Addepar credentials not configured" className="justify-between">
              Refresh Addepar Data <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Client Intake Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          {(intakeCounts ?? [
            { stage: "New Leads", count: 0 },
            { stage: "Discovery Scheduled", count: 0 },
            { stage: "Proposal In Progress", count: 0 },
            { stage: "Pending Onboarding", count: 0 },
          ]).map((s) => (
            <div key={s.stage} className="flex items-center justify-between">
              <span className="text-slate-500">{s.stage}</span>
              <span className="font-medium tabular-nums text-oxford">{s.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Support Tickets
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          {(ticketCounts ?? [
            { label: "Open", count: 0 },
            { label: "Urgent", count: 0, urgent: true },
            { label: "Pending Reply", count: 0 },
            { label: "Due Today", count: 0 },
          ]).map((t) => (
            <div key={t.label} className="flex items-center justify-between">
              <span className="text-slate-500">{t.label}</span>
              <span className={`font-medium tabular-nums ${t.urgent && t.count > 0 ? "text-alert" : "text-oxford"}`}>
                {t.count}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
