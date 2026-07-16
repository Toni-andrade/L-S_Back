import { TICKET_CATEGORIES, ageDays, slaDueWithin, slaState } from "@ls/domain";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { TicketsTable, type TicketTableRow } from "@/components/tickets/tickets-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { ticketCategoryStats, ticketsList } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const VIEWS = [
  { key: "open", label: "All open" },
  { key: "my", label: "My open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "breaching", label: "Breaching SLA" },
  { key: "due_soon", label: "Due in 24h" },
  { key: "waiting_custodian", label: "Waiting on custodian" },
  { key: "all", label: "Everything" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

function isOpen(t: { status: string }) {
  return t.status !== "resolved" && t.status !== "closed";
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; cat?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === params.view)
    ? (params.view as ViewKey)
    : "open";
  const cat = TICKET_CATEGORIES.includes(params.cat as (typeof TICKET_CATEGORIES)[number])
    ? (params.cat as string)
    : null;

  const [tickets, usersResult] = await Promise.all([
    ticketsList(),
    (await createClient()).from("users").select("id, name, email").order("name"),
  ]);
  const users = (usersResult.data ?? []).map((u) => ({ id: u.id, label: u.name || u.email }));

  const now = new Date();
  const stats = ticketCategoryStats(tickets, now);
  const withSla: (TicketTableRow & { dueSoon: boolean })[] = tickets.map((t) => ({
    dueSoon: t.due_at ? slaDueWithin(new Date(t.due_at), t.status, 24, now) : false,
    id: t.id,
    number: t.number,
    title: t.title,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignee_id: t.assignee_id,
    due_at: t.due_at,
    sla: slaState(t.due_at ? new Date(t.due_at) : null, t.status, now),
    ageDays: ageDays(new Date(t.created_at), now),
  }));

  const filtered = withSla.filter((t) => {
    if (cat && t.category !== cat) return false;
    switch (view) {
      case "my":
        return isOpen(t) && t.assignee_id === user.id;
      case "unassigned":
        return isOpen(t) && t.assignee_id === null;
      case "breaching":
        return isOpen(t) && t.sla === "breached";
      case "due_soon":
        return isOpen(t) && t.dueSoon;
      case "waiting_custodian":
        return t.status === "waiting_custodian";
      case "all":
        return true;
      default:
        return isOpen(t);
    }
  });

  const canBulk = user.role === "ops" || user.role === "admin";
  const back = `/tickets?view=${view}${cat ? `&cat=${cat}` : ""}`;
  const viewHref = (v: string, c: string | null) => `/tickets?view=${v}${c ? `&cat=${c}` : ""}`;

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

      {stats.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href={viewHref(view, null)}
            className={`rounded-lg px-3 py-1.5 text-sm ring-1 ring-hairline ${
              cat === null ? "bg-oxford text-white" : "bg-white text-slate-500 hover:text-royal"
            }`}
          >
            All categories
          </Link>
          {stats.map((s) => (
            <Link
              key={s.category}
              href={viewHref(view, s.category)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ring-hairline ${
                cat === s.category
                  ? "bg-oxford text-white"
                  : "bg-white text-slate-500 hover:text-royal"
              }`}
            >
              <span className="capitalize">{s.category}</span>
              <span className="tabular-nums">{s.open}</span>
              {s.breached > 0 ? (
                <span className="rounded-full bg-alert px-1.5 text-xs font-medium text-white">
                  {s.breached}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={viewHref(v.key, cat)}
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
            <TicketsTable tickets={filtered} users={users} back={back} canBulk={canBulk} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
