/**
 * Proposal PPTX + Portuguese email generation (Section 8).
 * Hard rules enforced by construction and by the golden-file test:
 * - Calibri, Brazilian number formatting, tables over pie/donut charts.
 * - No gold/yellow, no em/en dashes, no "É com satisfação", no 35.000 refs.
 * - pptxgenjs shadows via factory functions only (the library mutates them).
 */
export {
  OURO_SLIDE_MIN_WEIGHT,
  RISK_PROFILES,
  briefStrategySchema,
  proposalBriefSchema,
  validateBrief,
  type BriefStrategy,
  type CurrentPortfolio,
  type CurrentPortfolioPosition,
  type ProposalBrief,
  type StrategyInfo,
} from "./brief";
export { EMAIL_SUBJECT, generateCarta, generateEmailDraft } from "./text";
export { renderProposalPptx, type RenderResult } from "./pptx";
