import { formatCurrencyUS } from "@ls/domain";
import { FileText } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT = {
  draft: "default",
  in_review: "celeste",
  approved: "success",
  sent: "royal",
  superseded: "marrom",
} as const;

export default async function ProposalsPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: proposals }, { data: templates }] = await Promise.all([
    supabase
      .from("proposals")
      .select("id, client_name, status, version, total_aum, risk_profile, month_year, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("proposal_templates").select("id, name, risk_profile").eq("active", true).order("name"),
  ]);

  return (
    <div>
      <PageHeader
        title="Proposals"
        subtitle="Branded client investment proposals (PPTX + Portuguese email draft)."
        action={
          <Link href="/proposals/new" className={buttonVariants({ variant: "primary" })}>
            New Proposal
          </Link>
        }
      />

      {(templates ?? []).length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Start from template:</span>
          {(templates ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/proposals/new?template=${t.id}`}
              className="rounded-full bg-white px-3 py-1 text-sm text-royal ring-1 ring-hairline hover:bg-app-bg"
            >
              {t.name}
              {t.risk_profile ? <span className="ml-1 text-xs text-slate-400">({t.risk_profile})</span> : null}
            </Link>
          ))}
        </div>
      ) : null}

      {(proposals ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No proposals yet"
          description="Start from an active model or compose strategies directly with New Proposal."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Reference</th>
                  <th className="py-2 font-medium">AUM</th>
                  <th className="py-2 font-medium">Profile</th>
                  <th className="py-2 font-medium">Version</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(proposals ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
                    <td className="py-2.5">
                      <Link href={`/proposals/${p.id}`} className="font-medium text-royal hover:underline">
                        {p.client_name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-slate-500">{p.month_year}</td>
                    <td className="py-2.5 tabular-nums text-slate-500">
                      {formatCurrencyUS(Number(p.total_aum))}
                    </td>
                    <td className="py-2.5 capitalize text-slate-500">{p.risk_profile}</td>
                    <td className="py-2.5 tabular-nums text-slate-500">v{p.version}</td>
                    <td className="py-2.5">
                      <Badge variant={STATUS_VARIANT[p.status as keyof typeof STATUS_VARIANT]}>
                        {p.status.replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
