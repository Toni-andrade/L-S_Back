import { describe, expect, it } from "vitest";
import { fixedIncomeBuckets, fixedIncomeSummary, type FiHolding } from "./fixed-income";

const today = new Date("2026-07-15T00:00:00Z");

const bonds: FiHolding[] = [
  { marketValue: 100000, maturityDate: "2027-01-15", couponRate: 0.04, modifiedDuration: 0.5 }, // ~0.5y
  { marketValue: 100000, maturityDate: "2028-07-15", couponRate: 0.05, modifiedDuration: 2.0 }, // ~2y
  { marketValue: 200000, maturityDate: "2030-07-15", couponRate: 0.06, modifiedDuration: 3.8 }, // ~4y
  { marketValue: 100000, maturityDate: "2045-05-13", couponRate: 0.0437, modifiedDuration: 12 }, // ~19y
  { marketValue: 50000, maturityDate: null, couponRate: null, modifiedDuration: null }, // not a bond
];

describe("fixedIncomeBuckets", () => {
  it("buckets by time to maturity and drops empty buckets", () => {
    const buckets = fixedIncomeBuckets(bonds, today);
    const keys = buckets.map((b) => b.key);
    expect(keys).toContain("0-1");
    expect(keys).toContain("1-3");
    expect(keys).toContain("3-5");
    expect(keys).toContain("10+");
    expect(keys).not.toContain("5-10"); // nothing in 5-10y
  });

  it("weights coupon and duration by market value within a bucket", () => {
    const buckets = fixedIncomeBuckets(bonds, today);
    const b34 = buckets.find((b) => b.key === "3-5")!;
    expect(b34.marketValue).toBe(200000);
    expect(b34.avgCoupon).toBeCloseTo(0.06, 4);
    expect(b34.avgDuration).toBeCloseTo(3.8, 4);
  });

  it("weights across a bucket with multiple holdings", () => {
    const mixed: FiHolding[] = [
      { marketValue: 100000, maturityDate: "2030-01-01", couponRate: 0.04, modifiedDuration: 3 },
      { marketValue: 300000, maturityDate: "2030-06-01", couponRate: 0.08, modifiedDuration: 5 },
    ];
    const b = fixedIncomeBuckets(mixed, today).find((x) => x.key === "3-5")!;
    // weighted coupon = (0.04*1 + 0.08*3)/4 = 0.07
    expect(b.avgCoupon).toBeCloseTo(0.07, 4);
    expect(b.avgDuration).toBeCloseTo((3 + 5 * 3) / 4, 4);
  });
});

describe("fixedIncomeSummary", () => {
  it("summarizes total MV, weighted coupon and duration, bond count", () => {
    const s = fixedIncomeSummary(bonds);
    expect(s.totalMv).toBe(500000);
    expect(s.count).toBe(4);
    expect(s.avgCoupon).not.toBeNull();
    expect(s.avgDuration).not.toBeNull();
  });
});
