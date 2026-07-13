import { Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";

export default async function ClientsPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="Clients" subtitle="Prospects and active clients across households." />
      <EmptyState
        icon={Users}
        title="No clients yet"
        description="Client and household records arrive in Phase 1 with the Addepar entity mapping, and via intake conversion in Phase 2."
      />
    </div>
  );
}
