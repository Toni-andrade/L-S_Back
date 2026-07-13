/**
 * L&S Investment Advisors brand tokens (canonical, Section 11 of the spec).
 * Consumed by the web UI (via Tailwind theme + CSS vars) and by packages/docgen.
 *
 * HARD RULE: no gold or yellow anywhere, in the UI or in generated documents.
 * Any legacy reference specifying navy #1B2A4A with gold #C9A84C is deprecated.
 */
export const BRAND = {
  /** Primary dark: headers, nav */
  oxford: "#13213C",
  /** Primary actions */
  royal: "#0C3A8F",
  /** Accents, links, highlights */
  celeste: "#4685E4",
  /** Sparingly, secondary accent. Also the remap target for any "warm" category (e.g. Cash slice, pending dots) */
  marrom: "#5D4038",
  /** Success, positive yields, inflows */
  verde: "#2D6A4F",
  /** Alerts, disclaimers, blockers, outflows */
  red: "#A4262C",
  /** Alternate red accent */
  redAlt: "#CC3333",
  /** App background */
  appBg: "#F5F7FA",
  /** Card / hairline borders */
  border: "#E6EAF0",
} as const;

/** Forbidden in every artifact; enforced by the docgen golden-file test. */
export const FORBIDDEN_COLORS = ["#C9A84C", "#FFD700", "#FFC107", "#F5C518"] as const;

/** Gauge and scale gradients go Celeste -> Royal -> Red, never through yellow. */
export const GAUGE_GRADIENT = [BRAND.celeste, BRAND.royal, BRAND.red] as const;

/** Chart series palette for the internal UI (Recharts). Warm tones use Marrom, never yellow. */
export const CHART_SERIES = [
  BRAND.royal,
  BRAND.celeste,
  BRAND.verde,
  BRAND.marrom,
  BRAND.oxford,
  BRAND.red,
] as const;

export const OFFICE_ADDRESS = "2601 S Bayshore Dr, Suite 1200, Coconut Grove, FL 33133";
export const FIRM_NAME = "L&S Investment Advisors";
