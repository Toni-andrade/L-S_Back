import {
  TICKET_STATUS_LABEL,
  slaState,
  type TicketPriority,
  type TicketStatus,
} from "@ls/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { CommentBox } from "@/components/tickets/comment-box";
import { PriorityBadge, SlaBadge } from "@/components/tickets/badges";
import { StatusSelect } from "@/components/tickets/status-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assignTicket, changeTicketDue, linkTicket, unlinkTicket } from "@/lib/actions/tickets";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const LINK_KIND_LABEL: Record<string, string> = {
  relates_to: "relates to",
  blocks: "blocks",
  duplicate_of: "duplicate of",
};

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

  const [{ data: events }, { data: users }, clientResult, { data: canned }, { data: linksOut }, { data: linksIn }] =
    await Promise.all([
      supabase
        .from("ticket_events")
        .select("id, author_id, kind, body, created_at")
        .eq("ticket_id", id)
        .order("created_at"),
      supabase.from("users").select("id, name, email").order("name"),
      t.client_id
        ? supabase.from("clients").select("id, name").eq("id", t.client_id).single()
        : Promise.resolve({ data: null }),
      supabase
        .from("canned_responses")
        .select("id, title, body, category")
        .eq("active", true)
        .order("title"),
      supabase.from("ticket_links").select("id, linked_ticket_id, kind").eq("ticket_id", id),
      supabase.from("ticket_links").select("id, ticket_id, kind").eq("linked_ticket_id", id),
    ]);
  const userName = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
  const client = clientResult.data;

  // Resolve numbers/titles for linked tickets in one query.
  const linkedIds = [
    ...(linksOut ?? []).map((l) => l.linked_ticket_id),
    ...(linksIn ?? []).map((l) => l.ticket_id),
  ];
  const { data: linkedTickets } = linkedIds.length
    ? await supabase.from("tickets").select("id, number, title, status").in("id", linkedIds)
    : { data: [] };
  const linkedById = new Map((linkedTickets ?? []).map((lt) => [lt.id, lt]));

  const status = t.status as TicketStatus;
  const sla = slaState(t.due_at ? new Date(t.due_at) : null, status);

  // Canned responses scoped to this category first, generic ones after.
  const cannedSorted = (canned ?? []).sort((a, b) => {
    const aMatch = a.category === t.category ? 0 : 1;
    const bMatch = b.category === t.category ? 0 : 1;
    return aMatch - bMatch || a.title.localeCompare(b.title);
  });

  const fieldClass =
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

              <CommentBox
                ticketId={t.id}
                canned={cannedSorted.map((c) => ({ id: c.id, title: c.title, body: c.body }))}
              />
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
            <CardContent>
              <StatusSelect id={t.id} status={status} />
              <p className="mt-2 text-xs text-slate-400">Saves immediately; audit-logged.</p>
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
                <select name="assigneeId" defaultValue={t.assignee_id ?? ""} className={fieldClass}>
                  <option value="">Unassigned</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
                <textarea
                  name="comment"
                  rows={2}
                  placeholder="Handoff note (optional, posted as a comment)"
                  className={fieldClass}
                />
                <Button type="submit" variant="outline" className="w-full">
                  Update Assignee
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                SLA due date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={changeTicketDue} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={t.id} />
                <input
                  type="date"
                  name="due"
                  required
                  defaultValue={t.due_at ? String(t.due_at).slice(0, 10) : undefined}
                  className={fieldClass}
                />
                <input
                  type="text"
                  name="reason"
                  required
                  minLength={3}
                  placeholder="Reason (required, audit-logged)"
                  className={fieldClass}
                />
                <Button type="submit" variant="outline" className="w-full">
                  Change Due Date
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Linked tickets
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(linksOut ?? []).map((l) => {
                const lt = linkedById.get(l.linked_ticket_id);
                if (!lt) return null;
                return (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-xs text-slate-400">{LINK_KIND_LABEL[l.kind]}</span>{" "}
                      <Link href={`/tickets/${lt.id}`} className="text-royal hover:underline">
                        {lt.number}
                      </Link>
                    </span>
                    <form action={unlinkTicket}>
                      <input type="hidden" name="linkId" value={l.id} />
                      <input type="hidden" name="ticketId" value={t.id} />
                      <button type="submit" className="text-xs text-slate-400 hover:text-alert">
                        Remove
                      </button>
                    </form>
                  </div>
                );
              })}
              {(linksIn ?? []).map((l) => {
                const lt = linkedById.get(l.ticket_id);
                if (!lt) return null;
                return (
                  <div key={l.id} className="text-sm">
                    <Link href={`/tickets/${lt.id}`} className="text-royal hover:underline">
                      {lt.number}
                    </Link>{" "}
                    <span className="text-xs text-slate-400">{LINK_KIND_LABEL[l.kind]} this ticket</span>
                  </div>
                );
              })}
              <form action={linkTicket} className="mt-1 flex flex-col gap-2">
                <input type="hidden" name="id" value={t.id} />
                <input
                  type="text"
                  name="number"
                  required
                  placeholder="LS-2026-0001"
                  pattern="LS-\d{4}-\d{4}"
                  className={fieldClass}
                />
                <select name="kind" defaultValue="relates_to" className={fieldClass}>
                  <option value="relates_to">relates to</option>
                  <option value="blocks">blocks</option>
                  <option value="duplicate_of">duplicate of</option>
                </select>
                <Button type="submit" variant="outline" className="w-full">
                  Link Ticket
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
