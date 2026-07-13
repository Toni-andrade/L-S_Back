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
// Realized statistics from the TWR series (Phase 4). Never computed from
// assumptions: input is the cumulative TWR series pulled from Addepar.
// ---------------------------------------------------------------------------

export type TwrPoint = {
  /** ISO date (yyyy-mm-dd). */
  asOf: string;
  /** Cumulative TWR since the series start, as a FRACTION (0.052 = +5.2%). */
  cumulative: number;
};

export type RealizedStats = {
  /** Annualized stdev of period returns, as a fraction. */
  annualizedVol: number;
  /** Annualized return over the span, as a fraction. */
  annualizedReturn: number;
  /** (annualizedReturn - riskFree) / annualizedVol; null when vol is ~0. */
  sharpe: number | null;
  observations: number;
};

/**
 * Realized vol + Sharpe from a cumulative TWR series. Period returns are
 * chained out of consecutive cumulative points; annualization uses the
 * observed average spacing. Returns null with fewer than minPoints
 * observations (default 20) or a non-positive time span.
 */
export function computeRealizedStats(
  series: TwrPoint[],
  opts: { riskFreeRate?: number; minPoints?: number } = {},
): RealizedStats | null {
  const minPoints = opts.minPoints ?? 20;
  const riskFree = opts.riskFreeRate ?? 0;
  const sorted = [...series].sort((a, b) => a.asOf.localeCompare(b.asOf));
  if (sorted.length < minPoints) return null;

  const first = new Date(sorted[0]!.asOf).getTime();
  const last = new Date(sorted[sorted.length - 1]!.asOf).getTime();
  const spanDays = (last - first) / 86_400_000;
  if (spanDays <= 0) return null;

  const periodReturns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = 1 + sorted[i - 1]!.cumulative;
    const curr = 1 + sorted[i]!.cumulative;
    if (prev <= 0) return null;
    periodReturns.push(curr / prev - 1);
  }

  const mean = periodReturns.reduce((s, r) => s + r, 0) / periodReturns.length;
  const variance =
    periodReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (periodReturns.length - 1);
  const periodsPerYear = 365.25 / (spanDays / periodReturns.length);
  const annualizedVol = Math.sqrt(variance) * Math.sqrt(periodsPerYear);

  const totalGrowth = (1 + sorted[sorted.length - 1]!.cumulative) / (1 + sorted[0]!.cumulative);
  const annualizedReturn = totalGrowth ** (365.25 / spanDays) - 1;

  const sharpe = annualizedVol > 1e-9 ? (annualizedReturn - riskFree) / annualizedVol : null;
  return { annualizedVol, annualizedReturn, sharpe, observations: sorted.length };
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
