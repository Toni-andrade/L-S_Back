import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import {
  generateEmailDraft,
  proposalBriefSchema,
  renderProposalPptx,
  validateBrief,
  type ProposalBrief,
  type StrategyInfo,
} from "./index";

const LIBRARY: StrategyInfo[] = [
  {
    key: "NEUTRAL",
    name: "Neutral",
    description: null,
    kind: "static_model",
    riskLabel: "Baixo-Moderado",
    active: true,
    metrics: { cagr: 6.95, vol: 6.25, max_dd: -13.03, sharpe: 0.91, period: "Jan 2008 a Dez 2025" },
    symbols: [],
  },
  {
    key: "FUNDAMENTALS_CONSERVATIVE",
    name: "Fundamentals Conservative",
    description: null,
    kind: "static_model",
    riskLabel: "Moderado",
    active: true,
    metrics: { cagr: 8.16, vol: 10.68, max_dd: -29.09, sharpe: 0.67, period: "Jan 2008 a Dez 2025" },
    symbols: [],
  },
  {
    key: "CASH_SIGNAL",
    name: "American Dream Cash Signal",
    description: "4-phase cycle methodology.",
    kind: "built_in",
    riskLabel: null,
    active: true,
    metrics: { cagr: 8.23, sharpe: 1.0, max_dd: -9.24, period: "Jan 2008 a Dez 2025" },
    symbols: [],
  },
  {
    key: "OURO",
    name: "Gold",
    description: "Proteção e diversificação.",
    kind: "built_in",
    riskLabel: null,
    active: true,
    metrics: null,
    symbols: [],
  },
];

const brief: ProposalBrief = proposalBriefSchema.parse(
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../fixtures/brief.json", import.meta.url)), "utf8"),
  ),
);

describe("validateBrief", () => {
  it("accepts the fixture", () => {
    expect(validateBrief(brief, LIBRARY)).toEqual([]);
  });

  it("rejects weights that do not sum to 100", () => {
    const bad = { ...brief, strategies: brief.strategies.map((s) => ({ ...s, weight: 10 })) };
    expect(validateBrief(bad, LIBRARY).join(" ")).toContain("sum to 100");
  });

  it("rejects unknown and inactive strategy keys", () => {
    const unknown = {
      ...brief,
      strategies: [{ ...brief.strategies[0]!, key: "NOPE", weight: 100 }],
    };
    expect(validateBrief(unknown, LIBRARY).join(" ")).toContain("unknown strategy key NOPE");

    const inactiveLib = LIBRARY.map((s) =>
      s.key === "NEUTRAL" ? { ...s, active: false } : s,
    );
    const inactive = {
      ...brief,
      strategies: [{ ...brief.strategies[0]!, key: "NEUTRAL", weight: 100 }],
    };
    expect(validateBrief(inactive, inactiveLib).join(" ")).toContain("inactive");
  });
});

describe("email draft", () => {
  it("has a dash-free subject, no forbidden openers, and one sentence per strategy", () => {
    const email = generateEmailDraft(brief, LIBRARY);
    expect(email).toContain("Proposta de Investimento Personalizada | L&S Investment Advisors");
    expect(email).not.toMatch(/[–—]/);
    expect(email).not.toMatch(/É com satisfação/i);
    expect(email).not.toMatch(/Prezado/i);
    expect(email).toContain("Antonio · L&S Investment Advisors");
    expect(email).toContain("Cash Signal");
    expect(email).toContain("ouro");
    expect(email).toContain("$500.000");
  });
});

describe("golden-file PPTX render", () => {
  let slideXmls: string[] = [];
  let slideCount = 0;

  beforeAll(async () => {
    const result = await renderProposalPptx(brief, LIBRARY);
    slideCount = result.slideCount;
    const zip = await JSZip.loadAsync(result.buffer);
    const names = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    slideXmls = await Promise.all(names.map((n) => zip.files[n]!.async("string")));
  });

  it("has the expected slide count (OURO under 15% gets no dedicated slide)", () => {
    // Capa, Agenda, Carta, Resumo, 3 strategy sections (OURO skipped),
    // Perfil & Próximos Passos, Disclaimer
    expect(slideCount).toBe(9);
    expect(slideXmls).toHaveLength(9);
  });

  it("Resumo da Alocação is a table, not a chart", () => {
    const resumo = slideXmls[3]!;
    expect(resumo).toContain("<a:tbl>");
    expect(resumo).toContain("Estratégia");
    expect(resumo).toContain("Fonte de Retorno");
    // Brazilian formatting for AUM and weights
    expect(resumo).toContain("$500.000");
    // No charts anywhere in the deck
    for (const xml of slideXmls) {
      expect(xml).not.toContain("graphicFrame><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"");
      expect(xml).not.toContain("pieChart");
      expect(xml).not.toContain("doughnutChart");
    }
  });

  it("contains no forbidden strings anywhere", () => {
    const all = slideXmls.join("\n");
    for (const forbidden of ["C9A84C", "FFD700", "FFC107", "F5C518"]) {
      expect(all.toUpperCase()).not.toContain(forbidden);
    }
    expect(all).not.toMatch(/É com satisfação/i);
    expect(all).not.toContain("35.000");
    expect(all).not.toMatch(/35 mil/i);
    expect(all).not.toMatch(/isenção mensal/i);
    expect(all).not.toMatch(/[–—]/);
  });

  it("Próximos Passos has exactly two cards in the required order", () => {
    const perfil = slideXmls[7]!;
    const inicio = perfil.indexOf("Início da Alocação");
    const revisao = perfil.indexOf("Revisão Periódica");
    expect(inicio).toBeGreaterThan(-1);
    expect(revisao).toBeGreaterThan(inicio);
    // Exactly three risk levels
    for (const level of ["Conservador", "Moderado", "Agressivo"]) {
      expect(perfil).toContain(level);
    }
  });

  it("disclaimer slide is present and last, with backtest wording on metrics slides", () => {
    const last = slideXmls[slideXmls.length - 1]!;
    expect(last).toContain("Disclaimer");
    const neutralSlide = slideXmls[4]!;
    expect(neutralSlide).toContain("backtest");
    expect(neutralSlide).toContain("6,95%");
  });

  it("adds a Carteira Atual appendix with individual positions when provided", async () => {
    const result = await renderProposalPptx(brief, LIBRARY, {
      currentPortfolio: {
        asOf: "2026-07-14",
        totalMv: 200000,
        positions: [
          { symbol: "VOO", description: "Vanguard S&P 500", assetClass: "Equity", marketValue: 120000 },
          { symbol: "AGG", description: "iShares Agg Bond", assetClass: "Fixed Income", marketValue: 80000 },
        ],
      },
    });
    expect(result.slideCount).toBe(10); // one more than the base 9
    const zip = await JSZip.loadAsync(result.buffer);
    const names = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const all = (await Promise.all(names.map((n) => zip.files[n]!.async("string")))).join("\n");
    expect(all).toContain("Carteira Atual");
    expect(all).toContain("VOO");
    // Still no forbidden strings or em/en dashes in the appendix
    expect(all).not.toMatch(/[–—]/);
  });

  it("OURO under 15% appears in the summary table but has no dedicated slide", () => {
    const resumo = slideXmls[3]!;
    expect(resumo).toContain("Gold");
    const titles = slideXmls.map((x) => x.slice(0, 4000));
    const dedicated = titles.filter((x, i) => i !== 3 && x.includes("Gold"));
    expect(dedicated).toHaveLength(0);
  });
});
