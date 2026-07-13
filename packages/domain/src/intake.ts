/**
 * Intake pipeline domain logic (Section 5): stage model, the website field
 * mapper (single config object; exact field names pending Antonio, Open Item 2)
 * and a minimal CSV parser for the manual import fallback.
 */

export type IntakeStatus =
  | "new_lead"
  | "discovery_scheduled"
  | "proposal_in_progress"
  | "pending_onboarding"
  | "converted"
  | "discarded";

/** Active pipeline stages in board order; converted/discarded are terminal. */
export const INTAKE_STAGES: IntakeStatus[] = [
  "new_lead",
  "discovery_scheduled",
  "proposal_in_progress",
  "pending_onboarding",
];

export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  new_lead: "New Leads",
  discovery_scheduled: "Discovery Scheduled",
  proposal_in_progress: "Proposal In Progress",
  pending_onboarding: "Pending Onboarding",
  converted: "Converted",
  discarded: "Discarded",
};

export type IntakeCanonicalFields = {
  name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  investable_range: string | null;
  message: string | null;
};

/**
 * Field mapper config: canonical field -> candidate source keys, tried in
 * order. ASSUMPTION FLAG (Open Item 2): the website's exact field names are
 * unconfirmed; the aliases below are guesses to be replaced by Antonio's
 * confirmed list. Everything raw is stored verbatim regardless.
 */
export type IntakeFieldMap = Record<keyof IntakeCanonicalFields, string[]>;

export function mapIntakePayload(
  raw: Record<string, unknown>,
  fieldMap: IntakeFieldMap,
): IntakeCanonicalFields {
  const pick = (aliases: string[]): string | null => {
    for (const key of aliases) {
      const v = raw[key];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
      if (typeof v === "number") return String(v);
    }
    return null;
  };
  return {
    name: pick(fieldMap.name),
    email: pick(fieldMap.email)?.toLowerCase() ?? null,
    phone: pick(fieldMap.phone),
    country: pick(fieldMap.country),
    investable_range: pick(fieldMap.investable_range),
    message: pick(fieldMap.message),
  };
}

/**
 * Minimal CSV parser for the manual import fallback: header row + records,
 * handles double-quoted fields with embedded commas and "" escapes. Not a
 * general-purpose parser; good enough for pasted lead exports.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  const [header, ...records] = rows;
  if (!header) return [];
  return records.map((r) =>
    Object.fromEntries(header.map((h, idx) => [h.trim(), (r[idx] ?? "").trim()])),
  );
}
