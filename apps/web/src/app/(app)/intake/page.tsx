import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";

export default async function IntakePage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Intake Pipeline"
        subtitle="Prospect submissions from the firm website: triage, convert, discard."
      />
      <EmptyState
        icon={Inbox}
        title="No submissions yet"
        description="The signed webhook, the staged pipeline (New Leads through Pending Onboarding) and the manual JSON/CSV import fallback ship in Phase 2."
      />
    </div>
  );
}
