import { describe, expect, it } from "vitest";
import { summarizeActivity, type ActivityMetrics } from "./activity";

const paulo: ActivityMetrics = {
  twr: -0.0073,
  changeInValue: -28245,
  percentChange: -0.0138,
  netFlows: -13326,
  income: 2810,
  dividends: 1708,
  marketChange: -14919,
};

describe("summarizeActivity", () => {
  it("headline uses TWR and the period label", () => {
    expect(summarizeActivity(paulo, "trailing_30d").headline).toBe("Down 0.73% this month");
    expect(summarizeActivity({ ...paulo, twr: 0.052 }, "ytd").headline).toBe("Up 5.20% year to date");
  });

  it("detail decomposes market, flows and income", () => {
    const d = summarizeActivity(paulo).detail;
    expect(d).toMatch(/markets subtracted/i);
    expect(d).toContain("net withdrawals of");
    expect(d).toContain("income and dividends");
  });

  it("flat when the return is ~zero", () => {
    const s = summarizeActivity({ ...paulo, twr: 0, percentChange: 0 });
    expect(s.direction).toBe("flat");
    expect(s.headline).toContain("Flat");
  });

  it("positive flows read as contributions", () => {
    const s = summarizeActivity({ ...paulo, netFlows: 50000 });
    expect(s.detail).toContain("net contributions of");
  });

  it("breakdown carries the tooltip rows in order", () => {
    const b = summarizeActivity(paulo).breakdown.map((r) => r.label);
    expect(b[0]).toBe("Market change");
    expect(b).toContain("Net flows");
    expect(b[b.length - 1]).toBe("Total change in value");
  });
});
