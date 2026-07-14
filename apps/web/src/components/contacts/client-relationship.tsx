import type { SlaAssessment } from "@ls/domain";
import { CalendarClock, Mail, MessageSquare, Phone, Users } from "lucide-react";
import { logContact } from "@/lib/actions/contacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ContactRow = {
  id: string;
  type: string;
  direction: string;
  occurred_at: string;
  subject: string | null;
  notes: string | null;
  logged_by: string;
  follow_up_at: string | null;
};

const TYPE_ICON: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  review: CalendarClock,
};

export function slaBadgeVariant(state: string) {
  return state === "breached" || state === "overdue"
    ? "alert"
    : state === "due_soon"
      ? "marrom"
      : state === "ok"
        ? "success"
        : "default";
}

export function ClientRelationship({
  clientId,
  assessments,
  contacts,
  userName,
}: {
  clientId: string;
  assessments: SlaAssessment[];
  contacts: ContactRow[];
  userName: Map<string, string>;
}) {
  const inputClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Client relationship</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {assessments.map((a) => (
              <Badge key={a.kind} variant={slaBadgeVariant(a.state)} title={a.detail}>
                {a.kind === "periodic_review"
                  ? "Review"
                  : a.kind === "flag_response"
                    ? "Flag SLA"
                    : a.kind === "onboarding_touch"
                      ? "Onboarding"
                      : a.kind}
                {a.state === "overdue" || a.state === "breached"
                  ? " · overdue"
                  : a.state === "due_soon"
                    ? " · soon"
                    : ""}
              </Badge>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {assessments.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-slate-600">
            {assessments.map((a) => (
              <li key={a.kind} className="flex items-center justify-between">
                <span>{a.policyName}</span>
                <span className={a.state === "ok" ? "text-slate-400" : "text-alert"}>
                  {a.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Log a contact */}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-royal">Log a contact</summary>
          <form action={logContact} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="clientId" value={clientId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <select name="type" defaultValue="call" className={inputClass}>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="review">Review</option>
                <option value="note">Note</option>
                <option value="task">Task</option>
                <option value="other">Other</option>
              </select>
              <select name="direction" defaultValue="outbound" className={inputClass}>
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
                <option value="internal">Internal</option>
              </select>
              <input type="datetime-local" name="occurredAt" className={inputClass} />
            </div>
            <input name="subject" placeholder="Subject" className={inputClass} />
            <textarea name="notes" rows={2} placeholder="Notes" className={inputClass} />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Follow-up
                <input type="date" name="followUpAt" className="rounded-lg border border-hairline px-2 py-1 text-sm" />
              </label>
              <Button type="submit">Log contact</Button>
            </div>
          </form>
        </details>

        {/* Timeline */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Timeline
          </div>
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-400">No contacts logged yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {contacts.map((c) => {
                const Icon = TYPE_ICON[c.type] ?? MessageSquare;
                return (
                  <li key={c.id} className="flex gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-celeste/10 text-royal">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="capitalize">
                          {c.type} · {c.direction}
                        </span>
                        <span>{new Date(c.occurred_at).toLocaleString("en-US")}</span>
                      </div>
                      {c.subject ? (
                        <div className="text-sm font-medium text-oxford">{c.subject}</div>
                      ) : null}
                      {c.notes ? <p className="text-sm text-slate-600">{c.notes}</p> : null}
                      <div className="mt-0.5 text-xs text-slate-400">
                        by {userName.get(c.logged_by) ?? "unknown"}
                        {c.follow_up_at
                          ? ` · follow-up ${new Date(c.follow_up_at).toLocaleDateString("en-US")}`
                          : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
