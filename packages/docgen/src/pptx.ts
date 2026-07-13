/**
 * Proposal PPTX renderer (Section 8.3). pptxgenjs, Calibri, Portuguese,
 * Brazilian number formatting, tables over charts. Slide order:
 * Capa, Agenda, Carta ao Cliente, Resumo da Alocação, one section per
 * strategy, Perfil de Risco & Próximos Passos, Disclaimer.
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
import {
  OURO_SLIDE_MIN_WEIGHT,
  validateBrief,
  type ProposalBrief,
  type StrategyInfo,
} from "./brief";
import { generateCarta } from "./text";

const FONT = "Calibri";
const c = (hex: string) => hex.replace("#", "");

/**
 * pptxgenjs mutates shadow option objects in place: always build fresh
 * objects via this factory, never share a constant.
 */
function cardShadow(): PptxGenJS.ShadowProps {
  return { type: "outer", color: "1A1A1A", blur: 4, offset: 2, angle: 90, opacity: 0.25 };
}

const DISCLAIMER_FOOTER =
  "Este material tem caráter exclusivamente informativo e não constitui oferta ou recomendação. Rentabilidade passada não garante resultados futuros.";

const DISCLAIMER_BODY = [
  `Este documento foi preparado por ${FIRM_NAME}, consultoria de investimentos registrada na SEC, exclusivamente para o destinatário indicado, e não deve ser reproduzido ou distribuído sem autorização.`,
  "As informações aqui contidas têm caráter informativo e não constituem oferta, solicitação ou recomendação individualizada de compra ou venda de qualquer ativo. Métricas identificadas como simulação retroativa (backtest) são hipotéticas, não representam resultados reais e não garantem retornos futuros.",
  "Investimentos envolvem riscos, incluindo a possível perda do capital investido. Questões tributárias devem ser avaliadas com assessoria especializada, considerando a legislação vigente aplicável ao investidor.",
].join("\n\n");

const PROFILE_LABEL: Record<ProposalBrief["riskProfile"], string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  agressivo: "Agressivo",
};

/** Typographic "L&S" mark: Times New Roman, italic celeste ampersand. Never gold. */
function addMark(
  slide: PptxGenJS.Slide,
  opts: { x: number; y: number; dark: boolean; size?: number },
) {
  const color = opts.dark ? c(BRAND.oxford) : "FFFFFF";
  slide.addText(
    [
      { text: "L", options: { color, fontFace: "Times New Roman", bold: true } },
      {
        text: "&",
        options: { color: c(BRAND.celeste), fontFace: "Times New Roman", italic: true, bold: true },
      },
      { text: "S", options: { color, fontFace: "Times New Roman", bold: true } },
    ],
    { x: opts.x, y: opts.y, w: 1.6, h: 0.6, fontSize: opts.size ?? 28 },
  );
}

/** Content-slide footer: address left, red disclaimer right, page number center. */
function addFooter(slide: PptxGenJS.Slide, pageNumber: number) {
  slide.addText(OFFICE_ADDRESS, {
    x: 0.35,
    y: 5.25,
    w: 3.6,
    h: 0.3,
    fontFace: FONT,
    fontSize: 7.5,
    color: "8A93A6",
  });
  slide.addText(String(pageNumber), {
    x: 4.7,
    y: 5.25,
    w: 0.6,
    h: 0.3,
    align: "center",
    fontFace: FONT,
    fontSize: 8,
    color: "8A93A6",
  });
  slide.addText(DISCLAIMER_FOOTER, {
    x: 5.4,
    y: 5.25,
    w: 4.25,
    h: 0.3,
    align: "right",
    fontFace: FONT,
    fontSize: 6.5,
    color: c(BRAND.red),
  });
}

function addTitle(slide: PptxGenJS.Slide, title: string) {
  slide.addText(title, {
    x: 0.35,
    y: 0.25,
    w: 9.3,
    h: 0.5,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: c(BRAND.oxford),
  });
  slide.addShape("rect", { x: 0.38, y: 0.78, w: 1.2, h: 0.035, fill: { color: c(BRAND.royal) } });
}

export type RenderResult = {
  buffer: Buffer;
  carta: string;
  slideCount: number;
};

export async function renderProposalPptx(
  brief: ProposalBrief,
  library: StrategyInfo[],
): Promise<RenderResult> {
  const errors = validateBrief(brief, library);
  if (errors.length > 0) {
    throw new Error(`brief validation failed: ${errors.join("; ")}`);
  }

  const byKey = new Map(library.map((s) => [s.key, s]));
  const rows = brief.strategies.map((row) => ({
    row,
    info: byKey.get(row.key)!,
  }));
  const sectionRows = rows.filter(
    ({ row }) => !(row.key === "OURO" && row.weight < OURO_SLIDE_MIN_WEIGHT),
  );
  const carta = generateCarta(brief);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "LS_16x9", width: 10, height: 5.625 });
  pptx.layout = "LS_16x9";
  let page = 0;

  // 1. Capa (dark)
  {
    const slide = pptx.addSlide();
    slide.background = { color: c(BRAND.oxford) };
    addMark(slide, { x: 0.5, y: 0.45, dark: false, size: 34 });
    slide.addText("Proposta de Investimento", {
      x: 0.5,
      y: 2.1,
      w: 9,
      h: 0.8,
      fontFace: FONT,
      fontSize: 34,
      bold: true,
      color: "FFFFFF",
    });
    slide.addText(brief.clientName, {
      x: 0.5,
      y: 2.95,
      w: 9,
      h: 0.5,
      fontFace: FONT,
      fontSize: 20,
      color: c(BRAND.celeste),
    });
    slide.addText(brief.monthYear, {
      x: 0.5,
      y: 4.7,
      w: 9,
      h: 0.4,
      fontFace: FONT,
      fontSize: 13,
      color: "B9C2D4",
    });
    page += 1;
  }

  // 2. Agenda
  {
    const slide = pptx.addSlide();
    addTitle(slide, "Agenda");
    const items = [
      "Carta ao Cliente",
      "Resumo da Alocação",
      ...sectionRows.map(({ info }) => info.name),
      "Perfil de Risco e Próximos Passos",
    ];
    slide.addText(
      items.map((text, i) => ({
        text: `${i + 1}.  ${text}`,
        options: { breakLine: true, paraSpaceAfter: 8 },
      })),
      { x: 0.6, y: 1.15, w: 8.6, h: 3.7, fontFace: FONT, fontSize: 15, color: c(BRAND.oxford) },
    );
    page += 1;
    addFooter(slide, page);
  }

  // 3. Carta ao Cliente
  {
    const slide = pptx.addSlide();
    addTitle(slide, "Carta ao Cliente");
    slide.addText(carta, {
      x: 0.6,
      y: 1.05,
      w: 8.8,
      h: 3.9,
      fontFace: FONT,
      fontSize: 12,
      color: c(BRAND.oxford),
      lineSpacingMultiple: 1.15,
    });
    page += 1;
    addFooter(slide, page);
  }

  // 4. Resumo da Alocação: TABLE, never a pie or donut chart.
  {
    const slide = pptx.addSlide();
    addTitle(slide, "Resumo da Alocação");
    slide.addText(formatCurrencyBR(brief.totalAum), {
      x: 6.4,
      y: 1.0,
      w: 3.2,
      h: 0.55,
      align: "right",
      fontFace: FONT,
      fontSize: 26,
      bold: true,
      color: c(BRAND.royal),
    });
    slide.addText(`Perfil ${PROFILE_LABEL[brief.riskProfile]}`, {
      x: 6.4,
      y: 1.55,
      w: 3.2,
      h: 0.35,
      align: "right",
      fontFace: FONT,
      fontSize: 12,
      bold: true,
      color: "FFFFFF",
      fill: { color: c(BRAND.royal) },
    });
    const header = ["Estratégia", "Peso", "Risco", "Fonte de Retorno"].map((t) => ({
      text: t,
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: c(BRAND.oxford) },
        fontFace: FONT,
        fontSize: 11,
      },
    }));
    const body = rows.map(({ row, info }) => [
      { text: info.name, options: { fontFace: FONT, fontSize: 11, color: c(BRAND.oxford) } },
      {
        text: formatPercentBR(row.weight, row.weight % 1 === 0 ? 0 : 1),
        options: { fontFace: FONT, fontSize: 11, color: c(BRAND.oxford), align: "right" as const },
      },
      {
        text: row.riskLabel ?? info.riskLabel ?? "n/d",
        options: { fontFace: FONT, fontSize: 11, color: c(BRAND.oxford) },
      },
      {
        text:
          row.returnSource === "library"
            ? `Biblioteca de estratégias${info.metrics?.period ? `, ${info.metrics.period}` : ""}`
            : `Dados indicativos${row.asOfDate ? `, ${row.asOfDate}` : ""}`,
        options: { fontFace: FONT, fontSize: 10, color: "5A6478" },
      },
    ]);
    slide.addTable([header, ...body], {
      x: 0.6,
      y: 2.0,
      w: 8.8,
      colW: [3.4, 1.1, 1.7, 2.6],
      border: { type: "solid", color: c(BRAND.border), pt: 0.5 },
      rowH: 0.32,
    });
    page += 1;
    addFooter(slide, page);
  }

  // 5. One section per strategy (OURO only at >= 15%)
  for (const { row, info } of sectionRows) {
    const slide = pptx.addSlide();
    addTitle(slide, info.name);
    slide.addText(
      `Peso na alocação: ${formatPercentBR(row.weight, row.weight % 1 === 0 ? 0 : 1)}`,
      { x: 0.6, y: 0.95, w: 5, h: 0.35, fontFace: FONT, fontSize: 12, color: c(BRAND.royal), bold: true },
    );
    if (info.description) {
      slide.addText(info.description, {
        x: 0.6,
        y: 1.4,
        w: 8.8,
        h: 1.0,
        fontFace: FONT,
        fontSize: 12,
        color: c(BRAND.oxford),
      });
    }
    const m = info.metrics;
    if (m && (m.cagr !== undefined || m.sharpe !== undefined)) {
      const stats: [string, string][] = [];
      if (m.cagr !== undefined) stats.push(["CAGR", formatPercentBR(m.cagr)]);
      if (m.vol !== undefined) stats.push(["Volatilidade", formatPercentBR(m.vol)]);
      if (m.max_dd !== undefined) stats.push(["Max Drawdown", formatPercentBR(m.max_dd)]);
      if (m.sharpe !== undefined) stats.push(["Sharpe", formatNumberBR(m.sharpe)]);
      stats.forEach(([label, value], i) => {
        const x = 0.6 + i * 2.25;
        slide.addShape("roundRect", {
          x,
          y: 2.7,
          w: 2.05,
          h: 1.1,
          fill: { color: "FFFFFF" },
          line: { color: c(BRAND.border), width: 1 },
          shadow: cardShadow(),
          rectRadius: 0.08,
        });
        slide.addText(label, {
          x,
          y: 2.8,
          w: 2.05,
          h: 0.3,
          align: "center",
          fontFace: FONT,
          fontSize: 10,
          color: "5A6478",
        });
        slide.addText(value, {
          x,
          y: 3.1,
          w: 2.05,
          h: 0.5,
          align: "center",
          fontFace: FONT,
          fontSize: 18,
          bold: true,
          color: value.startsWith("-") ? c(BRAND.red) : c(BRAND.royal),
        });
      });
      slide.addText(
        `Métricas de simulação retroativa (backtest), ${m.period ?? "Jan 2008 a Dez 2025"}. Resultados simulados não representam retornos reais e não garantem resultados futuros.`,
        { x: 0.6, y: 4.05, w: 8.8, h: 0.5, fontFace: FONT, fontSize: 9, italic: true, color: "5A6478" },
      );
    }
    page += 1;
    addFooter(slide, page);
  }

  // 6. Perfil de Risco & Próximos Passos
  {
    const slide = pptx.addSlide();
    addTitle(slide, "Perfil de Risco e Próximos Passos");
    // Risk spectrum: exactly three levels, gradient Celeste -> Royal -> Red.
    const levels: [string, string][] = [
      ["Conservador", c(BRAND.celeste)],
      ["Moderado", c(BRAND.royal)],
      ["Agressivo", c(BRAND.red)],
    ];
    levels.forEach(([label, color], i) => {
      const selected = PROFILE_LABEL[brief.riskProfile] === label;
      const x = 0.6 + i * 3.0;
      slide.addShape("roundRect", {
        x,
        y: 1.15,
        w: 2.8,
        h: 0.7,
        fill: { color: selected ? color : "FFFFFF" },
        line: { color, width: selected ? 0 : 1.5 },
        rectRadius: 0.08,
      });
      slide.addText(label, {
        x,
        y: 1.15,
        w: 2.8,
        h: 0.7,
        align: "center",
        valign: "middle",
        fontFace: FONT,
        fontSize: 13,
        bold: selected,
        color: selected ? "FFFFFF" : color,
      });
    });
    // Exactly two cards, in this order.
    const cards: [string, string][] = [
      [
        "Início da Alocação",
        "Após a sua aprovação, iniciamos a implementação da carteira de forma gradual, respeitando liquidez e condições de mercado.",
      ],
      [
        "Revisão Periódica",
        "Acompanhamos a alocação continuamente e revisamos a estratégia com você em ciclos regulares, ajustando quando necessário.",
      ],
    ];
    cards.forEach(([title, body], i) => {
      const x = 0.6 + i * 4.55;
      slide.addShape("roundRect", {
        x,
        y: 2.35,
        w: 4.3,
        h: 2.0,
        fill: { color: "FFFFFF" },
        line: { color: c(BRAND.border), width: 1 },
        shadow: cardShadow(),
        rectRadius: 0.08,
      });
      slide.addText(title, {
        x: x + 0.25,
        y: 2.55,
        w: 3.8,
        h: 0.4,
        fontFace: FONT,
        fontSize: 14,
        bold: true,
        color: c(BRAND.royal),
      });
      slide.addText(body, {
        x: x + 0.25,
        y: 3.0,
        w: 3.8,
        h: 1.2,
        fontFace: FONT,
        fontSize: 11,
        color: c(BRAND.oxford),
      });
    });
    page += 1;
    addFooter(slide, page);
  }

  // 7. Disclaimer: white, red top accent, dark mark top-right, red body.
  {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.12, fill: { color: c(BRAND.red) } });
    addMark(slide, { x: 8.2, y: 0.35, dark: true, size: 22 });
    slide.addText("Disclaimer", {
      x: 0.6,
      y: 0.9,
      w: 8.8,
      h: 0.5,
      fontFace: FONT,
      fontSize: 20,
      bold: true,
      color: c(BRAND.oxford),
    });
    slide.addText(DISCLAIMER_BODY, {
      x: 0.6,
      y: 1.6,
      w: 8.8,
      h: 3.5,
      fontFace: FONT,
      fontSize: 10.5,
      color: c(BRAND.red),
      lineSpacingMultiple: 1.2,
    });
    page += 1;
  }

  // Final content lint across everything we authored.
  const authored = [carta, DISCLAIMER_BODY, DISCLAIMER_FOOTER].join("\n");
  const violations = lintClientText(authored);
  if (violations.length > 0) {
    throw new Error(`content lint failed for deck text: ${violations.join("; ")}`);
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return { buffer, carta, slideCount: page };
}
