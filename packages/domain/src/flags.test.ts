import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLAG_CONFIG,
  evaluatePortfolioFlags,
  type BlockedIssuerLike,
  type ClientLike,
} from "./flags";
import {
  computePortfolioChanges,
  computeRiskScore,
  riskBand,
  type RiskFactorLike,
} from "./portfolio";

const FACTORS: RiskFactorLike[] = [
  { assetClass: "Cash & equivalents", factor: 0, volAssumption: 0.5 },
  { assetClass: "IG fixed income", factor: 15, volAssumption: 5 },
  { assetClass: "HY & EM fixed income", factor: 35, volAssumption: 9 },
  { assetClass: "Gold", factor: 30, volAssumption: 15 },
  { assetClass: "US equities", factor: 70, volAssumption: 16 },
  { assetClass: "EM equities", factor: 85, volAssumption: 22 },
  { assetClass: "Unclassified", factor: 50, volAssumption: 12 },
];

const NO_ISSUERS: BlockedIssuerLike[] = [];

function client(overrides: Partial<ClientLike> = {}): ClientLike {
  return {
    id: "c1",
    name: "Test Client",
    isBrazilTaxpayer: false,
    isUsNra: false,
    domicileCountry: "US",
    riskProfile: null,
    ...overrides,
  };
}

function holding(overrides: Record<string, unknown>) {
  return {
    clientId: "c1",
    symbol: null,
    description: null,
    assetClass: "US equities",
    marketValue: 100_000,
    ...overrides,
  };
}

const FRESH = { snapshotAsOf: new Date("2026-07-10"), today: new Date("2026-07-13") }; // Fri -> Mon = 1 biz day

describe("risk score (Section 6.1)", () => {
  it("computes MV-weighted score, band and expected vol exactly", () => {
    const r = computeRiskScore(
      [
        holding({ assetClass: "US equities", marketValue: 500_000 }),
        holding({ assetClass: "IG fixed income", marketValue: 300_000 }),
        holding({ assetClass: "Cash & equivalents", marketValue: 200_000 }),
      ],
      FACTORS,
    )!;
    // (70*500k + 15*300k + 0*200k) / 1m = 39.5
    expect(r.score).toBeCloseTo(39.5, 10);
    expect(r.band).toBe("moderado");
    // (16*500k + 5*300k + 0.5*200k) / 1m = 9.6
    expect(r.expectedVol).toBeCloseTo(9.6, 10);
  });

  it("routes unknown asset classes to Unclassified and reports the MV", () => {
    const r = computeRiskScore(
      [holding({ assetClass: "Exotic Structured Note", marketValue: 100_000 })],
      FACTORS,
    )!;
    expect(r.score).toBe(50);
    expect(r.unclassifiedMv).toBe(100_000);
  });

  it("bands: 0-35 conservador, 36-65 moderado, 66-100 agressivo", () => {
    expect(riskBand(35)).toBe("conservador");
    expect(riskBand(35.1)).toBe("moderado");
    expect(riskBand(65)).toBe("moderado");
    expect(riskBand(65.1)).toBe("agressivo");
  });
});

describe("portfolio changes tie-out (Section 6)", () => {
  it("Net Change = ΔMV and Market Change = ΔMV − net flows, exactly", () => {
    const startMv = 1_000_000;
    const endMv = 1_080_000;
    const txns = [
      { activity: "contribution", amount: 50_000 },
      { activity: "withdrawal", amount: -20_000 },
      { activity: "dividend", amount: 1_200 }, // not a flow
      { activity: "buy", amount: -30_000 }, // not a flow
    ];
    const c = computePortfolioChanges(startMv, endMv, txns);
    expect(c.netChange).toBe(80_000);
    expect(c.contributions).toBe(50_000);
    expect(c.withdrawals).toBe(20_000);
    expect(c.netFlows).toBe(30_000);
    expect(c.marketChange).toBe(50_000);
    // tie-out: start + flows + market = end
    expect(startMv + c.netFlows + c.marketChange).toBe(endMv);
  });
});

describe("flag engine (Section 9)", () => {
  it("CASH_DRAG when cash > 5% of scope MV", () => {
    const flags = evaluatePortfolioFlags({
      clients: [client()],
      holdings: [
        holding({ assetClass: "Cash & equivalents", marketValue: 60_000 }),
        holding({ assetClass: "US equities", marketValue: 940_000 }),
      ],
      riskFactors: FACTORS,
      blockedIssuers: NO_ISSUERS,
      ...FRESH,
    });
    expect(flags.map((f) => f.code)).toContain("CASH_DRAG");
    expect(flags.find((f) => f.code === "CASH_DRAG")!.message).toContain("IB01");
  });

  it("no CASH_DRAG at or under the threshold", () => {
    const flags = evaluatePortfolioFlags({
      clients: [client()],
      holdings: [
        holding({ assetClass: "Cash & equivalents", marketValue: 50_000 }),
        holding({ assetClass: "US equities", marketValue: 950_000 }),
      ],
      riskFactors: FACTORS,
      blockedIssuers: NO_ISSUERS,
      ...FRESH,
    });
    expect(flags.map((f) => f.code)).not.toContain("CASH_DRAG");
  });

  it("US_SITUS_BR_CLIENT for a BR taxpayer holding GLD, naming UCITS alternatives", () => {
    const flags = evaluatePortfolioFlags({
      clients: [client({ isBrazilTaxpayer: true, domicileCountry: "BR" })],
      holdings: [holding({ symbol: "GLD", assetClass: "Gold" })],
      riskFactors: FACTORS,
      blockedIssuers: NO_ISSUERS,
      ...FRESH,
    });
    const flag = flags.find((f) => f.code === "US_SITUS_BR_CLIENT");
    expect(flag).toBeDefined();
    expect(flag!.message).toContain("SGLN");
    expect(flag!.message).toContain("IGLN");
  });

  it("no US_SITUS flag for a US-domiciled client holding GLD", () => {
    const flags = evaluatePortfolioFlags({
      clients: [client()],
      holdings: [holding({ symbol: "GLD", assetClass: "Gold" })],
      riskFactors: FACTORS,
      blockedIssuers: NO_ISSUERS,
      ...FRESH,
    });
    expect(flags.map((f) => f.code)).not.toContain("US_SITUS_BR_CLIENT");
  });

  it("BLOCKED_ISSUER on ticker or description match", () => {
    const flags = evaluatePortfolioFlags({
      clients: [client()],
      holdings: [
        holding({ symbol: "BA", description: "Boeing Co" }),
        holding({ symbol: null, description: "Pemex 6.5% 2029 bond", assetClass: "HY & EM fixed income" }),
      ],
      riskFactors: FACTORS,
      blockedIssuers: [
        { name: "Boeing", ticker: "BA", active: true },
        { name: "Pemex", ticker: null, active: true },
        { name: "Intel", ticker: "INTC", active: false },
      ],
      ...FRESH,
    });
    const blocked = flags.filter((f) => f.code === "BLOCKED_ISSUER");
    expect(blocked).toHaveLength(2);
  });

  it("EM_CONCENTRATION when EM > 30% of the FI sleeve", () => {
    const flags = evaluatePortfolioFlags({
      clients: [client()],
      holdings: [
        holding({ assetClass: "IG fixed income", marketValue: 600_000 }),
        holding({ assetClass: "HY & EM fixed income", marketValue: 400_000 }),
      ],
      riskFactors: FACTORS,
      blockedIssuers: NO_ISSUERS,
      ...FRESH,
    });
    expect(flags.map((f) => f.code)).toContain("EM_CONCENTRATION");
  });

  it("PROFILE_MISMATCH when computed band differs from assigned profile", () => {
    const flags = evaluatePortfolioFlags({
      clients: [client({ riskProfile: "conservador" })],
      holdings: [holding({ assetClass: "EM equities", marketValue: 1_000_000 })],
      riskFactors: FACTORS,
      blockedIssuers: NO_ISSUERS,
      ...FRESH,
    });
    const flag = flags.find((f) => f.code === "PROFILE_MISMATCH");
    expect(flag).toBeDefined();
    expect(flag!.message).toContain("agressivo");
  });

  it("STALE_SNAPSHOT when older than 2 business days", () => {
    const flags = evaluatePortfolioFlags({
      clients: [client()],
      holdings: [holding({})],
      riskFactors: FACTORS,
      blockedIssuers: NO_ISSUERS,
      snapshotAsOf: new Date("2026-07-07"), // Tue -> Mon 7/13 = 4 business days
      today: new Date("2026-07-13"),
    });
    expect(flags.map((f) => f.code)).toContain("STALE_SNAPSHOT");
  });

  it("default config matches the spec thresholds", () => {
    expect(DEFAULT_FLAG_CONFIG.cashDragThreshold).toBe(0.05);
    expect(DEFAULT_FLAG_CONFIG.emConcentrationThreshold).toBe(0.3);
    expect(DEFAULT_FLAG_CONFIG.staleSnapshotBusinessDays).toBe(2);
  });
});
