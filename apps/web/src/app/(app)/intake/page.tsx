import {
  INTAKE_STAGES,
  INTAKE_STATUS_LABEL,
  type IntakeStatus,
} from "@ls/domain";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { importIntakeManual } from "@/lib/actions/intake";
import { requireUser } from "@/lib/auth";
import { intakeStageCounts } from "@/lib/data";
import { intakeWebhookConfigured } from "@/lib/intake/config";
import { createClient } from "@/lib/supabase/server";

const ALL_STATUSES: IntakeStatus[] = [...INTAKE_STAGES, "converted", "discarded"];

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; imported?: string; duplicates?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const stageFilter = ALL_STATUSES.includes(params.stage as IntakeStatus)
    ? (params.stage as IntakeStatus)
    : null;

  const supabase = await createClient();
  const [counts, { data: submissions }] = await Promise.all([
    intakeStageCounts(),
    (stageFilter
      ? supabase.from("intake_submissions").select("*").eq("status", stageFilter)
      : supabase.from("intake_submissions").select("*")
    )
      .order("received_at", { ascending: false })
      .limit(200),
  ]);

  const canWrite = user.role === "ops" || user.role === "admin";

  return (
    <div>
      <PageHeader
        title="Intake Pipeline"
        subtitle="Prospect submissions from the firm website: triage, convert, discard."
      />

      {params.imported !== undefined ? (
        <div className="mb-4 rounded-lg border border-verde/30 bg-verde/5 px-4 py-2.5 text-sm text-verde">
          Imported {params.imported} submission(s)
          {Number(params.duplicates) > 0 ? `, skipped ${params.duplicates} duplicate(s)` : ""}.
        </div>
      ) : null}

      {!intakeWebhookConfigured() ? (
        <div className="mb-4 rounded-lg border border-marrom/30 bg-marrom/5 px-4 py-2.5 text-sm text-marrom">
          INTAKE_WEBHOOK_SECRET is not set: the website webhook is inactive (Open Item 2). The
          manual import below is the primary intake path until it is configured.
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {INTAKE_STAGES.map((stage) => (
          <Link key={stage} href={stageFilter === stage ? "/intake" : `/intake?stage=${stage}`}>
            <Card
              className={
                stageFilter === stage ? "border-royal ring-1 ring-royal" : "hover:border-celeste"
              }
            >
              <CardContent className="pt-5">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {INTAKE_STATUS_LABEL[stage]}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-oxford">
                  {counts[stage] ?? 0}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mb-6 flex items-center gap-3 text-sm text-slate-500">
        <span>
          Terminal: Converted {counts.converted ?? 0} · Discarded {counts.discarded ?? 0}
        </span>
        {stageFilter ? (
          <Link href="/intake" className="text-royal hover:underline">
            Clear filter
          </Link>
        ) : null}
      </div>

      {(submissions ?? []).length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No submissions"
          description={
            stageFilter
              ? `Nothing in ${INTAKE_STATUS_LABEL[stageFilter]}.`
              : "Website submissions and manual imports appear here."
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Received</th>
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Email</th>
                  <th className="py-2 font-medium">Country</th>
                  <th className="py-2 font-medium">Investable</th>
                  <th className="py-2 font-medium">Source</th>
                  <th className="py-2 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {(submissions ?? []).map((s) => (
                  <tr key={s.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
                    <td className="py-2.5 text-slate-500">
                      {new Date(s.received_at).toLocaleDateString("en-US")}
                    </td>
                    <td className="py-2.5">
                      <Link href={`/intake/${s.id}`} className="font-medium text-royal hover:underline">
                        {s.name ?? "—"}
                      </Link>
                    </td>
                    <td className="py-2.5 text-slate-500">{s.email ?? "—"}</td>
                    <td className="py-2.5 text-slate-500">{s.country ?? "—"}</td>
                    <td className="py-2.5 text-slate-500">{s.investable_range ?? "—"}</td>
                    <td className="py-2.5">
                      <Badge variant={s.source === "website" ? "celeste" : "default"}>
                        {s.source === "website" ? "Website" : "Manual"}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <StageBadge status={s.status as IntakeStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {canWrite ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-royal">
            Manual import (paste JSON or CSV)
          </summary>
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Import submissions</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={importIntakeManual} className="flex flex-col gap-3">
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="format" value="json" defaultChecked /> JSON (object or
                    array)
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="format" value="csv" /> CSV (header row)
                  </label>
                </div>
                <textarea
                  name="payload"
                  required
                  rows={6}
                  placeholder='[{"name":"Maria Silva","email":"maria@example.com","country":"BR"}]'
                  className="w-full rounded-lg border border-hairline bg-white p-3 font-mono text-xs text-oxford focus:border-royal focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    Same field mapper and dedupe as the webhook; duplicates are skipped.
                  </p>
                  <Button type="submit">Import</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </details>
      ) : null}
    </div>
  );
}

function StageBadge({ status }: { status: IntakeStatus }) {
  const variant =
    status === "converted"
      ? "success"
      : status === "discarded"
        ? "alert"
        : status === "new_lead"
          ? "celeste"
          : "default";
  return <Badge variant={variant}>{INTAKE_STATUS_LABEL[status]}</Badge>;
}
