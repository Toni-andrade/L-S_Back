import { assessClientSla, worstSlaState, type ClientSlaState } from "@ls/domain";
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { slaBadgeVariant } from "@/components/contacts/client-relationship";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { slaBoard } from "@/lib/data";

const ORDER: Record<ClientSlaState, number> = { breached: 0, overdue: 1, due_soon: 2, none: 3, ok: 4 };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const { rows, policies } = await slaBoard();

  const assessed = rows.map((r) => {
    const assessments = assessClientSla(
      {
        riskProfile: r.riskProfile,
        lastTouchAt: r.lastTouchAt,
        activatedAt: r.activatedAt,
        oldestOpenBlockerAt: r.oldestOpenBlockerAt,
      },
      policies,
    );
    return { ...r, assessments, worst: worstSlaState(assessments) };
  });

  const attention = assessed.filter((r) => ["breached", "overdue", "due_soon"].includes(r.worst));
  const filter = params.filter;
  const shown = filter === "attention" ? attention : assessed;
  shown.sort((a, b) => ORDER[a.worst] - ORDER[b.worst] || a.name.localeCompare(b.name));

  const counts = {
    breached: assessed.filter((r) => r.worst === "breached").length,
    overdue: assessed.filter((r) => r.worst === "overdue").length,
    due_soon: assessed.filter((r) => r.worst === "due_soon").length,
  };

  return (
    <div>
      <PageHeader
        title="Contacts & SLAs"
        subtitle="Client contact cadence measured against pre-established SLAs. Auto-scoped to the clients you can access."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        {[
          { key: undefined, label: `All (${assessed.length})` },
          { key: "attention", label: `Needs attention (${attention.length})` },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.key ? `/contacts?filter=${f.key}` : "/contacts"}
            className={`rounded-full px-3 py-1 text-sm ${
              (filter ?? "") === (f.key ?? "")
                ? "bg-royal text-white"
                : "bg-white text-slate-500 ring-1 ring-hairline hover:text-royal"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          {counts.breached > 0 ? <Badge variant="alert">{counts.breached} breached</Badge> : null}
          {counts.overdue > 0 ? <Badge variant="alert">{counts.overdue} overdue</Badge> : null}
          {counts.due_soon > 0 ? <Badge variant="marrom">{counts.due_soon} due soon</Badge> : null}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={filter === "attention" ? "Nothing needs attention" : "No clients yet"}
          description="Client relationships and SLA status appear here once clients are imported."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Profile</th>
                  <th className="py-2 font-medium">Last touch</th>
                  <th className="py-2 font-medium">SLA status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
                    <td className="py-2.5">
                      <Link
                        href={`/portfolio-review/client/${r.id}`}
                        className="font-medium text-royal hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="py-2.5 capitalize text-slate-500">{r.riskProfile ?? "—"}</td>
                    <td className="py-2.5 text-slate-500">
                      {r.lastTouchAt ? r.lastTouchAt.toLocaleDateString("en-US") : "never"}
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {r.assessments
                          .filter((a) => a.state !== "ok")
                          .map((a) => (
                            <Badge key={a.kind} variant={slaBadgeVariant(a.state)} title={a.detail}>
                              {a.kind === "periodic_review"
                                ? "Review"
                                : a.kind === "flag_response"
                                  ? "Flag"
                                  : "Onboarding"}{" "}
                              {a.state.replace("_", " ")}
                            </Badge>
                          ))}
                        {r.assessments.every((a) => a.state === "ok") ? (
                          <Badge variant="success">On track</Badge>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
