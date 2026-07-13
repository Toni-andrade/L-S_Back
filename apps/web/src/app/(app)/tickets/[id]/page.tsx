import {
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  slaState,
  type TicketPriority,
  type TicketStatus,
} from "@ls/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { PriorityBadge, SlaBadge } from "@/components/tickets/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assignTicket, commentTicket, updateTicketStatus } from "@/lib/actions/tickets";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("*").eq("id", id).single();
  if (!t) notFound();

  const [{ data: events }, { data: users }, clientResult] = await Promise.all([
    supabase
      .from("ticket_events")
      .select("id, author_id, kind, body, created_at")
      .eq("ticket_id", id)
      .order("created_at"),
    supabase.from("users").select("id, name, email").order("name"),
    t.client_id
      ? supabase.from("clients").select("id, name").eq("id", t.client_id).single()
      : Promise.resolve({ data: null }),
  ]);
  const userName = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
  const client = clientResult.data;

  const status = t.status as TicketStatus;
  const sla = slaState(t.due_at ? new Date(t.due_at) : null, status);

  const selectClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

  return (
    <div>
      <PageHeader title={`${t.number} · ${t.title}`} subtitle={`Category: ${t.category}`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="celeste">{TICKET_STATUS_LABEL[status]}</Badge>
        <PriorityBadge priority={t.priority as TicketPriority} />
        <SlaBadge state={sla} dueAt={t.due_at} />
        {client ? (
          <Link
            href={`/portfolio-review/client/${client.id}`}
            className="text-sm text-royal hover:underline"
          >
            {client.name} →
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {t.description ? (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-slate-600">{t.description}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {(events ?? []).map((e) => (
                  <li key={e.id} className="border-b border-hairline pb-3 text-sm last:border-0 last:pb-0">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>
                        {userName.get(e.author_id) ?? "System"} ·{" "}
                        <span className="capitalize">{e.kind.replace("_", " ")}</span>
                      </span>
                      <span>{new Date(e.created_at).toLocaleString("en-US")}</span>
                    </div>
                    {e.body ? (
                      <p className="mt-1 whitespace-pre-wrap text-oxford">{e.body}</p>
                    ) : null}
                  </li>
                ))}
              </ol>

              <form action={commentTicket} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="id" value={t.id} />
                <textarea
                  name="body"
                  required
                  rows={3}
                  placeholder="Add a comment…"
                  className={selectClass}
                />
                <div className="flex justify-end">
                  <Button type="submit" variant="outline">
                    Comment
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {TICKET_STATUSES.filter((s) => s !== status).map((s) => (
                <form key={s} action={updateTicketStatus}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="to" value={s} />
                  <Button type="submit" variant="outline" className="w-full">
                    {TICKET_STATUS_LABEL[s]}
                  </Button>
                </form>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assignee
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={assignTicket} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={t.id} />
                <select name="assigneeId" defaultValue={t.assignee_id ?? ""} className={selectClass}>
                  <option value="">Unassigned</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline" className="w-full">
                  Update Assignee
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 text-xs text-slate-400">
              Created {new Date(t.created_at).toLocaleString("en-US")} by{" "}
              {userName.get(t.created_by) ?? "unknown"}.
              {t.due_at ? ` Due ${new Date(t.due_at).toLocaleDateString("en-US")}.` : ""}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
