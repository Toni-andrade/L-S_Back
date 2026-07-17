import { formatCurrencyUS, formatPercentUS } from "@ls/domain";
import { Banknote, CalendarClock, Coins, TrendingDown, Wallet } from "lucide-react";
import Link from "next/link";
import { AiSnapshotPanel } from "@/components/ai-snapshot-panel";
import { PageHeader } from "@/components/shell/page-header";
import { WorkQueue } from "@/components/work-queue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aiConfigured } from "@/lib/ai";
import { generateAdvisorDaily } from "@/lib/actions/ai-snapshots";
import { requireUser, userSeesAll } from "@/lib/auth";
import { advisorCenter, aiSnapshotCached, incomeRollup, workQueue } from "@/lib/data";

const CUSTODIAN_LABEL: Record<string, string> = {
  ibkr: "IBKR",
  morgan_stanley: "Morgan Stanley",
  other: "Other",
};

function SectionCard({
  title,
  icon: Icon,
  count,
  empty,
  children,
}: {
  title: string;
  icon: typeof Coins;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-royal" /> {title}
          {count > 0 ? (
            <span className="ml-auto rounded-full bg-app-bg px-2 py-0.5 text-xs font-normal text-slate-500">
              {count}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? <p className="py-2 text-sm text-slate-400">{empty}</p> : children}
      </CardContent>
    </Card>
  );
}

export default async function AdvisorCenterPage() {
  const user = await requireUser();
  const [center, queue, income, dailyBrief] = await Promise.all([
    advisorCenter(),
    workQueue(user),
    incomeRollup(),
    aiConfigured() ? aiSnapshotCached("advisor_daily", user.id) : Promise.resolve(null),
  ]);
  const firmwide = userSeesAll(user);

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user.name || user.email}`}
        subtitle={`${dateStr} · your book at a glance${center.snapshotAsOf ? ` · data as of ${center.snapshotAsOf}` : ""}`}
      />

      {aiConfigured() ? (
        <div className="mb-6">
          <AiSnapshotPanel
            title="Briefing do dia (AI)"
            description="Your book this morning: what moved, what needs attention, the day's agenda, and cited market context from the last 24 hours. Cached for the day; regenerate anytime."
            initial={dailyBrief}
            action={generateAdvisorDaily}
          />
        </div>
      ) : null}

      {/* Actions needed first */}
      <div className="mb-6">
        <WorkQueue
          title="Actions needed"
          subtitle="Reviews due, compliance flags, follow-ups and notable moves across your clients."
          items={queue.clientActions}
          emptyText="You're all caught up."
          limit={8}
        />
      </div>

      {/* Projected income: per-client, rolled up to the book (firm for admin/ops) */}
      {income && income.total > 0 ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Projected annual income", value: formatCurrencyUS(income.total) },
              { label: "Est. monthly income", value: formatCurrencyUS(income.monthly) },
              {
                label: firmwide ? "Firm yield" : "Book yield",
                value: income.yield === null ? "—" : formatPercentUS(income.yield * 100, 2),
              },
            ].map((k) => (
              <div key={k.label} className="rounded-card border border-hairline bg-white px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
                  <Coins className="h-3.5 w-3.5 text-royal" /> {k.label}
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-oxford">{k.value}</div>
              </div>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Coins className="h-4 w-4 text-royal" /> Income by client
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-hairline text-sm">
                {income.byClient.slice(0, 6).map((c) => (
                  <li key={c.clientId} className="flex items-center justify-between gap-3 py-1.5">
                    <Link
                      href={`/clients/${c.clientId}`}
                      className="truncate text-royal hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="flex items-baseline gap-2 whitespace-nowrap">
                      <span className="tabular-nums text-oxford">{formatCurrencyUS(c.income)}</span>
                      <span className="tabular-nums text-xs text-slate-400">
                        {c.yield === null ? "—" : formatPercentUS(c.yield * 100, 1)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cash to deploy */}
        <SectionCard
          title="Cash to deploy"
          icon={Coins}
          count={center.agingCash.length}
          empty="No clients with material idle cash."
        >
          <ul className="flex flex-col divide-y divide-hairline text-sm">
            {center.agingCash.map((c) => (
              <li key={c.clientId} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/clients/${c.clientId}`} className="truncate text-royal hover:underline">
                  {c.name}
                </Link>
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="tabular-nums text-oxford">{formatCurrencyUS(c.cash)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
                      c.pct >= 0.1 ? "bg-alert/10 text-alert" : "bg-marrom/10 text-marrom"
                    }`}
                  >
                    {(c.pct * 100).toFixed(0)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* New deposits this week */}
        <SectionCard
          title="New deposits (this week)"
          icon={Banknote}
          count={center.newDeposits.length}
          empty="No deposits in the last 7 days."
        >
          <ul className="flex flex-col divide-y divide-hairline text-sm">
            {center.newDeposits.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-oxford">{d.name}</span>
                  <span className="text-xs text-slate-400">
                    {d.trade_date} · {CUSTODIAN_LABEL[d.custodian] ?? d.custodian}
                  </span>
                </span>
                <span className="whitespace-nowrap tabular-nums text-verde">
                  {formatCurrencyUS(d.amount)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* New account openings */}
        <SectionCard
          title="New accounts (30 days)"
          icon={Wallet}
          count={center.newAccounts.length + center.openings.length}
          empty="No new accounts or openings in progress."
        >
          <ul className="flex flex-col divide-y divide-hairline text-sm">
            {center.openings.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/workflows/${o.id}`} className="truncate text-royal hover:underline">
                  {o.title}
                </Link>
                <span className="whitespace-nowrap rounded bg-celeste/10 px-1.5 py-0.5 text-xs text-royal">
                  {o.status.replace("_", " ")}
                </span>
              </li>
            ))}
            {center.newAccounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-oxford">{a.name}</span>
                  <span className="font-mono text-xs text-slate-400">
                    {a.masked} · {CUSTODIAN_LABEL[a.custodian] ?? a.custodian}
                  </span>
                </span>
                <span className="whitespace-nowrap text-xs text-slate-400">
                  {new Date(a.created).toLocaleDateString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* Next redemptions */}
        <SectionCard
          title="Next redemptions (180 days)"
          icon={CalendarClock}
          count={center.redemptions.length}
          empty="No bond maturities in the next 180 days."
        >
          <div className="overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {center.redemptions.map((r, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    <td className="py-2 pr-2">
                      <Link href={`/clients/${r.clientId}`} className="text-royal hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="max-w-[180px] truncate py-2 pr-2 text-oxford" title={r.description ?? ""}>
                      {r.symbol ? (
                        <span className="font-mono text-xs text-slate-500">{r.symbol} </span>
                      ) : null}
                      {r.description ?? "—"}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-right text-xs tabular-nums text-slate-400">
                      {r.maturityDate}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums text-oxford">
                      {formatCurrencyUS(r.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* Ops-desk pointer for firmwide roles */}
      {queue.opsQueue.length > 0 ? (
        <div className="mt-6">
          <WorkQueue
            title="Operations desk"
            subtitle="Unassigned/breaching tickets, intake triage and data-quality items."
            items={queue.opsQueue}
            emptyText="Operations desk is clear."
            limit={8}
          />
        </div>
      ) : null}

      {center.agingCash.length === 0 &&
      center.newDeposits.length === 0 &&
      center.redemptions.length === 0 &&
      center.newAccounts.length === 0 &&
      queue.clientActions.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 rounded-card border border-hairline bg-white p-4 text-sm text-slate-500">
          <TrendingDown className="h-4 w-4 text-slate-300" />
          Nothing pressing right now. Insights populate as portfolios sync and clients are imported.
        </div>
      ) : null}
    </div>
  );
}
