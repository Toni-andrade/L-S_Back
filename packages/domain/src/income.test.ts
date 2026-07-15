import { describe, expect, it } from "vitest";
import {
  annualIncome,
  incomeContributors,
  incomeSchedule,
  incomeSummary,
  upcomingPayments,
  type IncomeHolding,
} from "./income";

const h = (over: Partial<IncomeHolding>): IncomeHolding => ({
  marketValue: 0,
  quantity: null,
  incomePerUnit: null,
  frequency: null,
  nextExDate: null,
  maturityDate: null,
  couponRate: null,
  assetClass: null,
  symbol: null,
  description: null,
  ...over,
});

const HOLDINGS: IncomeHolding[] = [
  // Dividend stock: 30 * 0.88 = 26.40/yr
  h({ marketValue: 5000, quantity: 30, incomePerUnit: 0.88, frequency: 4, symbol: "GOOG" }),
  // Dividend ETF: 253 * 3.36 = 850.08/yr
  h({ marketValue: 20000, quantity: 253, incomePerUnit: 3.36, frequency: 2, symbol: "EFA" }),
  // Bond (coupon): 100 * 45 = 4500/yr, fixed income
  h({
    marketValue: 100000,
    quantity: 100,
    incomePerUnit: 45,
    frequency: 2,
    maturityDate: "2030-01-01",
    symbol: "BOND",
  }),
  // No income data
  h({ marketValue: 3000, quantity: 10, incomePerUnit: null, symbol: "META" }),
];

describe("annualIncome", () => {
  it("multiplies per-unit income by quantity", () => {
    expect(annualIncome(HOLDINGS[0]!)).toBeCloseTo(26.4);
  });
  it("returns 0 when data is missing", () => {
    expect(annualIncome(HOLDINGS[3]!)).toBe(0);
  });
  it("estimates coupon income for bonds without a projected figure", () => {
    const bond = h({ marketValue: 40000, maturityDate: "2030-01-01", couponRate: 0.047 });
    expect(annualIncome(bond)).toBeCloseTo(1880); // 0.047 * 40000
  });
});

describe("incomeSummary", () => {
  it("splits dividends from interest and computes yield", () => {
    const s = incomeSummary(HOLDINGS);
    expect(s.totalMv).toBe(128000);
    expect(s.projectedAnnual).toBeCloseTo(26.4 + 850.08 + 4500);
    expect(s.fromInterest).toBeCloseTo(4500);
    expect(s.fromDividends).toBeCloseTo(26.4 + 850.08);
    expect(s.incomeHoldings).toBe(3);
    expect(s.yield).toBeCloseTo((26.4 + 850.08 + 4500) / 128000);
  });
});

describe("incomeContributors", () => {
  it("ranks by annual income, descending, excluding zeros", () => {
    const c = incomeContributors(HOLDINGS);
    expect(c.map((x) => x.symbol)).toEqual(["BOND", "EFA", "GOOG"]);
    expect(c[0]!.source).toBe("interest");
    expect(c[1]!.source).toBe("dividend");
  });
});

describe("incomeSchedule", () => {
  it("spreads annual income evenly and ties out over 12 months", () => {
    const sched = incomeSchedule(HOLDINGS, 12, new Date("2026-07-15T00:00:00Z"));
    expect(sched).toHaveLength(12);
    expect(sched[0]!.label).toBe("Jul 26");
    const total = sched.reduce((s, m) => s + m.amount, 0);
    expect(total).toBeCloseTo(incomeSummary(HOLDINGS).projectedAnnual);
  });
});

describe("upcomingPayments", () => {
  it("returns per-payment estimates for holdings with an ex date in window", () => {
    const withEx = [
      h({ quantity: 100, incomePerUnit: 4, frequency: 4, nextExDate: "2026-08-01", symbol: "X" }),
    ];
    const p = upcomingPayments(withEx, new Date("2026-07-15T00:00:00Z"), 90);
    expect(p).toHaveLength(1);
    expect(p[0]!.estimatedAmount).toBeCloseTo(100); // 400/yr / 4
  });
  it("is empty when no ex dates are known", () => {
    expect(upcomingPayments(HOLDINGS, new Date("2026-07-15T00:00:00Z"))).toHaveLength(0);
  });
});
