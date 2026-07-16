import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveCannedResponse, setCannedResponseActive } from "@/lib/actions/canned-responses";
import { updateSlaPolicy } from "@/lib/actions/contacts";
import { addAllowedEmail, removeAllowedEmail, sendUserInvite, setUserActive, setUserRole } from "./actions";

export default async function SettingsPage() {
  const me = await requireRole("admin");
  const supabase = await createClient();

  const [{ data: users }, { data: allowed }, { data: slas }, { data: canned }] = await Promise.all([
    supabase.from("users").select("id, email, name, role, active").order("created_at"),
    supabase.from("allowed_emails").select("id, email, note").order("email"),
    supabase
      .from("sla_policies")
      .select("id, kind, name, threshold_days, business_days, active")
      .order("kind"),
    supabase
      .from("canned_responses")
      .select("id, title, body, category, active")
      .order("title"),
  ]);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="User activation, roles and the signup allowlist. Admin only; every change is audit-logged."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">User</th>
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-hairline last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium text-oxford">{u.name || "(no name)"}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td className="py-2.5">
                      <form action={setUserRole} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          disabled={u.id === me.id}
                          className="rounded-lg border border-hairline bg-white px-2 py-1 text-xs"
                        >
                          <option value="advisor">advisor</option>
                          <option value="ops">ops</option>
                          <option value="admin">admin</option>
                        </select>
                        {u.id !== me.id ? (
                          <Button type="submit" variant="ghost" size="sm">
                            Save
                          </Button>
                        ) : null}
                      </form>
                    </td>
                    <td className="py-2.5">
                      {u.active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="alert">Pending</Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/settings/access/${u.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                          title="Manage which households and accounts this user can see"
                        >
                          Access
                        </Link>
                        {u.id !== me.id ? (
                          <form action={setUserActive}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={u.active ? "false" : "true"}
                            />
                            <Button
                              type="submit"
                              variant={u.active ? "outline" : "primary"}
                              size="sm"
                            >
                              {u.active ? "Deactivate" : "Activate"}
                            </Button>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-400">you</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signup allowlist</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form action={addAllowedEmail} className="flex gap-2">
              <Input name="email" type="email" placeholder="person@lsinvestment.com" required />
              <Button type="submit">Add</Button>
            </form>
            <ul className="flex flex-col divide-y divide-hairline text-sm">
              {(allowed ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-oxford">{a.email}</span>
                    {a.note ? <span className="ml-2 text-xs text-slate-400">{a.note}</span> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <form action={sendUserInvite}>
                      <input type="hidden" name="email" value={a.email} />
                      <Button type="submit" variant="ghost" size="sm" title="Email a login invite via Resend">
                        Invite
                      </Button>
                    </form>
                    <form action={removeAllowedEmail}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-alert">
                        Remove
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
              {(allowed ?? []).length === 0 ? (
                <li className="py-2 text-slate-400">No allowlisted emails.</li>
              ) : null}
            </ul>
            <p className="text-xs text-slate-400">
              Signups are rejected at the database unless the email is listed here, its domain is
              in allowed_domains, or it matches ALLOWED_EMAIL_DOMAIN. New users start inactive.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>SLA policies</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Policy</th>
                <th className="py-2 font-medium">Kind</th>
                <th className="py-2 font-medium">Threshold</th>
                <th className="py-2 font-medium">Active</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(slas ?? []).map((p) => (
                <tr key={p.id} className="border-b border-hairline last:border-0">
                  <td className="py-2.5 text-oxford">{p.name}</td>
                  <td className="py-2.5 text-slate-500">{p.kind.replace("_", " ")}</td>
                  <td className="py-2.5">
                    <form action={updateSlaPolicy} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        type="number"
                        name="thresholdDays"
                        min="1"
                        defaultValue={p.threshold_days}
                        className="w-16 rounded-lg border border-hairline px-2 py-1 text-sm"
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input type="checkbox" name="businessDays" defaultChecked={p.business_days} />{" "}
                        biz days
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input type="checkbox" name="active" defaultChecked={p.active} value="on" />{" "}
                        active
                      </label>
                      <Button type="submit" variant="ghost" size="sm">
                        Save
                      </Button>
                    </form>
                  </td>
                  <td className="py-2.5">
                    {p.active ? (
                      <Badge variant="success">on</Badge>
                    ) : (
                      <Badge variant="default">off</Badge>
                    )}
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-400">
            Review cadence varies by risk profile. Thresholds are measured against the client
            contact + review timeline; changes are audit-logged.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Canned ticket responses</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={saveCannedResponse} className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Input name="title" placeholder="Title (shown in the picker)" required className="max-w-xs" />
              <select
                name="category"
                defaultValue=""
                className="rounded-lg border border-hairline bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Any category</option>
                <option value="operations">operations</option>
                <option value="trading">trading</option>
                <option value="reporting">reporting</option>
                <option value="tax">tax</option>
                <option value="onboarding">onboarding</option>
                <option value="tech">tech</option>
                <option value="other">other</option>
              </select>
            </div>
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Response text inserted into the ticket comment box."
              className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none"
            />
            <div>
              <Button type="submit">Add Response</Button>
            </div>
          </form>
          <ul className="flex flex-col divide-y divide-hairline text-sm">
            {(canned ?? []).map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-oxford">
                    {c.title}
                    {c.category ? (
                      <span className="ml-2 text-xs font-normal capitalize text-slate-400">
                        {c.category}
                      </span>
                    ) : null}
                    {!c.active ? (
                      <Badge variant="default" className="ml-2">
                        inactive
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-slate-400">{c.body}</p>
                </div>
                <form action={setCannedResponseActive}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                  <Button type="submit" variant="ghost" size="sm">
                    {c.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </form>
              </li>
            ))}
            {(canned ?? []).length === 0 ? (
              <li className="py-2 text-slate-400">
                No canned responses yet. They appear in the comment box on every ticket.
              </li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
