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

/** Coupon / return values arrive as fractions (0.047 -> 4.70%). */
const pct = (fraction: number | null, dp = 2) =>
  fraction === null ? "—" : formatPercentUS(fraction * 100, dp);

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
        <CardTitle>Fixed Income</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Summary strip */}
        {summary.count > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Market value", value: formatCurrencyUS(summary.totalMv) },
              { label: "Bonds", value: String(summary.count) },
              { label: "Avg coupon", value: pct(summary.avgCoupon) },
              {
                label: "Avg duration",
                value: summary.avgDuration !== null ? `${summary.avgDuration.toFixed(1)} yr` : "—",
              },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-hairline px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">{k.label}</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums text-oxford">{k.value}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Maturity breakdown */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Maturity ladder
            </div>
            {buckets.length === 0 ? (
              <p className="text-sm text-slate-400">No bonds with maturity data.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-hairline">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline bg-app-bg/60 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-1.5 font-medium">Bucket</th>
                      <th className="px-3 py-1.5 text-right font-medium">Value</th>
                      <th className="px-3 py-1.5 text-right font-medium">Weight</th>
                      <th className="px-3 py-1.5 text-right font-medium">Coupon</th>
                      <th className="px-3 py-1.5 text-right font-medium">Dur.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((b) => (
                      <tr key={b.key} className="border-b border-hairline last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5 text-oxford">{b.label}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-oxford">
                          {formatCurrencyUS(b.marketValue)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {(b.weight * 100).toFixed(0)}%
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {pct(b.avgCoupon)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {b.avgDuration !== null ? b.avgDuration.toFixed(1) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Next redemptions + recent deposits */}
          <div className="flex flex-col gap-5">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Next redemptions
              </div>
              {nextRedemptions.length === 0 ? (
                <p className="text-sm text-slate-400">No upcoming maturities.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-hairline">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-hairline bg-app-bg/60 text-left text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-1.5 font-medium">Symbol</th>
                        <th className="px-3 py-1.5 font-medium">Security</th>
                        <th className="px-3 py-1.5 text-right font-medium">Maturity</th>
                        <th className="px-3 py-1.5 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nextRedemptions.map((h, i) => (
                        <tr key={i} className="border-b border-hairline last:border-0">
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-slate-500">
                            {h.symbol ?? "—"}
                          </td>
                          <td
                            className="max-w-[220px] truncate px-3 py-1.5 text-oxford"
                            title={h.description ?? ""}
                          >
                            {h.description ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-400">
                            {h.maturityDate}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-oxford">
                            {formatCurrencyUS(h.marketValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Recent deposits
              </div>
              {deposits.length === 0 ? (
                <p className="text-sm text-slate-400">No recent deposits.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-hairline">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-hairline bg-app-bg/60 text-left text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-1.5 font-medium">Date</th>
                        <th className="px-3 py-1.5 font-medium">Account</th>
                        <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deposits.slice(0, 6).map((d) => (
                        <tr key={d.id} className="border-b border-hairline last:border-0">
                          <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-400">
                            {d.trade_date}
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-1.5 text-xs text-slate-500">
                            {CUSTODIAN_LABEL[d.custodian] ?? d.custodian}
                            {d.accountMasked ? ` · ${d.accountMasked}` : ""}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-verde">
                            {formatCurrencyUS(d.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
