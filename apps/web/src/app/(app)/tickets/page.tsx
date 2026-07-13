import { Ticket } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";

export default async function TicketsPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle="Internal ticketing for operations, trading, reporting, tax and onboarding."
      />
      <EmptyState
        icon={Ticket}
        title="No tickets yet"
        description="Ticket CRUD, saved views, SLA states and the activity stream ship in Phase 2. Numbers follow the LS-YYYY-#### format."
      />
    </div>
  );
}
