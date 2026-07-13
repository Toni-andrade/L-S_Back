import { Layers } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";

export default async function ModelsPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Models"
        subtitle="Investment model library: sleeves, target weights and versions."
      />
      <EmptyState
        icon={Layers}
        title="No models yet"
        description="Model and strategy administration (admin-only writes) ships in Phase 3, seeded with the full strategy library."
      />
    </div>
  );
}
