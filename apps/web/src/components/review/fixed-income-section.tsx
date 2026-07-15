import {
  fixedIncomeBuckets,
  fixedIncomeSummary,
  formatCurrencyUS,
  formatPercentUS,
  type FiHolding,
} from "@ls/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FiRow = FiHolding & { description: string | null; symbol: string | null };
type Deposit = {
  id: string;
  trade_date: string;
  amount: number;
  custodian: string;
  accountMasked: string;
};

const CUSTODIAN_LABEL: Record<string, string> = {
  ibkr: "IBKR",
  morgan_stanley: "Morgan Stanley",
  other: "Other",
};

export function FixedIncomeSection({
  holdings,
  deposits,
}: {
  holdings: FiRow[];
  deposits: Deposit[];
}) {
  const bonds = holdings.filter((h) => h.maturityDate && h.marketValue > 0);
  if (bonds.length === 0 && deposits.length === 0) return null;

  const buckets = fixedIncomeBuckets(bonds);
  const summary = fixedIncomeSummary(bonds);
  const nextRedemptions = [...bonds]
    .sort((a, b) => (a.maturityDate ?? "").localeCompare(b.maturityDate ?? ""))
    .slice(0, 8);

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Fixed Income</span>
          {summary.count > 0 ? (
            <span className="text-xs font-normal text-slate-400">
              {formatCurrencyUS(summary.totalMv)} · {summary.count} bonds ·{" "}
              {summary.avgCoupon !== null ? `${formatPercentBRcoupon(summary.avgCoupon)} avg coupon` : "—"}
              {summary.avgDuration !== null ? ` · ${summary.avgDuration.toFixed(1)} avg duration` : ""}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {/* Maturity breakdown */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Maturity breakdown
          </div>
          {buckets.length === 0 ? (
            <p className="text-sm text-slate-400">No bonds with maturity data.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 font-medium">Bucket</th>
                  <th className="py-1.5 text-right font-medium">Value</th>
                  <th className="py-1.5 text-right font-medium">%</th>
                  <th className="py-1.5 text-right font-medium">Coupon</th>
                  <th className="py-1.5 text-right font-medium">Dur.</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.key} className="border-b border-hairline last:border-0">
                    <td className="py-1.5 text-oxford">{b.label}</td>
                    <td className="py-1.5 text-right tabular-nums text-oxford">
                      {formatCurrencyUS(b.marketValue)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {(b.weight * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {b.avgCoupon !== null ? formatPercentBRcoupon(b.avgCoupon) : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {b.avgDuration !== null ? b.avgDuration.toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Next redemptions + recent deposits */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Next redemptions
            </div>
            {nextRedemptions.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming maturities.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline text-sm">
                {nextRedemptions.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-oxford">
                      {h.symbol ? <span className="font-mono text-xs text-slate-500">{h.symbol} </span> : null}
                      {h.description ?? "—"}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{h.maturityDate}</span>
                    <span className="w-24 shrink-0 text-right tabular-nums text-oxford">
                      {formatCurrencyUS(h.marketValue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recent deposits
            </div>
            {deposits.length === 0 ? (
              <p className="text-sm text-slate-400">No recent deposits.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline text-sm">
                {deposits.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-slate-400">{d.trade_date}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                      {CUSTODIAN_LABEL[d.custodian] ?? d.custodian}
                      {d.accountMasked ? ` · ${d.accountMasked}` : ""}
                    </span>
                    <span className="shrink-0 text-right tabular-nums text-verde">
                      {formatCurrencyUS(d.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Coupon is a fraction; show as a percent with comma-free en-US style. */
function formatPercentBRcoupon(fraction: number): string {
  return formatPercentUS(fraction * 100, 2);
}
