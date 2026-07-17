import { TICKET_CATEGORIES, ageDays, slaDueWithin, slaState } from "@ls/domain";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { TicketsWorkspace, type WorkspaceRow } from "@/components/tickets/tickets-workspace";
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
  searchParams: Promise<{ view?: string; cat?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === params.view)
    ? (params.view as ViewKey)
    : "open";
  const cat = TICKET_CATEGORIES.includes(params.cat as (typeof TICKET_CATEGORIES)[number])
    ? (params.cat as string)
    : null;
  const mode: "list" | "board" = params.mode === "board" ? "board" : "list";

  const [tickets, usersResult] = await Promise.all([
    ticketsList(),
    (await createClient()).from("users").select("id, name, email").order("name"),
  ]);
  const users = (usersResult.data ?? []).map((u) => ({ id: u.id, label: u.name || u.email }));

  const now = new Date();
  const stats = ticketCategoryStats(tickets, now);
  const withSla: (WorkspaceRow & { dueSoon: boolean })[] = tickets.map((t) => ({
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
    dueSoon: t.due_at ? slaDueWithin(new Date(t.due_at), t.status, 24, now) : false,
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
  const href = (v: string, c: string | null, m: string) =>
    `/tickets?view=${v}${c ? `&cat=${c}` : ""}${m === "board" ? "&mode=board" : ""}`;
  const back = href(view, cat, mode);

  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle="Internal ticketing for operations, trading, reporting, tax and onboarding."
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg ring-1 ring-hairline">
              <Link
                href={href(view, cat, "list")}
                className={`rounded-l-lg px-3 py-1.5 text-sm ${
                  mode === "list" ? "bg-oxford text-white" : "bg-white text-slate-500 hover:text-royal"
                }`}
              >
                List
              </Link>
              <Link
                href={href(view, cat, "board")}
                className={`rounded-r-lg px-3 py-1.5 text-sm ${
                  mode === "board" ? "bg-oxford text-white" : "bg-white text-slate-500 hover:text-royal"
                }`}
              >
                Board
              </Link>
            </div>
            <Link href="/tickets/new" className={buttonVariants({ variant: "primary" })}>
              New Ticket
            </Link>
          </div>
        }
      />

      {stats.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href={href(view, null, mode)}
            className={`rounded-lg px-3 py-1.5 text-sm ring-1 ring-hairline ${
              cat === null ? "bg-oxford text-white" : "bg-white text-slate-500 hover:text-royal"
            }`}
          >
            All categories
          </Link>
          {stats.map((s) => (
            <Link
              key={s.category}
              href={href(view, s.category, mode)}
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
            href={href(v.key, cat, mode)}
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
            <TicketsWorkspace
              tickets={filtered}
              users={users}
              back={back}
              canBulk={canBulk}
              mode={mode}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
