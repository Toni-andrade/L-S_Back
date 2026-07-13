import { SLA_BUSINESS_DAYS, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@ls/domain";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createTicket } from "@/lib/actions/tickets";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requireUser();
  const { clientId } = await searchParams;

  const supabase = await createClient();
  const [{ data: clients }, { data: users }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("users").select("id, name, email").eq("active", true).order("name"),
  ]);

  const selectClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

  return (
    <div>
      <PageHeader
        title="New Ticket"
        subtitle={`SLA defaults in business days: urgent ${SLA_BUSINESS_DAYS.urgent}, high ${SLA_BUSINESS_DAYS.high}, medium ${SLA_BUSINESS_DAYS.medium}, low ${SLA_BUSINESS_DAYS.low}.`}
      />
      <Card className="max-w-2xl">
        <CardContent className="pt-5">
          <form action={createTicket} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Title
              </label>
              <input name="title" required minLength={3} className={selectClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Description
              </label>
              <textarea name="description" rows={4} className={selectClass} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Category
                </label>
                <select name="category" defaultValue="operations" className={selectClass}>
                  {TICKET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Priority
                </label>
                <select name="priority" defaultValue="medium" className={selectClass}>
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Client (optional)
                </label>
                <select name="clientId" defaultValue={clientId ?? ""} className={selectClass}>
                  <option value="">None</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Assignee (optional)
                </label>
                <select name="assigneeId" defaultValue="" className={selectClass}>
                  <option value="">Unassigned</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Create Ticket</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
