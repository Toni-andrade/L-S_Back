import { TICKET_STATUS_LABEL, slaState, type TicketStatus } from "@ls/domain";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PriorityBadge, SlaBadge } from "@/components/tickets/badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { ticketsList, type TicketListRow } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const VIEWS = [
  { key: "open", label: "All open" },
  { key: "my", label: "My open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "breaching", label: "Breaching SLA" },
  { key: "waiting_custodian", label: "Waiting on custodian" },
  { key: "all", label: "Everything" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

function isOpen(t: TicketListRow) {
  return t.status !== "resolved" && t.status !== "closed";
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === params.view)
    ? (params.view as ViewKey)
    : "open";

  const [tickets, usersResult] = await Promise.all([
    ticketsList(),
    (await createClient()).from("users").select("id, name, email"),
  ]);
  const userName = new Map(
    (usersResult.data ?? []).map((u) => [u.id, u.name || u.email]),
  );

  const now = new Date();
  const withSla = tickets.map((t) => ({
    ...t,
    sla: slaState(t.due_at ? new Date(t.due_at) : null, t.status, now),
  }));

  const filtered = withSla.filter((t) => {
    switch (view) {
      case "my":
        return isOpen(t) && t.assignee_id === user.id;
      case "unassigned":
        return isOpen(t) && t.assignee_id === null;
      case "breaching":
        return isOpen(t) && t.sla === "breached";
      case "waiting_custodian":
        return t.status === "waiting_custodian";
      case "all":
        return true;
      default:
        return isOpen(t);
    }
  });

  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle="Internal ticketing for operations, trading, reporting, tax and onboarding."
        action={
          <Link href="/tickets/new" className={buttonVariants({ variant: "primary" })}>
            New Ticket
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/tickets?view=${v.key}`}
            className={`rounded-full px-3 py-1 text-sm ${
              view === v.key
                ? "bg-royal text-white"
                : "bg-white text-slate-500 ring-1 ring-hairline hover:text-royal"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No tickets in this view"
          description="Create one with New Ticket, from an intake conversion, or from a portfolio flag."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Number</th>
                  <th className="py-2 font-medium">Title</th>
                  <th className="py-2 font-medium">Category</th>
                  <th className="py-2 font-medium">Priority</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Assignee</th>
                  <th className="py-2 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
                    <td className="py-2.5 font-mono text-xs text-slate-500">{t.number}</td>
                    <td className="py-2.5">
                      <Link href={`/tickets/${t.id}`} className="font-medium text-royal hover:underline">
                        {t.title}
                      </Link>
                    </td>
                    <td className="py-2.5 capitalize text-slate-500">{t.category}</td>
                    <td className="py-2.5">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {TICKET_STATUS_LABEL[t.status as TicketStatus]}
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {t.assignee_id ? (userName.get(t.assignee_id) ?? "—") : "Unassigned"}
                    </td>
                    <td className="py-2.5">
                      <SlaBadge state={t.sla} dueAt={t.due_at} />
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
