/**
 * Fixed-income analytics: bucket bond holdings by time to maturity and compute
 * market-value-weighted average coupon and duration per bucket. Pure and
 * deterministic; the caller supplies the holdings and "today".
 */

export type FiHolding = {
  marketValue: number;
  maturityDate: string | null;
  couponRate: number | null; // fraction, e.g. 0.047
  modifiedDuration: number | null;
};

export type FiBucket = {
  key: string;
  label: string;
  marketValue: number;
  weight: number; // of the FI sleeve
  avgCoupon: number | null; // MV-weighted, fraction
  avgDuration: number | null; // MV-weighted
  count: number;
};

const BUCKETS: { key: string; label: string; maxYears: number }[] = [
  { key: "0-1", label: "0 to 1 yr", maxYears: 1 },
  { key: "1-3", label: "1 to 3 yr", maxYears: 3 },
  { key: "3-5", label: "3 to 5 yr", maxYears: 5 },
  { key: "5-10", label: "5 to 10 yr", maxYears: 10 },
  { key: "10+", label: "10 yr +", maxYears: Infinity },
];

function yearsTo(maturity: string, today: Date): number {
  return (new Date(maturity).getTime() - today.getTime()) / (365.25 * 86_400_000);
}

/** Bucket FI holdings (those with a maturity date) by time to maturity. */
export function fixedIncomeBuckets(holdings: FiHolding[], today: Date = new Date()): FiBucket[] {
  const bonds = holdings.filter((h) => h.maturityDate && h.marketValue > 0);
  const totalMv = bonds.reduce((s, h) => s + h.marketValue, 0);

  return BUCKETS.map((b, i) => {
    const min = i === 0 ? -Infinity : BUCKETS[i - 1]!.maxYears;
    const inBucket = bonds.filter((h) => {
      const y = yearsTo(h.maturityDate!, today);
      return y > min && y <= b.maxYears;
    });
    const mv = inBucket.reduce((s, h) => s + h.marketValue, 0);
    const wSum = (pick: (h: FiHolding) => number | null) => {
      let num = 0;
      let den = 0;
      for (const h of inBucket) {
        const v = pick(h);
        if (v !== null) {
          num += v * h.marketValue;
          den += h.marketValue;
        }
      }
      return den > 0 ? num / den : null;
    };
    return {
      key: b.key,
      label: b.label,
      marketValue: mv,
      weight: totalMv > 0 ? mv / totalMv : 0,
      avgCoupon: wSum((h) => h.couponRate),
      avgDuration: wSum((h) => h.modifiedDuration),
      count: inBucket.length,
    };
  }).filter((b) => b.count > 0);
}

/** Portfolio-level MV-weighted coupon and duration across all bonds. */
export function fixedIncomeSummary(holdings: FiHolding[]): {
  totalMv: number;
  avgCoupon: number | null;
  avgDuration: number | null;
  count: number;
} {
  const bonds = holdings.filter((h) => h.maturityDate && h.marketValue > 0);
  const totalMv = bonds.reduce((s, h) => s + h.marketValue, 0);
  const w = (pick: (h: FiHolding) => number | null) => {
    let num = 0;
    let den = 0;
    for (const h of bonds) {
      const v = pick(h);
      if (v !== null) {
        num += v * h.marketValue;
        den += h.marketValue;
      }
    }
    return den > 0 ? num / den : null;
  };
  return {
    totalMv,
    avgCoupon: w((h) => h.couponRate),
    avgDuration: w((h) => h.modifiedDuration),
    count: bonds.length,
  };
}
