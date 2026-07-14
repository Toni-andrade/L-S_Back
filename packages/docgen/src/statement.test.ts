import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderClientStatement, type ClientStatementInput } from "./index";

const input: ClientStatementInput = {
  clientName: "Paulo Sergio Fraga Berenguer",
  asOf: "2026-07-14",
  monthYear: "Julho 2026",
  totalMv: 2024537.91,
  allocation: [
    { assetClass: "Equity", marketValue: 1000000 },
    { assetClass: "Fixed Income", marketValue: 900000 },
    { assetClass: "Cash & Cash Equivalents", marketValue: 124537.91 },
  ],
  performance: [
    { label: "30 dias", twr: -0.0073 },
    { label: "No ano (YTD)", twr: 0.041 },
    { label: "12 meses", twr: 0.086 },
  ],
  activity: {
    changeInValue: -28245,
    marketChange: -14919,
    netFlows: -13326,
    income: 2810,
    dividends: 1708,
  },
  holdings: [
    { symbol: "VOO", description: "Vanguard S&P 500", assetClass: "Equity", marketValue: 400000 },
    { symbol: "AGG", description: "iShares Agg Bond", assetClass: "Fixed Income", marketValue: 300000 },
  ],
};

describe("renderClientStatement", () => {
  it("renders a 5-slide statement with the expected sections and no forbidden strings", async () => {
    const { buffer, slideCount } = await renderClientStatement(input);
    expect(slideCount).toBe(5);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const all = (await Promise.all(names.map((n) => zip.files[n]!.async("string")))).join("\n");

    expect(all).toContain("Relatorio de Carteira");
    expect(all).toContain("Resumo da Carteira");
    expect(all).toContain("Desempenho");
    expect(all).toContain("Posicoes");
    expect(all).toContain("Disclaimer");
    // Brazilian formatting (grouped with dots) and no forbidden content
    expect(all).toMatch(/2\.024\.5\d\d/);
    expect(all).not.toMatch(/[–—]/);
    for (const forbidden of ["C9A84C", "FFD700", "FFC107"]) {
      expect(all.toUpperCase()).not.toContain(forbidden);
    }
    // No charts (tables only)
    expect(all).not.toContain("pieChart");
    expect(all).not.toContain("doughnutChart");
  });
});
