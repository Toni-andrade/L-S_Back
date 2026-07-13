import { describe, expect, it } from "vitest";
import { computeRealizedStats, type TwrPoint } from "./portfolio";

/** Weekly series over one year with the given period returns repeated. */
function weeklySeries(periodReturns: number[], weeks = 52): TwrPoint[] {
  const points: TwrPoint[] = [];
  let cumulative = 1;
  const start = new Date("2025-07-01T00:00:00Z");
  for (let i = 0; i < weeks; i++) {
    cumulative *= 1 + periodReturns[i % periodReturns.length]!;
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + (i + 1) * 7);
    points.push({ asOf: d.toISOString().slice(0, 10), cumulative: cumulative - 1 });
  }
  return points;
}

describe("computeRealizedStats", () => {
  it("returns null with fewer than minPoints observations", () => {
    expect(computeRealizedStats(weeklySeries([0.001], 10))).toBeNull();
    expect(computeRealizedStats(weeklySeries([0.001], 10), { minPoints: 5 })).not.toBeNull();
  });

  it("constant growth has ~zero vol and a null Sharpe", () => {
    const stats = computeRealizedStats(weeklySeries([0.002]))!;
    expect(stats.annualizedVol).toBeCloseTo(0, 6);
    expect(stats.sharpe).toBeNull();
    // 0.2% weekly compounds to roughly 11% a year
    expect(stats.annualizedReturn).toBeGreaterThan(0.09);
    expect(stats.annualizedReturn).toBeLessThan(0.13);
  });

  it("alternating returns produce positive vol and a finite Sharpe", () => {
    const stats = computeRealizedStats(weeklySeries([0.01, -0.005]))!;
    expect(stats.annualizedVol).toBeGreaterThan(0.03);
    expect(stats.sharpe).not.toBeNull();
    expect(Number.isFinite(stats.sharpe!)).toBe(true);
  });

  it("subtracts the risk-free rate in Sharpe", () => {
    const base = computeRealizedStats(weeklySeries([0.01, -0.005]))!;
    const withRf = computeRealizedStats(weeklySeries([0.01, -0.005]), { riskFreeRate: 0.03 })!;
    expect(withRf.sharpe!).toBeLessThan(base.sharpe!);
  });

  it("is insensitive to input order", () => {
    const series = weeklySeries([0.01, -0.005]);
    const reversed = [...series].reverse();
    expect(computeRealizedStats(reversed)).toEqual(computeRealizedStats(series));
  });
});
