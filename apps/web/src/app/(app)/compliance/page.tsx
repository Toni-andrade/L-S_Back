import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addComplianceItem, setComplianceStatus } from "@/lib/actions/compliance";
import { requireUser } from "@/lib/auth";
import { complianceItems } from "@/lib/data";

const KIND_LABEL: Record<string, string> = {
  filing: "Filing",
  attestation: "Attestation",
  review: "Review",
  complaint: "Complaint",
  gift: "Gift / entertainment",
  personal_trade: "Personal trade",
  other: "Other",
};

function dueState(due: string | null, status: string): "overdue" | "soon" | "ok" | "none" {
  if (status === "done" || status === "waived" || !due) return status === "done" || status === "waived" ? "ok" : "none";
  const days = Math.round((new Date(due).getTime() - Date.now()) / 86_400_000);
  return days < 0 ? "overdue" : days <= 30 ? "soon" : "ok";
}

export default async function CompliancePage() {
  const me = await requireUser();
  const items = await complianceItems();
  const canWrite = me.role === "ops" || me.role === "admin";

  const open = items.filter((i) => i.status === "open" || i.status === "in_progress");
  const closed = items.filter((i) => i.status === "done" || i.status === "waived");
  const overdue = open.filter((i) => dueState(i.due_date, i.status) === "overdue").length;

  const inputClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

  return (
    <div>
      <PageHeader
        title="Compliance"
        subtitle="Compliance calendar and registers: filings, reviews, attestations, complaints, gifts and personal trading."
        action={overdue > 0 ? <Badge variant="alert">{overdue} overdue</Badge> : undefined}
      />

      {canWrite ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add item</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addComplianceItem} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-slate-400">Kind</span>
                <select name="kind" defaultValue="review" className={inputClass}>
                  {Object.keys(KIND_LABEL).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-64 flex-1 flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-slate-400">Title</span>
                <input name="title" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-slate-400">Due</span>
                <input type="date" name="dueDate" className={inputClass} />
              </label>
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Open items ({open.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium">Kind</th>
                <th className="py-2 font-medium">Due</th>
                <th className="py-2 font-medium">Status</th>
                {canWrite ? <th className="py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {open.map((i) => {
                const st = dueState(i.due_date, i.status);
                return (
                  <tr key={i.id} className="border-b border-hairline last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium text-oxford">{i.title}</div>
                      {i.description ? <div className="text-xs text-slate-400">{i.description}</div> : null}
                    </td>
                    <td className="py-2.5 text-slate-500">{KIND_LABEL[i.kind]}</td>
                    <td className="py-2.5">
                      {i.due_date ? (
                        <span className={st === "overdue" ? "text-alert" : st === "soon" ? "text-marrom" : "text-slate-500"}>
                          {i.due_date}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <Badge variant={i.status === "in_progress" ? "celeste" : "default"}>
                        {i.status.replace("_", " ")}
                      </Badge>
                    </td>
                    {canWrite ? (
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {i.status !== "in_progress" ? (
                            <form action={setComplianceStatus}>
                              <input type="hidden" name="id" value={i.id} />
                              <input type="hidden" name="to" value="in_progress" />
                              <Button type="submit" size="sm" variant="ghost">Start</Button>
                            </form>
                          ) : null}
                          <form action={setComplianceStatus}>
                            <input type="hidden" name="id" value={i.id} />
                            <input type="hidden" name="to" value="done" />
                            <Button type="submit" size="sm">Done</Button>
                          </form>
                          <form action={setComplianceStatus}>
                            <input type="hidden" name="id" value={i.id} />
                            <input type="hidden" name="to" value="waived" />
                            <Button type="submit" size="sm" variant="outline">Waive</Button>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {open.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    Nothing open. Compliance calendar is clear.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {closed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-verde" /> Recently closed ({closed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-hairline text-sm">
              {closed.slice(0, 10).map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span className="text-slate-500">
                    {KIND_LABEL[i.kind]} · {i.title}
                  </span>
                  <Badge variant="success">{i.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
