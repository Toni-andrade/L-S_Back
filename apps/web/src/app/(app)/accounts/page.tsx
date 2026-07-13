import { Landmark } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";

export default async function AccountsPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Custodial accounts (IBKR, Morgan Stanley) aggregated through Addepar."
      />
      <EmptyState
        icon={Landmark}
        title="No accounts yet"
        description="Accounts are mapped from Addepar entities in Phase 1. Account numbers are always masked to the last 4 digits."
      />
    </div>
  );
}
