import { Users } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ClientsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, type, status, risk_profile, is_brazil_taxpayer, household_id, households(name)")
    .order("name");

  return (
    <div>
      <PageHeader title="Clients" subtitle="Prospects and active clients across households." />
      {!clients || clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Clients arrive via Addepar entity mapping or intake conversion (Phase 2)."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Household</th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Risk Profile</th>
                  <th className="py-2 font-medium">Tax</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
                    <td className="py-2.5">
                      <Link href={`/portfolio-review/client/${c.id}`} className="font-medium text-royal hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {(c.households as unknown as { name: string } | null)?.name ?? "—"}
                    </td>
                    <td className="py-2.5 capitalize text-slate-500">{c.type}</td>
                    <td className="py-2.5">
                      <Badge variant={c.status === "active" ? "success" : "default"}>{c.status}</Badge>
                    </td>
                    <td className="py-2.5 capitalize text-slate-500">{c.risk_profile ?? "—"}</td>
                    <td className="py-2.5">
                      {c.is_brazil_taxpayer ? <Badge variant="marrom">BR taxpayer</Badge> : "—"}
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
