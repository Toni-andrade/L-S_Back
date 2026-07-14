/**
 * Proposal brief (Section 8.1) and the pre-render validation checklist.
 * Every figure in a client artifact traces to (a) the Addepar snapshot,
 * (b) the strategy library, or (c) an explicit brief field with an as-of
 * date. There is no fourth source.
 */

import { z } from "zod";

export const RISK_PROFILES = ["conservador", "moderado", "agressivo"] as const;

export const briefStrategySchema = z.object({
  key: z.string().min(1),
  weight: z.number().positive().max(100),
  riskLabel: z.string().nullable().default(null),
  returnSource: z.enum(["library", "manual"]).default("library"),
  /** Required when returnSource is manual; enforced by the flag engine. */
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const proposalBriefSchema = z.object({
  clientName: z.string().min(1),
  salutation: z.string().min(1),
  totalAum: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  riskProfile: z.enum(RISK_PROFILES),
  monthYear: z.string().min(3),
  strategies: z.array(briefStrategySchema).min(1),
  notes: z.string().nullable().default(null),
});

export type ProposalBrief = z.infer<typeof proposalBriefSchema>;
export type BriefStrategy = z.infer<typeof briefStrategySchema>;

/** The client's current portfolio, for the optional positions appendix. */
export type CurrentPortfolioPosition = {
  symbol: string | null;
  description: string | null;
  assetClass: string | null;
  marketValue: number;
};
export type CurrentPortfolio = {
  asOf: string;
  totalMv: number;
  positions: CurrentPortfolioPosition[];
};

/** A strategy row as loaded from the `strategies` table. */
export type StrategyInfo = {
  key: string;
  name: string;
  description: string | null;
  kind: "built_in" | "static_model" | "custom";
  riskLabel: string | null;
  active: boolean;
  metrics: {
    cagr?: number;
    vol?: number;
    max_dd?: number;
    sharpe?: number;
    period?: string;
  } | null;
  /** Instrument symbols from strategies.instruments, for the flag engine. */
  symbols: string[];
};

/** OURO gets a dedicated slide only at >= 15% weight (Section 8.2). */
export const OURO_SLIDE_MIN_WEIGHT = 15;

/**
 * Validation checklist enforced in code before render (Section 8.5).
 * Returns human-readable violations; empty array means renderable.
 */
export function validateBrief(brief: ProposalBrief, library: StrategyInfo[]): string[] {
  const errors: string[] = [];
  const byKey = new Map(library.map((s) => [s.key, s]));

  const totalWeight = brief.strategies.reduce((s, row) => s + row.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    errors.push(`strategy weights must sum to 100% (got ${totalWeight}%)`);
  }

  const seen = new Set<string>();
  for (const row of brief.strategies) {
    if (seen.has(row.key)) errors.push(`duplicate strategy key ${row.key}`);
    seen.add(row.key);
    const info = byKey.get(row.key);
    if (!info) errors.push(`unknown strategy key ${row.key}`);
    else if (!info.active) errors.push(`strategy ${row.key} is inactive`);
  }

  if (!(brief.totalAum > 0)) errors.push("TOTAL_AUM must be positive");
  if (!brief.monthYear.trim()) errors.push("MONTH_YEAR is required");

  return errors;
}
