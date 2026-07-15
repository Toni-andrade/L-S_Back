import {
  computePortfolioChanges,
  computeRealizedStats,
  computeRiskScore,
  formatCurrencyUS,
  formatPercentUS,
} from "@ls/domain";
import { ArrowDownRight, ArrowUpRight, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AllocationDonut } from "@/components/charts/allocation-donut";
import { RiskGauge } from "@/components/charts/risk-gauge";
import { TwrLine } from "@/components/charts/twr-line";
import { assessClientSla } from "@ls/domain";
import { ActionRail } from "@/components/review/action-rail";
import { ActivitySummaryCard } from "@/components/review/activity-summary";
import { HoldingsTable } from "@/components/review/holdings-table";
import { ClientRelationship } from "@/components/contacts/client-relationship";
import { FeedsStrip } from "@/components/review/feeds-strip";
import { FlagsPanel } from "@/components/review/flags-panel";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import {
  activityForScope,
  addeparConfigured,
  contactsForClient,
  flagsForScope,
  holdingsForScope,
  lastReview,
  lastSyncJob,
  lastTouchForClient,
  latestSnapshot,
  oldestOpenBlockerForClient,
  performanceSeries,
  riskFactors,
  slaPolicies,
  snapshotByDate,
  snapshotDates,
  transactionsForScope,
  type Scope,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ scope: string; id: string }>;
  searchParams: Promise<{ asOf?: string; period?: string }>;
}) {
  await requireUser();
  const { scope: scopeParam, id } = await params;
  const { asOf, period: periodParam } = await searchParams;
  if (scopeParam !== "household" && scopeParam !== "client") notFound();
  const scope = scopeParam as Scope;
  const period = periodParam === "one_year" ? "one_year" : "ytd";

  const supabase = await createClient();
  const entity =
    scope === "household"
      ? (await supabase.from("households").select("id, name").eq("id", id).maybeSingle()).data
      : (await supabase.from("clients").select("id, name, risk_profile").eq("id", id).maybeSingle())
          .data;
  if (!entity) notFound();

  const snapshot = asOf ? await snapshotByDate(asOf) : await latestSnapshot();
  const [holdings, factors, flags, review, sync, perf, perfOneYear, dates, accountsCount] =
    await Promise.all([
    snapshot ? holdingsForScope(scope, id, snapshot.id) : Promise.resolve([]),
    riskFactors(),
    flagsForScope(scope, id),
    lastReview(scope, id),
    lastSyncJob(),
    performanceSeries(scope, id, period),
    performanceSeries(scope, id, "one_year"),
    snapshotDates(),
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .not("addepar_entity_id", "is", null)
      .then((r) => r.count ?? 0),
  ]);

  const totalMv = holdings.reduce((s, h) => s + h.market_value, 0);
  const byClass = new Map<string, number>();
  for (const h of holdings) {
    const key = h.asset_class ?? "Unclassified";
    byClass.set(key, (byClass.get(key) ?? 0) + h.market_value);
  }
  const allocation = [...byClass.entries()]
    .map(([assetClass, marketValue]) => ({ assetClass, marketValue }))
    .sort((a, b) => b.marketValue - a.marketValue);

  // Realized stats from the trailing-1Y TWR series (Phase 4); shown only with
  // enough observations. Never computed from assumptions.
  const realized = computeRealizedStats(
    perfOneYear.map((p) => ({ asOf: p.as_of, cumulative: p.twr })),
  );

  const risk = computeRiskScore(
    holdings.map((h) => ({
      symbol: h.symbol,
      description: h.description,
      assetClass: h.asset_class,
      marketValue: h.market_value,
    })),
    factors,
  );
  const assignedProfile =
    scope === "client" ? ((entity as { risk_profile?: string | null }).risk_profile ?? null) : null;

  const twrUnavailable = Boolean(
    (sync?.stats as Record<string, unknown> | null)?.twr_unavailable,
  );

  // Portfolio Changes window: since last review, fallback trailing 30 days
  const windowStart = review?.reviewed_at
    ? new Date(review.reviewed_at)
    : new Date(Date.now() - 30 * 86_400_000);
  const windowStartDate = windowStart.toISOString().slice(0, 10);
  const { data: startSnap } = await supabase
    .from("snapshots")
    .select("id, as_of")
    .lte("as_of", windowStartDate)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startHoldings = startSnap ? await holdingsForScope(scope, id, startSnap.id) : [];
  const startMv = startHoldings.reduce((s, h) => s + h.market_value, 0);
  const windowTxns = await transactionsForScope(scope, id, { sinceDate: windowStartDate });
  const changes = startSnap ? computePortfolioChanges(startMv, totalMv, windowTxns) : null;

  const activity = await activityForScope(scope, id, "trailing_30d");

  // Client relationship: contacts timeline + SLA (client scope only)
  let relationship: {
    assessments: ReturnType<typeof assessClientSla>;
    contacts: Awaited<ReturnType<typeof contactsForClient>>;
    userName: Map<string, string>;
  } | null = null;
  if (scope === "client") {
    const [contacts, policies, lastTouchAt, oldestOpenBlockerAt, { data: users }] =
      await Promise.all([
        contactsForClient(id),
        slaPolicies(),
        lastTouchForClient(id),
        oldestOpenBlockerForClient(id),
        supabase.from("users").select("id, name, email"),
      ]);
    const assessments = assessClientSla(
      {
        riskProfile: (entity as { risk_profile?: "conservador" | "moderado" | "agressivo" | null })
          .risk_profile ?? null,
        lastTouchAt,
        activatedAt: null,
        oldestOpenBlockerAt,
      },
      policies,
    );
    relationship = {
      assessments,
      contacts,
      userName: new Map((users ?? []).map((u) => [u.id, u.name || u.email])),
    };
  }

  const recentTxns = await transactionsForScope(scope, id, { limit: 8 });
  const cashMv = holdings
    .filter((h) => h.asset_class === "Cash & equivalents")
    .reduce((s, h) => s + h.market_value, 0);


  return (
    <div>
      <PageHeader
        title={entity.name}
        subtitle={`${scope === "household" ? "Household" : "Client"} portfolio review${snapshot ? `, as of ${snapshot.as_of}` : ""}`}
      />

      {twrUnavailable ? (
        <div className="mb-4 rounded-card border border-alert/30 bg-alert/5 px-4 py-3 text-sm text-alert">
          Performance data is unavailable under the current Addepar license (403 on TWR
          attributes). The Performance card and return columns are hidden; everything else is live.
        </div>
      ) : null}

      <FeedsStrip
        addeparConfigured={addeparConfigured()}
        mappedAccounts={accountsCount}
        lastSync={sync ? { status: sync.status, finished_at: sync.finished_at, error: sync.error } : null}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Snapshot:</span>
          {dates.slice(0, 6).map((d) => (
            <Link
              key={d}
              href={`/portfolio-review/${scope}/${id}?asOf=${d}&period=${period}`}
              className={
                snapshot?.as_of === d
                  ? "rounded-md bg-celeste/10 px-2 py-1 font-medium text-royal"
                  : "rounded-md px-2 py-1 text-slate-500 hover:text-oxford"
              }
            >
              {d}
            </Link>
          ))}
        </div>
        {snapshot ? (
          <a
            href={`/api/export/positions?scope=${scope}&id=${id}&asOf=${snapshot.as_of}`}
            className="flex items-center gap-1.5 text-sm font-medium text-royal hover:underline"
          >
            <Download className="h-4 w-4" /> Positions CSV
          </a>
        ) : null}
      </div>

      {activity ? (
        <ActivitySummaryCard metrics={activity.metrics} movers={activity.movers} period="trailing_30d" />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Asset Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              {allocation.length > 0 ? (
                <AllocationDonut data={allocation} totalMv={totalMv} />
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  No holdings in this snapshot.
                </p>
              )}
            </CardContent>
          </Card>

          {!twrUnavailable ? (
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Performance (Total Return)</CardTitle>
                  <div className="flex gap-1 text-xs">
                    {(["ytd", "one_year"] as const).map((p) => (
                      <Link
                        key={p}
                        href={`/portfolio-review/${scope}/${id}?period=${p}${snapshot ? `&asOf=${snapshot.as_of}` : ""}`}
                        className={
                          period === p
                            ? "rounded-md bg-celeste/10 px-2 py-1 font-medium text-royal"
                            : "rounded-md px-2 py-1 text-slate-500 hover:text-oxford"
                        }
                      >
                        {p === "ytd" ? "YTD" : "1Y"}
                      </Link>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {perf.length > 0 ? (
                  <TwrLine data={perf} />
                ) : (
                  <p className="py-8 text-center text-sm text-slate-400">
                    No TWR series yet. Benchmark overlay ships when the benchmark definition is
                    confirmed (Open Item 6).
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Risk Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {risk ? (
                <div className="flex flex-col items-center gap-2">
                  <RiskGauge score={risk.score} />
                  <Badge variant={risk.band === "agressivo" ? "alert" : risk.band === "moderado" ? "celeste" : "success"}>
                    {risk.band}
                  </Badge>
                  <p
                    className="text-xs text-slate-500"
                    title="Simplified, correlations not modeled; MV-weighted upper bound"
                  >
                    Expected volatility ≈ {formatPercentUS(risk.expectedVol, 1)} (simplified,
                    correlations not modeled)
                  </p>
                  {realized ? (
                    <p className="text-xs text-slate-500">
                      Realized (1Y, {realized.observations} obs): vol{" "}
                      {formatPercentUS(realized.annualizedVol * 100, 1)}
                      {realized.sharpe !== null
                        ? `, Sharpe ${realized.sharpe.toFixed(2)}`
                        : ""}
                    </p>
                  ) : null}
                  {assignedProfile ? (
                    <p className="text-xs text-slate-500">
                      Assigned profile: <span className="font-medium">{assignedProfile}</span>
                      {assignedProfile !== risk.band ? (
                        <span className="ml-1 text-alert">(mismatch)</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No holdings to score.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Balances</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-semibold tabular-nums text-oxford">{formatCurrencyUS(totalMv)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Invested</span>
                <span className="tabular-nums text-oxford">{formatCurrencyUS(totalMv - cashMv)}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-marrom" /> Cash
                </span>
                <span className="tabular-nums text-oxford">{formatCurrencyUS(cashMv)}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-marrom/50" /> Pending
                </span>
                <span className="tabular-nums text-oxford">{formatCurrencyUS(0)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">As of {snapshot?.as_of ?? "n/a"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Portfolio Changes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {changes ? (
                <>
                  <p className="mb-2 text-xs text-slate-400">
                    Since {review ? `last review (${windowStartDate})` : `${windowStartDate} (30-day fallback)`}
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">New Contributions</span>
                      <span className="tabular-nums text-verde">
                        +{formatCurrencyUS(changes.contributions)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Withdrawals</span>
                      <span className="tabular-nums text-alert">
                        -{formatCurrencyUS(changes.withdrawals)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Market Change</span>
                      <span className={`tabular-nums ${changes.marketChange >= 0 ? "text-verde" : "text-alert"}`}>
                        {changes.marketChange >= 0 ? "+" : ""}
                        {formatCurrencyUS(changes.marketChange)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-hairline pt-2 font-medium">
                      <span className="text-oxford">Net Change</span>
                      <span className={`tabular-nums ${changes.netChange >= 0 ? "text-verde" : "text-alert"}`}>
                        {changes.netChange >= 0 ? "+" : ""}
                        {formatCurrencyUS(changes.netChange)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="py-4 text-center text-slate-400">
                  Not enough snapshot history for this window yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Holdings</CardTitle>
            </CardHeader>
            <CardContent>
              {holdings.length > 0 ? (
                <HoldingsTable holdings={holdings} totalMv={totalMv} />
              ) : (
                <p className="py-4 text-center text-sm text-slate-400">
                  No holdings in this snapshot.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTxns.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No transactions yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline text-sm">
                  {recentTxns.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2">
                      {t.amount >= 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-verde" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-alert" />
                      )}
                      <span className="w-24 text-slate-400">{t.trade_date}</span>
                      <span className="w-28 capitalize text-slate-500">{t.activity}</span>
                      <span className="flex-1 truncate text-oxford">{t.description ?? t.symbol ?? ""}</span>
                      <span className={`tabular-nums ${t.amount >= 0 ? "text-verde" : "text-alert"}`}>
                        {formatCurrencyUS(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="md:col-span-2">
            <FlagsPanel flags={flags} />
          </div>

          {relationship ? (
            <div className="md:col-span-2">
              <ClientRelationship
                clientId={id}
                assessments={relationship.assessments}
                contacts={relationship.contacts}
                userName={relationship.userName}
              />
            </div>
          ) : null}

          <Card className="md:col-span-2">
            <CardContent className="pt-5 text-sm text-slate-400">
              Model vs. Current Allocation and Sleeve Exposures ship with the model library in
              Phase 3.
            </CardContent>
          </Card>
        </div>

        <ActionRail scope={scope} scopeId={id} addeparConfigured={addeparConfigured()} />
      </div>
    </div>
  );
}
