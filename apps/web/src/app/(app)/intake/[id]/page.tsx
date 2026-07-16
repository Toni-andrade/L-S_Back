import {
  INTAKE_STAGES,
  INTAKE_STATUS_LABEL,
  type IntakeStatus,
} from "@ls/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { convertIntake, discardIntake, moveIntakeStage } from "@/lib/actions/intake";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function IntakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const { data: s } = await supabase.from("intake_submissions").select("*").eq("id", id).single();
  if (!s) notFound();

  const status = s.status as IntakeStatus;
  const isTerminal = status === "converted" || status === "discarded";
  const canWrite = (user.role === "ops" || user.role === "admin") && !isTerminal;

  const fields: [string, string | null][] = [
    ["Name", s.name],
    ["Email", s.email],
    ["Phone", s.phone],
    ["Country", s.country],
    ["Investable range", s.investable_range],
    ["Message", s.message],
  ];

  return (
    <div>
      <PageHeader
        title={s.name ?? s.email ?? "Intake submission"}
        subtitle={`Received ${new Date(s.received_at).toLocaleString("en-US")} via ${
          s.source === "website" ? "website webhook" : "manual import"
        }`}
      />

      <div className="mb-4 flex items-center gap-2">
        <Badge
          variant={status === "converted" ? "success" : status === "discarded" ? "alert" : "celeste"}
        >
          {INTAKE_STATUS_LABEL[status]}
        </Badge>
        {s.signature_valid ? (
          <Badge variant="success">Signature verified</Badge>
        ) : (
          <Badge variant="marrom">Unsigned ({s.source === "website" ? "check secret" : "manual"})</Badge>
        )}
        {s.converted_client_id ? (
          <Link
            href={`/portfolio-review/client/${s.converted_client_id}`}
            className="text-sm text-royal hover:underline"
          >
            View client →
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Submission</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                {fields.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="mt-0.5 text-sm text-oxford">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              {s.discard_reason ? (
                <p className="mt-4 rounded-lg bg-alert/5 px-3 py-2 text-sm text-alert">
                  Discarded: {s.discard_reason}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raw payload</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-app-bg p-3 text-xs text-oxford">
                {JSON.stringify(s.raw, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {canWrite ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Move stage
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {INTAKE_STAGES.filter((stage) => stage !== status).map((stage) => (
                    <form key={stage} action={moveIntakeStage}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="to" value={stage} />
                      <Button type="submit" variant="outline" className="w-full">
                        {INTAKE_STATUS_LABEL[stage]}
                      </Button>
                    </form>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Convert to prospect
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={convertIntake} className="flex flex-col gap-3">
                    <input type="hidden" name="id" value={s.id} />
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" name="createTicket" defaultChecked />
                      Create onboarding ticket
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" name="startWorkflow" defaultChecked />
                      Start Account Opening playbook
                    </label>
                    <Button type="submit" className="w-full">
                      Convert
                    </Button>
                    <p className="text-xs text-slate-400">
                      Creates a prospect client from this submission. With the playbook checked,
                      the opening lands on the Onboarding board linked back to this lead.
                    </p>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Discard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={discardIntake} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder="Reason (required)"
                      className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:border-royal focus:outline-none"
                    />
                    <Button type="submit" variant="outline" className="w-full text-alert">
                      Discard
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="pt-5 text-sm text-slate-500">
                {isTerminal
                  ? "This submission is in a terminal state."
                  : "Intake actions are limited to ops and admin roles."}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
