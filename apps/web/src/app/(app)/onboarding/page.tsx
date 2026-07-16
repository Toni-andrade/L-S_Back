import { FolderPlus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { onboardingBoard } from "@/lib/data";

export default async function OnboardingPage() {
  await requireUser();
  const { active, recentlyDone } = await onboardingBoard();

  // Pipeline summary: how many openings sit at each step right now.
  const byStep = new Map<string, number>();
  for (const r of active) {
    const key = r.currentStep ? `${r.currentStep.seq}. ${r.currentStep.title}` : "Wrapping up";
    byStep.set(key, (byStep.get(key) ?? 0) + 1);
  }
  const stages = [...byStep.entries()].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }));

  return (
    <div>
      <PageHeader
        title="Onboarding"
        subtitle="Every account opening in flight: where it stands, how long it has been open, and what is stuck."
        action={
          <Link href="/workflows" className={buttonVariants({ variant: "primary" })}>
            Start Account Opening
          </Link>
        }
      />

      {stages.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {stages.map(([label, count]) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm text-slate-500 ring-1 ring-hairline"
            >
              <span>{label}</span>
              <span className="rounded-full bg-royal px-2 py-0.5 text-xs font-medium text-white">
                {count}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No account openings in flight"
          description="Start the Account Opening playbook from Workflows, or convert an intake lead with the playbook option checked."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Current step</th>
                  <th className="py-2 font-medium">Step due</th>
                  <th className="py-2 font-medium">Age</th>
                  <th className="py-2 font-medium">Progress</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
                    <td className="py-2.5">
                      <Link href={`/workflows/${r.id}`} className="font-medium text-royal hover:underline">
                        {r.clientName ?? r.title}
                      </Link>
                      {r.accountId ? (
                        <span className="ml-2 text-xs text-slate-400">account linked</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {r.currentStep ? (
                        <>
                          <span className="tabular-nums">{r.currentStep.seq}.</span>{" "}
                          {r.currentStep.title}{" "}
                          <span className="text-xs capitalize text-slate-400">({r.currentStep.role})</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5">
                      {r.currentStep?.due_at ? (
                        r.currentStepOverdue ? (
                          <Badge variant="alert">
                            Overdue · {new Date(r.currentStep.due_at).toLocaleDateString("en-US")}
                          </Badge>
                        ) : (
                          <span className="text-slate-500">
                            {new Date(r.currentStep.due_at).toLocaleDateString("en-US")}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {r.overdueSteps > 1 ? (
                        <span className="ml-2 text-xs text-alert">{r.overdueSteps} overdue</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 tabular-nums text-slate-500">
                      {r.ageDays === 0 ? "today" : `${r.ageDays}d`}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-app-bg">
                          <div
                            className="h-full rounded-full bg-royal"
                            style={{
                              width: `${r.totalSteps ? Math.round((r.doneSteps / r.totalSteps) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">
                          {r.doneSteps}/{r.totalSteps}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <Badge variant={r.status === "blocked" ? "alert" : "celeste"}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {recentlyDone.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recently completed
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {recentlyDone.map((r) => (
              <div key={r.id} className="flex items-center justify-between">
                <Link href={`/workflows/${r.id}`} className="text-royal hover:underline">
                  {r.title}
                </Link>
                <span className="text-xs text-slate-400">
                  {r.completed_at ? new Date(r.completed_at).toLocaleDateString("en-US") : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
