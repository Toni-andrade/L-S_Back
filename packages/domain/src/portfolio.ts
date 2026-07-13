/**
 * Risk score (Section 6.1) and Portfolio Changes math (Section 6).
 * Deterministic, no black box: MV-weighted averages over admin-editable
 * per-asset-class factors.
 */

export type HoldingLike = {
  clientId?: string;
  symbol: string | null;
  description: string | null;
  assetClass: string | null;
  marketValue: number;
};

export type RiskFactorLike = {
  assetClass: string;
  factor: number;
  volAssumption: number;
};

export const UNCLASSIFIED_ASSET_CLASS = "Unclassified";
export const CASH_ASSET_CLASS = "Cash & equivalents";

export type RiskProfileBand = "conservador" | "moderado" | "agressivo";

/** Bands are configurable; defaults per Section 6.1. */
export const RISK_BANDS = { conservadorMax: 35, moderadoMax: 65 } as const;

export function riskBand(
  score: number,
  bands: { conservadorMax: number; moderadoMax: number } = RISK_BANDS,
): RiskProfileBand {
  if (score <= bands.conservadorMax) return "conservador";
  if (score <= bands.moderadoMax) return "moderado";
  return "agressivo";
}

export type RiskScoreResult = {
  score: number;
  band: RiskProfileBand;
  /**
   * MV-weighted average of vol assumptions. Assumes perfect correlation and is
   * therefore an upper bound; label it "simplified, correlations not modeled".
   * Never present as a portfolio vol estimate in client-facing material.
   */
  expectedVol: number;
  totalMv: number;
  unclassifiedMv: number;
};

export function computeRiskScore(
  holdings: HoldingLike[],
  riskFactors: RiskFactorLike[],
): RiskScoreResult | null {
  const totalMv = holdings.reduce((s, h) => s + h.marketValue, 0);
  if (totalMv <= 0) return null;

  const byClass = new Map(riskFactors.map((f) => [f.assetClass, f]));
  const fallback = byClass.get(UNCLASSIFIED_ASSET_CLASS) ?? {
    assetClass: UNCLASSIFIED_ASSET_CLASS,
    factor: 50,
    volAssumption: 12,
  };

  let weightedFactor = 0;
  let weightedVol = 0;
  let unclassifiedMv = 0;
  for (const h of holdings) {
    const f = (h.assetClass && byClass.get(h.assetClass)) || fallback;
    if (f.assetClass === UNCLASSIFIED_ASSET_CLASS) unclassifiedMv += h.marketValue;
    weightedFactor += f.factor * h.marketValue;
    weightedVol += f.volAssumption * h.marketValue;
  }

  const score = weightedFactor / totalMv;
  return {
    score,
    band: riskBand(score),
    expectedVol: weightedVol / totalMv,
    totalMv,
    unclassifiedMv,
  };
}

// ---------------------------------------------------------------------------
// Portfolio Changes (Section 6): window between two snapshots.
// Net Change = ΔMV; Market Change = ΔMV − (contributions − withdrawals).
// The four figures must reconcile exactly to the bounding snapshots plus the
// transaction ledger (tie-out test in portfolio.test.ts).
// ---------------------------------------------------------------------------

export type TransactionLike = {
  activity: string;
  /** Signed amount: contributions positive, withdrawals negative in the ledger. */
  amount: number;
};

export type PortfolioChanges = {
  contributions: number;
  withdrawals: number;
  netFlows: number;
  marketChange: number;
  netChange: number;
};

export function computePortfolioChanges(
  startMv: number,
  endMv: number,
  windowTransactions: TransactionLike[],
): PortfolioChanges {
  let contributions = 0;
  let withdrawals = 0;
  for (const t of windowTransactions) {
    if (t.activity === "contribution") contributions += Math.abs(t.amount);
    else if (t.activity === "withdrawal") withdrawals += Math.abs(t.amount);
  }
  const netFlows = contributions - withdrawals;
  const netChange = endMv - startMv;
  return {
    contributions,
    withdrawals,
    netFlows,
    marketChange: netChange - netFlows,
    netChange,
  };
}

// ---------------------------------------------------------------------------
// Business-day helpers (Mon-Fri; holidays not modeled in v1)
// ---------------------------------------------------------------------------

export function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  const step = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

export function businessDaysBetween(from: Date, to: Date): number {
  if (to < from) return -businessDaysBetween(to, from);
  let count = 0;
  const d = new Date(from);
  while (d < to) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

export function isOlderThanBusinessDays(asOf: Date, n: number, today: Date): boolean {
  return businessDaysBetween(asOf, today) > n;
}
