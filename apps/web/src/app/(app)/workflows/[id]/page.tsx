import { Check, Circle, MinusCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cancelWorkflow, setStepStatus } from "@/lib/actions/workflows";
import { requireUser } from "@/lib/auth";
import { workflowRunWithSteps } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const STEP_ICON = {
  done: Check,
  skipped: MinusCircle,
  blocked: XCircle,
  todo: Circle,
} as const;

export default async function WorkflowRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { run, steps } = await workflowRunWithSteps(id);
  if (!run) notFound();

  const supabase = await createClient();
  const [{ data: users }, clientRes] = await Promise.all([
    supabase.from("users").select("id, name, email"),
    run.client_id
      ? supabase.from("clients").select("id, name").eq("id", run.client_id).single()
      : Promise.resolve({ data: null }),
  ]);
  const userName = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
  const client = clientRes.data;

  const doneCount = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const active = run.status !== "done" && run.status !== "canceled";

  return (
    <div>
      <Link href="/workflows" className="mb-3 inline-block text-sm text-royal hover:underline">
        ← Workflows
      </Link>
      <PageHeader
        title={run.title}
        subtitle={`${run.kind.replace("_", " ")} playbook${client ? ` · ${client.name}` : " · firm-level"}`}
        action={
          active ? (
            <form action={cancelWorkflow}>
              <input type="hidden" name="runId" value={run.id} />
              <Button type="submit" variant="outline" size="sm" className="text-alert">
                Cancel
              </Button>
            </form>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Badge
          variant={
            run.status === "done"
              ? "success"
              : run.status === "blocked"
                ? "alert"
                : run.status === "canceled"
                  ? "default"
                  : "celeste"
          }
        >
          {run.status.replace("_", " ")}
        </Badge>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-app-bg">
          <div className="h-full rounded-full bg-royal" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm tabular-nums text-slate-500">
          {doneCount}/{steps.length}
        </span>
        {client ? (
          <Link href={`/clients/${client.id}`} className="text-sm text-royal hover:underline">
            {client.name} →
          </Link>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-5">
          <ol className="flex flex-col">
            {steps.map((s) => {
              const Icon = STEP_ICON[s.status as keyof typeof STEP_ICON] ?? Circle;
              const isDone = s.status === "done";
              return (
                <li
                  key={s.id}
                  className="flex items-start gap-3 border-b border-hairline py-3 last:border-0"
                >
                  <Icon
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      isDone ? "text-verde" : s.status === "blocked" ? "text-alert" : "text-slate-300"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${isDone ? "text-slate-400 line-through" : "text-oxford"}`}>
                      {s.seq}. {s.title}
                    </div>
                    <div className="text-xs text-slate-400">
                      <span className="capitalize">{s.role}</span>
                      {s.required ? "" : " · optional"}
                      {s.completed_at
                        ? ` · ${s.status} by ${userName.get(s.completed_by ?? "") ?? "—"} on ${new Date(s.completed_at).toLocaleDateString("en-US")}`
                        : ""}
                    </div>
                  </div>
                  {active ? (
                    <div className="flex shrink-0 gap-1">
                      {s.status !== "done" ? (
                        <form action={setStepStatus}>
                          <input type="hidden" name="stepId" value={s.id} />
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="to" value="done" />
                          <Button type="submit" size="sm">
                            Done
                          </Button>
                        </form>
                      ) : (
                        <form action={setStepStatus}>
                          <input type="hidden" name="stepId" value={s.id} />
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="to" value="todo" />
                          <Button type="submit" size="sm" variant="ghost">
                            Undo
                          </Button>
                        </form>
                      )}
                      {s.status !== "done" && s.status !== "skipped" ? (
                        <form action={setStepStatus}>
                          <input type="hidden" name="stepId" value={s.id} />
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="to" value={s.status === "blocked" ? "todo" : "blocked"} />
                          <Button type="submit" size="sm" variant="outline">
                            {s.status === "blocked" ? "Unblock" : "Block"}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
