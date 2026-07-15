/**
 * Income analytics: projected annual income (dividends + coupons), portfolio
 * yield, income split by source, top contributors, and a forward income
 * schedule. Addepar's projected_annual_income is per unit, so annual income is
 * incomePerUnit * quantity. Exact per-payment dates are frequently unavailable
 * under the firm license, so the forward schedule is an evenly distributed
 * ESTIMATE (expected average monthly income) and is labeled as such in the UI.
 * Pure and deterministic; the caller supplies the holdings and "today".
 */

export type IncomeHolding = {
  marketValue: number;
  quantity: number | null;
  incomePerUnit: number | null; // Addepar projected_annual_income, per unit
  frequency: number | null; // dividends_per_year
  nextExDate: string | null; // may be null
  maturityDate: string | null; // present => fixed income (coupon), else dividend
  couponRate: number | null; // fraction, e.g. 0.047; used to estimate coupon income
  assetClass: string | null;
  symbol: string | null;
  description: string | null;
};

/**
 * Projected annual income for a single holding (0 when unknown). Prefers
 * Addepar's projected_annual_income (per unit x quantity). Falls back to an
 * estimated coupon income (coupon_rate x market value) for bonds where the firm
 * license does not populate a projected figure - market value is a proxy for
 * face; the interest total is labeled "estimated" in the UI.
 */
export function annualIncome(h: IncomeHolding): number {
  if (h.incomePerUnit != null && h.quantity != null) {
    const v = h.incomePerUnit * h.quantity;
    if (Number.isFinite(v) && v > 0) return v;
  }
  if (h.maturityDate && h.couponRate != null) {
    const v = h.couponRate * h.marketValue;
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

export type IncomeSummary = {
  totalMv: number;
  projectedAnnual: number;
  yield: number | null; // projectedAnnual / totalMv, fraction
  fromDividends: number; // equities / funds
  fromInterest: number; // fixed income (has maturity)
  incomeHoldings: number; // count of positions producing income
};

export function incomeSummary(holdings: IncomeHolding[]): IncomeSummary {
  let totalMv = 0;
  let projectedAnnual = 0;
  let fromDividends = 0;
  let fromInterest = 0;
  let incomeHoldings = 0;
  for (const h of holdings) {
    totalMv += h.marketValue;
    const inc = annualIncome(h);
    if (inc <= 0) continue;
    projectedAnnual += inc;
    incomeHoldings += 1;
    if (h.maturityDate) fromInterest += inc;
    else fromDividends += inc;
  }
  return {
    totalMv,
    projectedAnnual,
    yield: totalMv > 0 ? projectedAnnual / totalMv : null,
    fromDividends,
    fromInterest,
    incomeHoldings,
  };
}

export type IncomeContributor = {
  symbol: string | null;
  description: string | null;
  source: "dividend" | "interest";
  annual: number;
  yield: number | null; // income / marketValue, fraction
};

/** Positions ranked by projected annual income, descending. */
export function incomeContributors(holdings: IncomeHolding[], limit = 10): IncomeContributor[] {
  return holdings
    .map((h) => {
      const annual = annualIncome(h);
      return {
        symbol: h.symbol,
        description: h.description,
        source: (h.maturityDate ? "interest" : "dividend") as "dividend" | "interest",
        annual,
        yield: h.marketValue > 0 ? annual / h.marketValue : null,
      };
    })
    .filter((c) => c.annual > 0)
    .sort((a, b) => b.annual - a.annual)
    .slice(0, limit);
}

export type IncomeMonth = {
  key: string; // YYYY-MM
  label: string; // e.g. "Aug 26"
  amount: number; // estimated income for the month
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Forward income schedule: the projected annual income spread evenly across the
 * next `months` months (expected average monthly income). Even distribution is
 * used deliberately - exact ex-dividend / coupon dates are not reliably
 * available, so a smooth estimate that ties out to the annual figure is the
 * honest representation. Sum of the returned amounts over 12 months equals the
 * projected annual income.
 */
export function incomeSchedule(
  holdings: IncomeHolding[],
  months = 12,
  today: Date = new Date(),
): IncomeMonth[] {
  const perMonth = incomeSummary(holdings).projectedAnnual / 12;
  const out: IncomeMonth[] = [];
  const year = today.getUTCFullYear();
  const month0 = today.getUTCMonth();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(year, month0 + i, 1));
    const m = d.getUTCMonth();
    const key = `${d.getUTCFullYear()}-${String(m + 1).padStart(2, "0")}`;
    out.push({
      key,
      label: `${MONTH_LABELS[m]} ${String(d.getUTCFullYear()).slice(2)}`,
      amount: perMonth,
    });
  }
  return out;
}

export type UpcomingPayment = {
  symbol: string | null;
  description: string | null;
  exDate: string;
  estimatedAmount: number; // per-payment estimate = annual / frequency
};

/**
 * Positions with a known next ex-dividend date inside the forward window, with a
 * per-payment estimate. Empty when the firm license does not expose ex dates -
 * the UI hides the section in that case.
 */
export function upcomingPayments(
  holdings: IncomeHolding[],
  today: Date = new Date(),
  horizonDays = 90,
): UpcomingPayment[] {
  const todayStr = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + horizonDays * 86_400_000).toISOString().slice(0, 10);
  return holdings
    .filter((h) => h.nextExDate && h.nextExDate >= todayStr && h.nextExDate <= horizon)
    .map((h) => {
      const annual = annualIncome(h);
      const freq = h.frequency && h.frequency > 0 ? h.frequency : 1;
      return {
        symbol: h.symbol,
        description: h.description,
        exDate: h.nextExDate as string,
        estimatedAmount: annual / freq,
      };
    })
    .filter((p) => p.estimatedAmount > 0)
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
}
