import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  grantAccount,
  grantHousehold,
  revokeAccount,
  revokeHousehold,
} from "@/lib/actions/access";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function UserAccessPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireRole("admin");
  const { userId } = await params;

  const supabase = await createClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email, role, active")
    .eq("id", userId)
    .single();
  if (!user) notFound();

  const firmwide = user.role === "admin" || user.role === "ops";

  // Admin sees all households/accounts (RLS firmwide). Grants + current scope.
  const [{ data: households }, { data: accounts }, { data: hGrants }, { data: aGrants }] =
    await Promise.all([
      supabase.from("households").select("id, name").order("name"),
      supabase
        .from("accounts")
        .select("id, account_number_masked, client_id, clients(name)")
        .order("account_number_masked"),
      supabase.from("user_household_grants").select("household_id").eq("user_id", userId),
      supabase.from("user_account_grants").select("account_id").eq("user_id", userId),
    ]);

  const grantedHouseholds = new Set((hGrants ?? []).map((g) => g.household_id));
  const grantedAccounts = new Set((aGrants ?? []).map((g) => g.account_id));
  const selectClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

  return (
    <div>
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-royal hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>
      <PageHeader
        title={`Data access · ${user.name || user.email}`}
        subtitle="Assign the households and accounts this user can see. Every change is audit-logged."
      />

      {firmwide ? (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2">
              <Badge variant="celeste">{user.role}</Badge>
              <p className="text-sm text-slate-600">
                This user has a firmwide view of all households and accounts by role. Grants below
                only take effect if the role is changed to <span className="font-medium">advisor</span>.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Households ({grantedHouseholds.size} granted)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form action={grantHousehold} className="flex gap-2">
              <input type="hidden" name="userId" value={userId} />
              <select name="householdId" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Grant a household…
                </option>
                {(households ?? [])
                  .filter((h) => !grantedHouseholds.has(h.id))
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
              </select>
              <Button type="submit">Grant</Button>
            </form>
            <ul className="flex flex-col divide-y divide-hairline text-sm">
              {(households ?? [])
                .filter((h) => grantedHouseholds.has(h.id))
                .map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-2">
                    <span className="text-oxford">{h.name}</span>
                    <form action={revokeHousehold}>
                      <input type="hidden" name="userId" value={userId} />
                      <input type="hidden" name="householdId" value={h.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-alert">
                        Revoke
                      </Button>
                    </form>
                  </li>
                ))}
              {grantedHouseholds.size === 0 ? (
                <li className="py-2 text-slate-400">No households granted.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Individual accounts ({grantedAccounts.size} granted)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form action={grantAccount} className="flex gap-2">
              <input type="hidden" name="userId" value={userId} />
              <select name="accountId" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Grant an account…
                </option>
                {(accounts ?? [])
                  .filter((a) => !grantedAccounts.has(a.id))
                  .map((a) => {
                    const client = a.clients as unknown as { name: string } | null;
                    return (
                      <option key={a.id} value={a.id}>
                        {a.account_number_masked}
                        {client ? ` · ${client.name}` : ""}
                      </option>
                    );
                  })}
              </select>
              <Button type="submit">Grant</Button>
            </form>
            <ul className="flex flex-col divide-y divide-hairline text-sm">
              {(accounts ?? [])
                .filter((a) => grantedAccounts.has(a.id))
                .map((a) => {
                  const client = a.clients as unknown as { name: string } | null;
                  return (
                    <li key={a.id} className="flex items-center justify-between py-2">
                      <span className="text-oxford">
                        {a.account_number_masked}
                        {client ? (
                          <span className="ml-1 text-xs text-slate-400">{client.name}</span>
                        ) : null}
                      </span>
                      <form action={revokeAccount}>
                        <input type="hidden" name="userId" value={userId} />
                        <input type="hidden" name="accountId" value={a.id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-alert">
                          Revoke
                        </Button>
                      </form>
                    </li>
                  );
                })}
              {grantedAccounts.size === 0 ? (
                <li className="py-2 text-slate-400">No individual accounts granted.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        An advisor also automatically sees clients and households where they are the assigned
        advisor, in addition to the grants above.
      </p>
    </div>
  );
}
