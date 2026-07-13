import { FileText, Inbox, Plug, Ticket } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name || user.email}`}
        subtitle="Firm overview. Feeds, sync status, flags and workload land in Phase 1."
      />

      {/* Connected feeds strip: real tiles activate when Addepar (Phase 1) and
          the website webhook (Phase 2) are wired. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <div className="text-sm font-semibold text-oxford">Addepar</div>
              <div className="text-xs text-slate-500">Nightly sync, Phase 1</div>
            </div>
            <Badge>Not configured</Badge>
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
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <div className="text-sm font-semibold text-oxford">System</div>
              <div className="text-xs text-slate-500">Auth and audit online</div>
            </div>
            <Badge variant="success">
              <span className="h-1.5 w-1.5 rounded-full bg-verde" /> Operational
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              icon: Plug,
              title: "Addepar sync",
              body: "Holdings, transactions and TWR series populate here after Phase 1. Failed syncs surface on this dashboard, never silently.",
            },
            {
              icon: Inbox,
              title: "Intake pipeline",
              body: "Prospect submissions from the firm website appear here once the signed webhook ships in Phase 2.",
            },
            {
              icon: Ticket,
              title: "Support tickets",
              body: "Ticket counts by priority, SLA breaches and saved views arrive with the tickets module in Phase 2.",
            },
            {
              icon: FileText,
              title: "Proposals",
              body: "Draft, in-review and approved proposal counts arrive with the proposal engine in Phase 3.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-royal" /> {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Link href="/clients" className={buttonVariants({ variant: "primary" })}>
                Review Portfolios
              </Link>
              <Link href="/tickets" className={buttonVariants({ variant: "outline" })}>
                Open Ticket
              </Link>
              <Link href="/proposals" className={buttonVariants({ variant: "outline" })}>
                Generate Proposal
              </Link>
              {user.role === "admin" ? (
                <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
                  Manage Users
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
