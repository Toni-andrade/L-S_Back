import { Landmark } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const CUSTODIAN_LABEL: Record<string, string> = {
  ibkr: "IBKR",
  morgan_stanley: "Morgan Stanley",
  other: "Other",
};

export default async function AccountsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, custodian, account_number_masked, addepar_entity_id, base_currency, status, clients(id, name)")
    .order("created_at");

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Custodial accounts aggregated through Addepar. Numbers always masked to last 4."
      />
      {!accounts || accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No accounts yet"
          description="Accounts are mapped from Addepar entities under Integrations."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Account</th>
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Custodian</th>
                  <th className="py-2 font-medium">Currency</th>
                  <th className="py-2 font-medium">Addepar</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const client = a.clients as unknown as { id: string; name: string } | null;
                  return (
                    <tr key={a.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
                      <td className="py-2.5 font-mono text-oxford">{a.account_number_masked}</td>
                      <td className="py-2.5">
                        {client ? (
                          <Link href={`/portfolio-review/client/${client.id}`} className="text-royal hover:underline">
                            {client.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5">
                        <Badge variant="celeste">{CUSTODIAN_LABEL[a.custodian] ?? a.custodian}</Badge>
                      </td>
                      <td className="py-2.5 text-slate-500">{a.base_currency}</td>
                      <td className="py-2.5 text-slate-500">
                        {a.addepar_entity_id ? `#${a.addepar_entity_id}` : <Badge variant="alert">unmapped</Badge>}
                      </td>
                      <td className="py-2.5">
                        <Badge variant={a.status === "open" ? "success" : "default"}>{a.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
