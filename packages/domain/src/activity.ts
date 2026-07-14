/**
 * Advisor activity summary: turns a period's performance decomposition into a
 * plain-language headline + a movement breakdown (the tooltip content). English
 * UI, en-US formatting (this is internal, not a client artifact).
 */

import { formatCurrencyUS } from "./formatters";

export type ActivityMetrics = {
  twr: number | null;
  changeInValue: number | null;
  percentChange: number | null;
  netFlows: number | null;
  income: number | null;
  dividends: number | null;
  marketChange: number | null;
};

export type ActivityMover = {
  name: string | null;
  symbol: string | null;
  change: number;
};

export type ActivitySummary = {
  direction: "up" | "down" | "flat";
  /** e.g. "Down 0.7% this month" */
  headline: string;
  /** One-sentence plain-language recap of the drivers. */
  detail: string;
  /** Ordered decomposition rows for the movements tooltip. */
  breakdown: { label: string; value: number }[];
};

const PERIOD_LABEL: Record<string, string> = {
  trailing_30d: "this month",
  ytd: "year to date",
  one_year: "over the past year",
};

/** Prefer TWR for the headline %, fall back to simple % change in value. */
export function summarizeActivity(
  m: ActivityMetrics,
  period: "trailing_30d" | "ytd" | "one_year" = "trailing_30d",
): ActivitySummary {
  const pct = m.twr ?? m.percentChange ?? 0;
  const direction = pct > 0.0005 ? "up" : pct < -0.0005 ? "down" : "flat";
  const when = PERIOD_LABEL[period] ?? "this period";
  const pctStr = `${Math.abs(pct * 100).toFixed(2)}%`;
  const headline =
    direction === "flat" ? `Flat ${when}` : `${direction === "up" ? "Up" : "Down"} ${pctStr} ${when}`;

  const parts: string[] = [];
  if (m.marketChange !== null && Math.abs(m.marketChange) >= 1) {
    parts.push(
      `markets ${m.marketChange >= 0 ? "added" : "subtracted"} ${formatCurrencyUS(Math.abs(m.marketChange))}`,
    );
  }
  if (m.netFlows !== null && Math.abs(m.netFlows) >= 1) {
    parts.push(
      `net ${m.netFlows >= 0 ? "contributions" : "withdrawals"} of ${formatCurrencyUS(Math.abs(m.netFlows))}`,
    );
  }
  const incomeTotal = (m.income ?? 0) + (m.dividends ?? 0);
  if (Math.abs(incomeTotal) >= 1) {
    parts.push(`${formatCurrencyUS(Math.abs(incomeTotal))} in income and dividends`);
  }
  const detail =
    parts.length > 0
      ? capitalize(parts.join("; ")) + "."
      : "No material movement in the period.";

  const breakdown: { label: string; value: number }[] = [];
  if (m.marketChange !== null) breakdown.push({ label: "Market change", value: m.marketChange });
  if (m.netFlows !== null) breakdown.push({ label: "Net flows", value: m.netFlows });
  if (m.income !== null && m.income !== 0) breakdown.push({ label: "Income / expenses", value: m.income });
  if (m.dividends !== null && m.dividends !== 0) breakdown.push({ label: "Dividends", value: m.dividends });
  if (m.changeInValue !== null)
    breakdown.push({ label: "Total change in value", value: m.changeInValue });

  return { direction, headline, detail, breakdown };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
