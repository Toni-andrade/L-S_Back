import { parseStepFields, stepDueState, type WorkflowStepStatus } from "@ls/domain";
import { Check, Circle, MinusCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cancelWorkflow, createAccountForRun, setStepStatus } from "@/lib/actions/workflows";
import { requireUser } from "@/lib/auth";
import { workflowRunWithSteps } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const STEP_ICON = {
  done: Check,
  skipped: MinusCircle,
  blocked: XCircle,
  todo: Circle,
} as const;

const fieldClass =
  "rounded-lg border border-hairline bg-white px-3 py-1.5 text-sm text-oxford focus:border-royal focus:outline-none";

export default async function WorkflowRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { run, steps } = await workflowRunWithSteps(id);
  if (!run) notFound();

  const supabase = await createClient();
  const [{ data: users }, clientRes, accountRes] = await Promise.all([
    supabase.from("users").select("id, name, email"),
    run.client_id
      ? supabase.from("clients").select("id, name").eq("id", run.client_id).single()
      : Promise.resolve({ data: null }),
    run.account_id
      ? supabase
          .from("accounts")
          .select("id, custodian, account_number_masked, addepar_entity_id")
          .eq("id", run.account_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);
  const userName = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
  const client = clientRes.data;
  const account = accountRes.data;

  const doneCount = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const active = run.status !== "done" && run.status !== "canceled";
  const now = new Date();
  const canCreateAccount =
    (user.role === "ops" || user.role === "admin") &&
    run.kind === "account_opening" &&
    active &&
    run.client_id &&
    !run.account_id;

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
        {run.intake_submission_id ? (
          <Link
            href={`/intake/${run.intake_submission_id}`}
            className="text-sm text-royal hover:underline"
          >
            Intake source →
          </Link>
        ) : null}
      </div>

      {account ? (
        <div className="mb-4 rounded-lg border border-hairline bg-white px-4 py-2.5 text-sm text-slate-600">
          Linked account: <span className="font-medium text-oxford">{account.account_number_masked}</span>{" "}
          · <span className="capitalize">{String(account.custodian).replace("_", " ")}</span>
          {account.addepar_entity_id ? ` · Addepar #${account.addepar_entity_id}` : " · not mapped to Addepar yet"}
          {" · "}
          <Link href="/accounts" className="text-royal hover:underline">
            Accounts →
          </Link>
        </div>
      ) : null}

      {canCreateAccount ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Create &amp; link the custody account
            </CardTitle>
            <p className="text-xs text-slate-400">
              Creates the accounts record for {client?.name} and links it to this run. Add the
              Addepar entity ID once the custodian account appears in Addepar.
            </p>
          </CardHeader>
          <CardContent>
            <form action={createAccountForRun} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="runId" value={run.id} />
              <input type="hidden" name="clientId" value={run.client_id ?? ""} />
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Custodian
                <select name="custodian" defaultValue="ibkr" className={fieldClass}>
                  <option value="ibkr">IBKR</option>
                  <option value="morgan_stanley">Morgan Stanley</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Account number (masked)
                <input
                  type="text"
                  name="accountNumberMasked"
                  required
                  placeholder="****1234"
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Currency
                <input
                  type="text"
                  name="baseCurrency"
                  defaultValue="USD"
                  maxLength={3}
                  className={`${fieldClass} w-20 uppercase`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Addepar entity ID (optional)
                <input type="text" name="addeparEntityId" placeholder="e.g. 123456" className={fieldClass} />
              </label>
              <Button type="submit" size="sm">
                Create Account
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-5">
          <ol className="flex flex-col">
            {steps.map((s) => {
              const Icon = STEP_ICON[s.status as keyof typeof STEP_ICON] ?? Circle;
              const isDone = s.status === "done";
              const fields = parseStepFields(s.fields);
              const data = (s.data ?? {}) as Record<string, string>;
              const dueState = stepDueState(
                s.due_at ? new Date(s.due_at) : null,
                s.status as WorkflowStepStatus,
                now,
              );
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-medium ${isDone ? "text-slate-400 line-through" : "text-oxford"}`}
                      >
                        {s.seq}. {s.title}
                      </span>
                      {s.due_at ? (
                        dueState === "overdue" ? (
                          <Badge variant="alert">
                            Overdue · {new Date(s.due_at).toLocaleDateString("en-US")}
                          </Badge>
                        ) : dueState === "ok" ? (
                          <span className="text-xs text-slate-400">
                            due {new Date(s.due_at).toLocaleDateString("en-US")}
                          </span>
                        ) : null
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-400">
                      <span className="capitalize">{s.role}</span>
                      {s.required ? "" : " · optional"}
                      {s.completed_at
                        ? ` · ${s.status} by ${userName.get(s.completed_by ?? "") ?? "—"} on ${new Date(s.completed_at).toLocaleDateString("en-US")}`
                        : ""}
                    </div>
                    {Object.keys(data).length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                        {fields
                          .filter((f) => data[f.key])
                          .map((f) => (
                            <span key={f.key}>
                              {f.label}: <span className="font-medium text-oxford">{data[f.key]}</span>
                            </span>
                          ))}
                        {Object.entries(data)
                          .filter(([k]) => !fields.some((f) => f.key === k))
                          .map(([k, v]) => (
                            <span key={k}>
                              {k}: <span className="font-medium text-oxford">{v}</span>
                            </span>
                          ))}
                      </div>
                    ) : null}
                  </div>
                  {active ? (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {s.status !== "done" ? (
                        <form action={setStepStatus} className="flex flex-wrap items-end justify-end gap-1">
                          <input type="hidden" name="stepId" value={s.id} />
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="to" value="done" />
                          {fields.map((f) => (
                            <label key={f.key} className="flex flex-col gap-0.5 text-[11px] text-slate-400">
                              {f.label}
                              <input
                                type={f.type === "date" ? "date" : "text"}
                                name={`field_${f.key}`}
                                defaultValue={data[f.key] ?? ""}
                                className={`${fieldClass} max-w-44`}
                              />
                            </label>
                          ))}
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
