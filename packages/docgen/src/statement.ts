/**
 * Client portfolio statement (PPTX). Branded, Portuguese, Brazilian number
 * formatting, tables over charts, same hard rules as proposals (no gold/yellow,
 * no em/en dashes, backtest/simulation wording never implied for real figures).
 * Every figure comes from the caller (Addepar snapshot / activity), never
 * invented here.
 */

import {
  BRAND,
  FIRM_NAME,
  OFFICE_ADDRESS,
  formatCurrencyBR,
  formatNumberBR,
  formatPercentBR,
  lintClientText,
} from "@ls/domain";
import PptxGenJS from "pptxgenjs";

const FONT = "Calibri";
const c = (hex: string) => hex.replace("#", "");

export type StatementPerformance = { label: string; twr: number | null };
export type StatementActivity = {
  changeInValue: number | null;
  marketChange: number | null;
  netFlows: number | null;
  income: number | null;
  dividends: number | null;
};
export type StatementHolding = {
  symbol: string | null;
  description: string | null;
  assetClass: string | null;
  marketValue: number;
};

export type ClientStatementInput = {
  clientName: string;
  asOf: string;
  monthYear: string;
  totalMv: number;
  allocation: { assetClass: string; marketValue: number }[];
  performance: StatementPerformance[];
  activity: StatementActivity | null;
  holdings: StatementHolding[];
};

export type StatementResult = { buffer: Buffer; slideCount: number };

const DISCLAIMER_FOOTER =
  "Documento informativo. Rentabilidade passada nao garante resultados futuros.";
const DISCLAIMER_BODY = [
  `Este relatorio foi preparado por ${FIRM_NAME}, consultoria de investimentos registrada na SEC, exclusivamente para o destinatario indicado.`,
  "Os valores refletem as posicoes consolidadas na data-base indicada, conforme dados de custodia agregados. Investimentos envolvem riscos, incluindo a possivel perda do capital investido.",
  "Questoes tributarias devem ser avaliadas com assessoria especializada, considerando a legislacao vigente aplicavel ao investidor.",
].join("\n\n");

function addFooter(slide: PptxGenJS.Slide, page: number) {
  slide.addText(OFFICE_ADDRESS, {
    x: 0.35, y: 5.25, w: 3.6, h: 0.3, fontFace: FONT, fontSize: 7.5, color: "8A93A6",
  });
  slide.addText(String(page), {
    x: 4.7, y: 5.25, w: 0.6, h: 0.3, align: "center", fontFace: FONT, fontSize: 8, color: "8A93A6",
  });
  slide.addText(DISCLAIMER_FOOTER, {
    x: 5.4, y: 5.25, w: 4.25, h: 0.3, align: "right", fontFace: FONT, fontSize: 6.5, color: c(BRAND.red),
  });
}

function addTitle(slide: PptxGenJS.Slide, title: string) {
  slide.addText(title, {
    x: 0.35, y: 0.25, w: 9.3, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: c(BRAND.oxford),
  });
  slide.addShape("rect", { x: 0.38, y: 0.78, w: 1.2, h: 0.035, fill: { color: c(BRAND.royal) } });
}

function addMark(slide: PptxGenJS.Slide, x: number, y: number, dark: boolean, size: number) {
  const color = dark ? c(BRAND.oxford) : "FFFFFF";
  slide.addText(
    [
      { text: "L", options: { color, fontFace: "Times New Roman", bold: true } },
      { text: "&", options: { color: c(BRAND.celeste), fontFace: "Times New Roman", italic: true, bold: true } },
      { text: "S", options: { color, fontFace: "Times New Roman", bold: true } },
    ],
    { x, y, w: 1.6, h: 0.6, fontSize: size },
  );
}

export async function renderClientStatement(input: ClientStatementInput): Promise<StatementResult> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "LS_16x9", width: 10, height: 5.625 });
  pptx.layout = "LS_16x9";
  let page = 0;

  // 1. Cover (dark)
  {
    const slide = pptx.addSlide();
    slide.background = { color: c(BRAND.oxford) };
    addMark(slide, 0.5, 0.45, false, 34);
    slide.addText("Relatorio de Carteira", {
      x: 0.5, y: 2.1, w: 9, h: 0.8, fontFace: FONT, fontSize: 34, bold: true, color: "FFFFFF",
    });
    slide.addText(input.clientName, {
      x: 0.5, y: 2.95, w: 9, h: 0.5, fontFace: FONT, fontSize: 20, color: c(BRAND.celeste),
    });
    slide.addText(`${input.monthYear} · posicoes em ${input.asOf}`, {
      x: 0.5, y: 4.7, w: 9, h: 0.4, fontFace: FONT, fontSize: 13, color: "B9C2D4",
    });
    page += 1;
  }

  // 2. Resumo da carteira: allocation table
  {
    const slide = pptx.addSlide();
    addTitle(slide, "Resumo da Carteira");
    slide.addText(formatCurrencyBR(input.totalMv), {
      x: 6.4, y: 0.95, w: 3.2, h: 0.55, align: "right", fontFace: FONT, fontSize: 26, bold: true, color: c(BRAND.royal),
    });
    slide.addText("Patrimonio total", {
      x: 6.4, y: 1.5, w: 3.2, h: 0.3, align: "right", fontFace: FONT, fontSize: 11, color: "5A6478",
    });
    const header = ["Classe de ativo", "Valor", "Peso"].map((t) => ({
      text: t,
      options: { bold: true, color: "FFFFFF", fill: { color: c(BRAND.oxford) }, fontFace: FONT, fontSize: 11 },
    }));
    const rows = [...input.allocation].sort((a, b) => b.marketValue - a.marketValue);
    const body = rows.map((r) => [
      { text: r.assetClass, options: { fontFace: FONT, fontSize: 11, color: c(BRAND.oxford) } },
      { text: formatCurrencyBR(r.marketValue), options: { fontFace: FONT, fontSize: 11, color: c(BRAND.oxford), align: "right" as const } },
      { text: formatPercentBR(input.totalMv > 0 ? (r.marketValue / input.totalMv) * 100 : 0, 1), options: { fontFace: FONT, fontSize: 11, color: "5A6478", align: "right" as const } },
    ]);
    slide.addTable([header, ...body], {
      x: 0.6, y: 1.4, w: 5.6, colW: [3.0, 1.4, 1.2],
      border: { type: "solid", color: c(BRAND.border), pt: 0.5 }, rowH: 0.32,
    });
    page += 1;
    addFooter(slide, page);
  }

  // 3. Desempenho: TWR table + activity decomposition
  {
    const slide = pptx.addSlide();
    addTitle(slide, "Desempenho");
    const perfRows = input.performance.filter((p) => p.twr !== null);
    if (perfRows.length > 0) {
      const header = ["Periodo", "Retorno (TWR)"].map((t) => ({
        text: t, options: { bold: true, color: "FFFFFF", fill: { color: c(BRAND.oxford) }, fontFace: FONT, fontSize: 11 },
      }));
      const body = perfRows.map((p) => [
        { text: p.label, options: { fontFace: FONT, fontSize: 11, color: c(BRAND.oxford) } },
        {
          text: formatPercentBR((p.twr ?? 0) * 100),
          options: { fontFace: FONT, fontSize: 11, align: "right" as const, color: (p.twr ?? 0) < 0 ? c(BRAND.red) : c(BRAND.verde) },
        },
      ]);
      slide.addTable([header, ...body], {
        x: 0.6, y: 1.3, w: 4.2, colW: [2.4, 1.8],
        border: { type: "solid", color: c(BRAND.border), pt: 0.5 }, rowH: 0.34,
      });
    }
    const a = input.activity;
    if (a) {
      const lines: [string, number | null][] = [
        ["Variacao de mercado", a.marketChange],
        ["Aportes / retiradas liquidos", a.netFlows],
        ["Renda", a.income],
        ["Dividendos", a.dividends],
        ["Variacao total", a.changeInValue],
      ];
      slide.addText("Movimentacao no periodo", {
        x: 5.2, y: 1.3, w: 4.4, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: c(BRAND.royal),
      });
      slide.addText(
        lines
          .filter(([, v]) => v !== null)
          .map(([label, v]) => ({
            text: `${label}: ${(v ?? 0) >= 0 ? "" : "-"}${formatCurrencyBR(Math.abs(v ?? 0))}`,
            options: { breakLine: true, fontSize: 12, color: c(BRAND.oxford), paraSpaceAfter: 6 },
          })),
        { x: 5.2, y: 1.7, w: 4.4, h: 3, fontFace: FONT, valign: "top" },
      );
    }
    page += 1;
    addFooter(slide, page);
  }

  // 4. Posicoes: top holdings table
  {
    const slide = pptx.addSlide();
    addTitle(slide, "Posicoes");
    const top = [...input.holdings].sort((a, b) => b.marketValue - a.marketValue).slice(0, 18);
    const header = ["Ativo", "Classe", "Valor", "Peso"].map((t) => ({
      text: t, options: { bold: true, color: "FFFFFF", fill: { color: c(BRAND.oxford) }, fontFace: FONT, fontSize: 10 },
    }));
    const body = top.map((h) => [
      { text: `${h.symbol ? h.symbol + " " : ""}${h.description ?? ""}`.trim(), options: { fontFace: FONT, fontSize: 9.5, color: c(BRAND.oxford) } },
      { text: h.assetClass ?? "-", options: { fontFace: FONT, fontSize: 9.5, color: "5A6478" } },
      { text: formatCurrencyBR(h.marketValue), options: { fontFace: FONT, fontSize: 9.5, color: c(BRAND.oxford), align: "right" as const } },
      { text: formatPercentBR(input.totalMv > 0 ? (h.marketValue / input.totalMv) * 100 : 0, 1), options: { fontFace: FONT, fontSize: 9.5, color: "5A6478", align: "right" as const } },
    ]);
    slide.addTable([header, ...body], {
      x: 0.5, y: 1.2, w: 9, colW: [4.4, 2.0, 1.4, 1.2],
      border: { type: "solid", color: c(BRAND.border), pt: 0.5 }, rowH: 0.22,
    });
    if (input.holdings.length > 18) {
      slide.addText(`+ ${input.holdings.length - 18} outras posicoes. ${formatNumberBR(input.holdings.length, 0)} posicoes no total.`, {
        x: 0.5, y: 5.0, w: 9, h: 0.25, fontFace: FONT, fontSize: 8, italic: true, color: "5A6478",
      });
    }
    page += 1;
    addFooter(slide, page);
  }

  // 5. Disclaimer
  {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.12, fill: { color: c(BRAND.red) } });
    addMark(slide, 8.2, 0.35, true, 22);
    slide.addText("Disclaimer", {
      x: 0.6, y: 0.9, w: 8.8, h: 0.5, fontFace: FONT, fontSize: 20, bold: true, color: c(BRAND.oxford),
    });
    slide.addText(DISCLAIMER_BODY, {
      x: 0.6, y: 1.6, w: 8.8, h: 3.5, fontFace: FONT, fontSize: 10.5, color: c(BRAND.red), lineSpacingMultiple: 1.2,
    });
    page += 1;
  }

  const violations = lintClientText([DISCLAIMER_BODY, DISCLAIMER_FOOTER].join("\n"));
  if (violations.length > 0) {
    throw new Error(`statement content lint failed: ${violations.join("; ")}`);
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return { buffer, slideCount: page };
}
