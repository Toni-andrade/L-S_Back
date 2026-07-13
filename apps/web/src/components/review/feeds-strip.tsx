import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

function minutesAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / (60 * 24))}d ago`;
}

/**
 * Connected Feeds strip (Section 6). No trading-feed tile: custody flows
 * through Addepar.
 */
export function FeedsStrip({
  addeparConfigured,
  mappedAccounts,
  lastSync,
}: {
  addeparConfigured: boolean;
  mappedAccounts: number;
  lastSync: { status: string; finished_at: string | null; error: string | null } | null;
}) {
  const syncFailed = lastSync?.status === "error" && addeparConfigured;
  const healthy = !syncFailed;

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
      <Card>
        <CardContent className="flex items-center justify-between pt-5">
          <div>
            <div className="text-sm font-semibold text-oxford">Addepar</div>
            <div className="text-xs text-slate-500">
              {mappedAccounts} mapped account{mappedAccounts === 1 ? "" : "s"}
            </div>
          </div>
          {addeparConfigured ? (
            syncFailed ? (
              <Badge variant="alert">Sync failed</Badge>
            ) : (
              <Badge variant="success">
                <span className="h-1.5 w-1.5 rounded-full bg-verde" />
                Synced {minutesAgo(lastSync?.finished_at) ?? "never"}
              </Badge>
            )
          ) : (
            <Badge>Not configured</Badge>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center justify-between pt-5">
          <div>
            <div className="text-sm font-semibold text-oxford">Website Intake</div>
            <div className="text-xs text-slate-500">Signed webhook, Phase 2</div>
          </div>
          <Badge>Not configured</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 pt-5">
          {healthy ? (
            <Badge variant="success">
              <span className="h-1.5 w-1.5 rounded-full bg-verde" /> All systems operational
            </Badge>
          ) : (
            <Badge variant="alert">Attention required</Badge>
          )}
          <Link href="/integrations" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View Integrations
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
