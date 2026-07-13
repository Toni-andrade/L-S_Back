import { describe, expect, it } from "vitest";
import { evaluateProposalFlags, type ProposalFlagInput } from "./flags";

const TODAY = new Date("2026-07-13T12:00:00Z");

const brClient = {
  id: "c1",
  name: "Maria",
  isBrazilTaxpayer: true,
  isUsNra: false,
  domicileCountry: "BR",
  riskProfile: "moderado" as const,
};

function baseInput(overrides: Partial<ProposalFlagInput> = {}): ProposalFlagInput {
  return {
    client: null,
    riskProfile: "moderado",
    modelRiskProfile: null,
    strategies: [],
    blockedIssuers: [],
    today: TODAY,
    ...overrides,
  };
}

function strategy(over: Partial<ProposalFlagInput["strategies"][number]> = {}) {
  return {
    key: "NEUTRAL",
    name: "Neutral",
    weight: 100,
    symbols: [],
    returnSource: "library" as const,
    asOfDate: null,
    ...over,
  };
}

describe("evaluateProposalFlags", () => {
  it("GLD for a BR client is a blocker naming UCITS alternatives", () => {
    const flags = evaluateProposalFlags(
      baseInput({
        client: brClient,
        strategies: [strategy({ key: "OURO", name: "Gold", symbols: ["GLD"] })],
      }),
    );
    const f = flags.find((x) => x.code === "US_SITUS_BR_CLIENT");
    expect(f?.severity).toBe("blocker");
    expect(f?.message).toContain("SGLN");
    expect(f?.message).toContain("IGLN");
  });

  it("GLD for a non-BR client raises nothing", () => {
    const flags = evaluateProposalFlags(
      baseInput({
        client: { ...brClient, isBrazilTaxpayer: false, domicileCountry: "US" },
        strategies: [strategy({ symbols: ["GLD"] })],
      }),
    );
    expect(flags.find((x) => x.code === "US_SITUS_BR_CLIENT")).toBeUndefined();
  });

  it("blocked issuer by ticker is a blocker", () => {
    const flags = evaluateProposalFlags(
      baseInput({
        strategies: [strategy({ symbols: ["BA"] })],
        blockedIssuers: [{ name: "Boeing", ticker: "BA", active: true }],
      }),
    );
    const f = flags.find((x) => x.code === "BLOCKED_ISSUER");
    expect(f?.severity).toBe("blocker");
    expect(f?.message).toContain("Boeing");
  });

  it("inactive blocked issuers are ignored", () => {
    const flags = evaluateProposalFlags(
      baseInput({
        strategies: [strategy({ symbols: ["BA"] })],
        blockedIssuers: [{ name: "Boeing", ticker: "BA", active: false }],
      }),
    );
    expect(flags.find((x) => x.code === "BLOCKED_ISSUER")).toBeUndefined();
  });

  it("manual figures without a source date block", () => {
    const flags = evaluateProposalFlags(
      baseInput({ strategies: [strategy({ returnSource: "manual", asOfDate: null })] }),
    );
    expect(flags.find((x) => x.code === "INDICATIVE_DATA")?.severity).toBe("blocker");
  });

  it("manual figures older than 5 business days block; fresh ones do not", () => {
    const stale = evaluateProposalFlags(
      baseInput({ strategies: [strategy({ returnSource: "manual", asOfDate: "2026-07-01" })] }),
    );
    expect(stale.find((x) => x.code === "INDICATIVE_DATA")).toBeDefined();

    const fresh = evaluateProposalFlags(
      baseInput({ strategies: [strategy({ returnSource: "manual", asOfDate: "2026-07-10" })] }),
    );
    expect(fresh.find((x) => x.code === "INDICATIVE_DATA")).toBeUndefined();
  });

  it("library figures never raise INDICATIVE_DATA", () => {
    const flags = evaluateProposalFlags(
      baseInput({ strategies: [strategy({ returnSource: "library" })] }),
    );
    expect(flags.find((x) => x.code === "INDICATIVE_DATA")).toBeUndefined();
  });

  it("model profile mismatch is a warning", () => {
    const flags = evaluateProposalFlags(
      baseInput({ riskProfile: "conservador", modelRiskProfile: "agressivo" }),
    );
    const f = flags.find((x) => x.code === "PROFILE_MISMATCH");
    expect(f?.severity).toBe("warning");
  });
});
