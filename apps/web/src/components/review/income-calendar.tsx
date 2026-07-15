import {
  formatCurrencyUS,
  formatPercentUS,
  incomeContributors,
  incomeSchedule,
  incomeSummary,
  upcomingPayments,
  type IncomeHolding,
} from "@ls/domain";
import { CalendarClock, Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Coupon / yield values arrive as fractions (0.031 -> 3.10%). */
const pct = (fraction: number | null, dp = 2) =>
  fraction === null ? "—" : formatPercentUS(fraction * 100, dp);

export function IncomeCalendarSection({ holdings }: { holdings: IncomeHolding[] }) {
  const summary = incomeSummary(holdings);
  if (summary.projectedAnnual <= 0) return null;

  const schedule = incomeSchedule(holdings, 12);
  const contributors = incomeContributors(holdings, 10);
  const upcoming = upcomingPayments(holdings);
  const maxMonth = Math.max(...schedule.map((m) => m.amount), 1);

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-royal" /> Income Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Projected annual income", value: formatCurrencyUS(summary.projectedAnnual) },
            { label: "Portfolio yield", value: pct(summary.yield) },
            { label: "From dividends", value: formatCurrencyUS(summary.fromDividends) },
            { label: "From interest", value: formatCurrencyUS(summary.fromInterest) },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-hairline px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{k.label}</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums text-oxford">{k.value}</div>
            </div>
          ))}
        </div>
        {summary.fromInterest > 0 ? (
          <p className="-mt-3 text-[11px] text-slate-400">
            Interest is estimated from coupon rate on market value where Addepar does not provide a
            projected figure.
          </p>
        ) : null}

        {/* Forward 12-month estimated schedule */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Estimated monthly income (next 12 months)
            </div>
            <div className="text-[11px] text-slate-400">
              Estimated · evenly distributed from projected annual income
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {schedule.map((m) => (
              <div
                key={m.key}
                className="overflow-hidden rounded-lg border border-hairline"
                title={`${m.label}: ${formatCurrencyUS(m.amount)}`}
              >
                <div className="border-b border-hairline bg-app-bg/60 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {m.label}
                </div>
                <div className="px-2 py-2">
                  <div className="tabular-nums text-sm font-semibold text-oxford">
                    {formatCurrencyUS(m.amount)}
                  </div>
                  <div className="mt-1.5 h-1 w-full rounded-full bg-app-bg">
                    <div
                      className="h-1 rounded-full bg-royal/60"
                      style={{ width: `${Math.max(6, (m.amount / maxMonth) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top income contributors */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Top income contributors
            </div>
            <div className="overflow-hidden rounded-lg border border-hairline">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-app-bg/60 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-1.5 font-medium">Symbol</th>
                    <th className="px-3 py-1.5 font-medium">Security</th>
                    <th className="px-3 py-1.5 text-right font-medium">Annual</th>
                    <th className="px-3 py-1.5 text-right font-medium">Yield</th>
                  </tr>
                </thead>
                <tbody>
                  {contributors.map((c, i) => (
                    <tr key={i} className="border-b border-hairline last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-slate-500">
                        {c.symbol ?? "—"}
                      </td>
                      <td
                        className="max-w-[200px] truncate px-3 py-1.5 text-oxford"
                        title={c.description ?? ""}
                      >
                        {c.source === "interest" ? (
                          <span className="mr-1 rounded bg-celeste/10 px-1 py-0.5 text-[10px] uppercase text-royal">
                            coupon
                          </span>
                        ) : null}
                        {c.description ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-oxford">
                        {formatCurrencyUS(c.annual)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500">
                        {pct(c.yield)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upcoming ex-dividend dates (only when the license exposes them) */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Upcoming ex-dividend dates
            </div>
            {upcoming.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-3 text-sm text-slate-400">
                <CalendarClock className="h-4 w-4 text-slate-300" />
                No dated payments in the next 90 days. Monthly figures above are estimates from
                projected annual income.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-hairline">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline bg-app-bg/60 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-1.5 font-medium">Ex-date</th>
                      <th className="px-3 py-1.5 font-medium">Security</th>
                      <th className="px-3 py-1.5 text-right font-medium">Est. amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.slice(0, 8).map((p, i) => (
                      <tr key={i} className="border-b border-hairline last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-400">
                          {p.exDate}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-3 py-1.5 text-oxford"
                          title={p.description ?? ""}
                        >
                          {p.symbol ? (
                            <span className="mr-1 font-mono text-xs text-slate-500">{p.symbol}</span>
                          ) : null}
                          {p.description ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-verde">
                          {formatCurrencyUS(p.estimatedAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
