import { ListChecks } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { startWorkflow } from "@/lib/actions/workflows";
import { requireUser } from "@/lib/auth";
import { workflowRuns, workflowTemplates } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT: Record<string, "default" | "celeste" | "success" | "marrom" | "alert"> = {
  open: "celeste",
  in_progress: "celeste",
  blocked: "alert",
  done: "success",
  canceled: "default",
};

export default async function WorkflowsPage() {
  await requireUser();
  const supabase = await createClient();
  const [templates, runs, { data: clients }] = await Promise.all([
    workflowTemplates(),
    workflowRuns(),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const open = runs.filter((r) => r.status !== "done" && r.status !== "canceled");
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const inputClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

  return (
    <div>
      <PageHeader
        title="Workflows"
        subtitle="Playbooks for recurring processes: account opening, money movement and more."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Start a playbook</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={startWorkflow} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-52 flex-1 flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-slate-400">Playbook</span>
              <select name="templateId" required className={inputClass}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-52 flex-1 flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-slate-400">Client (optional)</span>
              <select name="clientId" defaultValue="" className={inputClass}>
                <option value="">None (firm-level)</option>
                {(clients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Start</Button>
          </form>
        </CardContent>
      </Card>

      {open.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No workflows in flight"
          description="Start account opening or money movement above. Completed runs stay on record."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Workflow</th>
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {open.map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
                    <td className="py-2.5">
                      <Link href={`/workflows/${r.id}`} className="font-medium text-royal hover:underline">
                        {r.title}
                      </Link>
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {r.client_id ? (clientName.get(r.client_id) ?? "—") : "Firm-level"}
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {new Date(r.created_at).toLocaleDateString("en-US")}
                    </td>
                    <td className="py-2.5">
                      <Badge variant={STATUS_VARIANT[r.status] ?? "default"}>
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
    </div>
  );
}
