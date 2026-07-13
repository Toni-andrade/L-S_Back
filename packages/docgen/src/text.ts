/**
 * Portuguese client text: Carta ao Cliente and the email draft (Sections 8.3
 * and 8.4). Deterministic templates, no invented numbers: every figure comes
 * from the brief or the strategy library. Client text never uses em/en dashes,
 * never opens with "É com satisfação", and the email never opens with
 * "Prezado(a)". Everything is linted before it ships.
 */

import { FIRM_NAME, formatCurrencyBR, lintClientText } from "@ls/domain";
import type { ProposalBrief, StrategyInfo } from "./brief";

const PROFILE_LABEL: Record<ProposalBrief["riskProfile"], string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  agressivo: "Agressivo",
};

/** Carta ao Cliente: 3 warm, professional paragraphs, signed by the team. */
export function generateCarta(brief: ProposalBrief): string {
  const n = brief.strategies.length;
  const paragraphs = [
    `${brief.salutation},`,
    `Agradecemos a confiança e o tempo dedicado às nossas conversas. Preparamos esta proposta de investimento pensada para o seu momento e para os seus objetivos, com uma alocação alinhada ao perfil ${PROFILE_LABEL[brief.riskProfile]} e ao horizonte que definimos juntos.`,
    `A estrutura sugerida combina ${n} ${n === 1 ? "estratégia" : "estratégias complementares"}, buscando equilíbrio entre crescimento, renda e proteção. Cada componente foi selecionado com critérios claros de risco, liquidez e consistência, e os detalhes de cada estratégia estão nas páginas seguintes.`,
    `Estamos à disposição para revisar qualquer ponto, ajustar a alocação e definir os próximos passos no seu ritmo. Será um prazer acompanhar essa jornada ao seu lado.`,
    `Equipe ${FIRM_NAME}`,
  ];
  return assertClean(paragraphs.join("\n\n"), "carta");
}

/** One human sentence per strategy on why it fits (Section 8.4). */
const STRATEGY_SENTENCES: Record<string, string> = {
  BOND: "A carteira de bonds em ETFs UCITS traz renda previsível, qualidade de crédito e eficiência fiscal para a sua estrutura.",
  CASH_SIGNAL:
    "O American Dream Cash Signal ajuda a proteger o portfólio nos momentos de maior estresse, seguindo uma metodologia disciplinada de quatro fases.",
  ENERGY:
    "A estratégia de energia e infraestrutura nos EUA captura a demanda estrutural do setor com uma composição em três camadas.",
  OURO: "A posição em ouro atua como proteção e diversificação para o conjunto da carteira.",
};

function strategySentence(info: StrategyInfo): string {
  return (
    STRATEGY_SENTENCES[info.key] ??
    `A estratégia ${info.name} complementa a alocação com foco em consistência e controle de risco.`
  );
}

export const EMAIL_SUBJECT = `Proposta de Investimento Personalizada | ${FIRM_NAME}`;

/** Email draft shown for copy-paste; the platform never sends email. */
export function generateEmailDraft(brief: ProposalBrief, library: StrategyInfo[]): string {
  const byKey = new Map(library.map((s) => [s.key, s]));
  const sentences = brief.strategies
    .map((row) => byKey.get(row.key))
    .filter((info): info is StrategyInfo => Boolean(info))
    .map((info) => strategySentence(info));

  const body = [
    `Assunto: ${EMAIL_SUBJECT}`,
    `Olá ${brief.salutation},`,
    `Conforme conversamos, segue a proposta de investimento preparada para você, com referência a ${brief.monthYear} e valor total de ${formatCurrencyBR(brief.totalAum)}.`,
    sentences.join(" "),
    `Fico à disposição para conversarmos sobre os detalhes e definirmos os próximos passos.`,
    `Abraço,\nAntonio · ${FIRM_NAME}`,
  ].join("\n\n");
  return assertClean(body, "email draft");
}

/** Content lint (Section 10): generation fails on any violation. */
function assertClean(text: string, artifact: string): string {
  const violations = lintClientText(text);
  if (violations.length > 0) {
    throw new Error(`content lint failed for ${artifact}: ${violations.join("; ")}`);
  }
  if (/prezado\(a\)|^prezado/im.test(text)) {
    throw new Error(`content lint failed for ${artifact}: opens with "Prezado(a)"`);
  }
  return text;
}
