/**
 * Number formatting. Two worlds, never mixed:
 * - Internal UI: en-US formatting.
 * - Generated client artifacts (PPTX, email): Brazilian formatting,
 *   currency like `$500.000`, percentages like `8,23%`.
 */

const BR_GROUP = /\B(?=(\d{3})+(?!\d))/g;

/** Brazilian client-artifact currency: `$500.000` (0 decimals) or `$500.000,50`. */
export function formatCurrencyBR(value: number, decimals = 0): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [intPart, fracPart] = fixed.split(".");
  const grouped = (intPart ?? "0").replace(BR_GROUP, ".");
  return fracPart ? `${sign}$${grouped},${fracPart}` : `${sign}$${grouped}`;
}

/** Brazilian client-artifact percentage: `8,23%`, `-9,24%`. */
export function formatPercentBR(value: number, decimals = 2): string {
  return `${value.toFixed(decimals).replace(".", ",")}%`;
}

/** Brazilian plain number with comma decimal: `1,00`, `19,95`. */
export function formatNumberBR(value: number, decimals = 2): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const [intPart, fracPart] = abs.toFixed(decimals).split(".");
  const grouped = (intPart ?? "0").replace(BR_GROUP, ".");
  return fracPart ? `${sign}${grouped},${fracPart}` : `${sign}${grouped}`;
}

/** Internal UI currency, en-US: `$1,234,567.89`. */
export function formatCurrencyUS(value: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Internal UI percentage, en-US: `8.23%`. */
export function formatPercentUS(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/** Mask an account number to its last 4 characters on ingest. Never store or log the full number. */
export function maskAccountNumber(accountNumber: string): string {
  const trimmed = accountNumber.replace(/\s/g, "");
  const last4 = trimmed.slice(-4);
  return `••••${last4}`;
}

/**
 * Client-facing text may not contain em/en dashes (use commas) and may not
 * reference the repealed BRL 35.000 monthly CGT exemption (Lei 14.754/2023).
 * Returns the list of violations found; empty array means clean.
 */
export function lintClientText(text: string): string[] {
  const violations: string[] = [];
  if (/[–—]/.test(text)) violations.push("contains em/en dash");
  if (/35\.000|35 mil|isenção mensal/i.test(text)) {
    violations.push("references repealed BRL 35.000 monthly exemption (Lei 14.754/2023)");
  }
  if (/É com satisfação/i.test(text)) violations.push('opens with forbidden "É com satisfação"');
  return violations;
}
