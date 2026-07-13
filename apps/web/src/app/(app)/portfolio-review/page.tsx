import { PieChart } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";

export default async function PortfolioReviewPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Portfolio Review"
        subtitle="Household-level consolidated views fed by nightly Addepar syncs."
      />
      <EmptyState
        icon={PieChart}
        title="No portfolio data yet"
        description="Households, holdings, performance and the flags panel populate here once the Addepar integration ships in Phase 1."
      />
    </div>
  );
}
