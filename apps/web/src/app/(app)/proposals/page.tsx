import { FileText } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";

export default async function ProposalsPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Proposals"
        subtitle="Branded client investment proposals (PPTX + Portuguese email draft)."
      />
      <EmptyState
        icon={FileText}
        title="No proposals yet"
        description="The brief form, strategy library, compliance flags and PPTX generation ship in Phase 3."
      />
    </div>
  );
}
