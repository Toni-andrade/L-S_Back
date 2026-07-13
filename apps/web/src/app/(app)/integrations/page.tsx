import { Plug } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";

export default async function IntegrationsPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Feed health, sync history and entity mapping for external systems."
      />
      <EmptyState
        icon={Plug}
        title="Nothing connected yet"
        description="Addepar (entity/group mapping, sync jobs, on-demand refresh) arrives in Phase 1; the website intake webhook in Phase 2."
      />
    </div>
  );
}
