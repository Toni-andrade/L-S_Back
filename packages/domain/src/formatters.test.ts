import { describe, expect, it } from "vitest";
import {
  formatCurrencyBR,
  formatNumberBR,
  formatPercentBR,
  lintClientText,
  maskAccountNumber,
} from "./formatters";

describe("Brazilian client-artifact formatting (exact expected outputs)", () => {
  it("formats currency like $500.000", () => {
    expect(formatCurrencyBR(500000)).toBe("$500.000");
    expect(formatCurrencyBR(1250000)).toBe("$1.250.000");
    expect(formatCurrencyBR(999)).toBe("$999");
    expect(formatCurrencyBR(1500.5, 2)).toBe("$1.500,50");
    expect(formatCurrencyBR(-42000)).toBe("-$42.000");
  });

  it("formats percentages with comma decimal like 8,23%", () => {
    expect(formatPercentBR(8.23)).toBe("8,23%");
    expect(formatPercentBR(-9.24)).toBe("-9,24%");
    expect(formatPercentBR(18)).toBe("18,00%");
    expect(formatPercentBR(1)).toBe("1,00%");
  });

  it("formats plain numbers with comma decimal", () => {
    expect(formatNumberBR(1)).toBe("1,00");
    expect(formatNumberBR(19.95)).toBe("19,95");
    expect(formatNumberBR(-63.53)).toBe("-63,53");
  });
});

describe("account masking", () => {
  it("keeps only the last 4", () => {
    expect(maskAccountNumber("U1234567")).toBe("••••4567");
    expect(maskAccountNumber("123-456-789 012")).toBe("••••9012");
  });
});

describe("client text lint (compliance guardrails)", () => {
  it("rejects em/en dashes", () => {
    expect(lintClientText("Proposta – personalizada")).toContain("contains em/en dash");
    expect(lintClientText("Proposta — personalizada")).toContain("contains em/en dash");
    expect(lintClientText("Proposta, personalizada")).toEqual([]);
  });

  it("rejects the repealed 35.000 exemption", () => {
    expect(lintClientText("isenção de R$ 35.000 por mês").length).toBeGreaterThan(0);
    expect(lintClientText("até 35 mil mensais").length).toBeGreaterThan(0);
    expect(lintClientText("a isenção mensal antiga").length).toBeGreaterThan(0);
  });

  it('rejects "É com satisfação" openers', () => {
    expect(lintClientText("É com satisfação que apresentamos").length).toBeGreaterThan(0);
  });

  it("passes clean Portuguese copy", () => {
    expect(
      lintClientText("Os ganhos no exterior são tributados anualmente à alíquota de 15%, apurados em BRL via PTAX."),
    ).toEqual([]);
  });
});
