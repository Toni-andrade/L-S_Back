/**
 * Flag engine (Section 9). Pure functions: (clients, holdings, config) -> Flag[].
 * Runs on every snapshot write and every proposal save. CASH_DRAG and
 * EM_CONCENTRATION evaluate on the MV of the whole scope (household or
 * household-less client); US_SITUS_BR_CLIENT is always per client.
 */

import {
  CASH_ASSET_CLASS,
  computeRiskScore,
  isOlderThanBusinessDays,
  riskBand,
  type HoldingLike,
  type RiskFactorLike,
  type RiskProfileBand,
} from "./portfolio";

export type FlagCode =
  | "CASH_DRAG"
  | "US_SITUS_BR_CLIENT"
  | "BLOCKED_ISSUER"
  | "EM_CONCENTRATION"
  | "PROFILE_MISMATCH"
  | "INDICATIVE_DATA"
  | "STALE_SNAPSHOT";

export type FlagSeverity = "info" | "warning" | "blocker";

export type Flag = {
  code: FlagCode;
  severity: FlagSeverity;
  message: string;
};

export type ClientLike = {
  id: string;
  name: string;
  isBrazilTaxpayer: boolean;
  isUsNra: boolean;
  domicileCountry: string | null;
  riskProfile: RiskProfileBand | null;
};

export type BlockedIssuerLike = {
  name: string;
  ticker: string | null;
  active: boolean;
};

/**
 * US-situs instruments create US estate-tax exposure for BR-domiciled NRAs.
 * GLD is explicitly listed in the spec; IAU and SLV are the equivalent
 * US-domiciled grantor trusts. Extend as counsel identifies more.
 */
export const US_SITUS_INSTRUMENTS = ["GLD", "IAU", "SLV"] as const;

/** UCITS alternatives named in the US_SITUS_BR_CLIENT message per the spec. */
export const UCITS_GOLD_ALTERNATIVES = ["SGLN", "IGLN"] as const;

export const FI_ASSET_CLASSES = ["IG fixed income", "HY & EM fixed income"] as const;
/** v1 deterministic proxy: the EM-risk share of the FI sleeve is the HY & EM bucket. */
export const EM_FI_ASSET_CLASS = "HY & EM fixed income";

export type FlagEngineConfig = {
  cashDragThreshold: number;
  emConcentrationThreshold: number;
  staleSnapshotBusinessDays: number;
};

export const DEFAULT_FLAG_CONFIG: FlagEngineConfig = {
  cashDragThreshold: 0.05,
  emConcentrationThreshold: 0.3,
  staleSnapshotBusinessDays: 2,
};

export type PortfolioFlagInput = {
  /** Members of the scope: one client for client scope, all members for a household. */
  clients: ClientLike[];
  /** Holdings across the scope; clientId must be set for per-client rules. */
  holdings: (HoldingLike & { clientId: string })[];
  riskFactors: RiskFactorLike[];
  blockedIssuers: BlockedIssuerLike[];
  snapshotAsOf: Date;
  today: Date;
  config?: Partial<FlagEngineConfig>;
};

export function evaluatePortfolioFlags(input: PortfolioFlagInput): Flag[] {
  const cfg = { ...DEFAULT_FLAG_CONFIG, ...input.config };
  const flags: Flag[] = [];
  const totalMv = input.holdings.reduce((s, h) => s + h.marketValue, 0);

  // CASH_DRAG: scope-level
  if (totalMv > 0) {
    const cashMv = input.holdings
      .filter((h) => h.assetClass === CASH_ASSET_CLASS)
      .reduce((s, h) => s + h.marketValue, 0);
    const cashPct = cashMv / totalMv;
    if (cashPct > cfg.cashDragThreshold) {
      flags.push({
        code: "CASH_DRAG",
        severity: "warning",
        message: `Cash & equivalents are ${(cashPct * 100).toFixed(1)}% of portfolio value (threshold ${(cfg.cashDragThreshold * 100).toFixed(0)}%). IB01 may serve as interim parking; advisor decision.`,
      });
    }
  }

  // US_SITUS_BR_CLIENT: always per client
  for (const client of input.clients) {
    const brExposed =
      client.isBrazilTaxpayer || (client.isUsNra && client.domicileCountry === "BR");
    if (!brExposed) continue;
    const usSitus = input.holdings.filter(
      (h) =>
        h.clientId === client.id &&
        h.symbol &&
        (US_SITUS_INSTRUMENTS as readonly string[]).includes(h.symbol.toUpperCase()),
    );
    if (usSitus.length > 0) {
      const symbols = [...new Set(usSitus.map((h) => h.symbol!.toUpperCase()))].join(", ");
      flags.push({
        code: "US_SITUS_BR_CLIENT",
        severity: "warning", // blocker on proposals, warning on portfolios
        message: `${client.name} holds US-situs instruments (${symbols}) with US estate-tax exposure for Brazil-domiciled NRAs. UCITS alternatives: ${UCITS_GOLD_ALTERNATIVES.join(", ")}.`,
      });
    }
  }

  // BLOCKED_ISSUER
  const activeIssuers = input.blockedIssuers.filter((b) => b.active);
  const hitIssuers = new Set<string>();
  for (const h of input.holdings) {
    for (const issuer of activeIssuers) {
      const tickerHit =
        issuer.ticker && h.symbol && h.symbol.toUpperCase() === issuer.ticker.toUpperCase();
      const nameHit =
        h.description && h.description.toLowerCase().includes(issuer.name.toLowerCase());
      if (tickerHit || nameHit) hitIssuers.add(issuer.name);
    }
  }
  for (const name of hitIssuers) {
    flags.push({
      code: "BLOCKED_ISSUER",
      severity: "warning", // blocker on proposals
      message: `Portfolio holds an instrument matching blocked issuer "${name}".`,
    });
  }

  // EM_CONCENTRATION: EM share of the fixed-income sleeve
  const fiMv = input.holdings
    .filter((h) => h.assetClass && (FI_ASSET_CLASSES as readonly string[]).includes(h.assetClass))
    .reduce((s, h) => s + h.marketValue, 0);
  if (fiMv > 0) {
    const emMv = input.holdings
      .filter((h) => h.assetClass === EM_FI_ASSET_CLASS)
      .reduce((s, h) => s + h.marketValue, 0);
    const emPct = emMv / fiMv;
    if (emPct > cfg.emConcentrationThreshold) {
      flags.push({
        code: "EM_CONCENTRATION",
        severity: "warning",
        message: `EM issuers are ${(emPct * 100).toFixed(1)}% of the fixed-income sleeve (threshold ${(cfg.emConcentrationThreshold * 100).toFixed(0)}%).`,
      });
    }
  }

  // PROFILE_MISMATCH: computed band vs assigned profile, per client
  for (const client of input.clients) {
    if (!client.riskProfile) continue;
    const clientHoldings = input.holdings.filter((h) => h.clientId === client.id);
    const risk = computeRiskScore(clientHoldings, input.riskFactors);
    if (risk && risk.band !== client.riskProfile) {
      flags.push({
        code: "PROFILE_MISMATCH",
        severity: "warning",
        message: `${client.name}: computed risk band "${risk.band}" (score ${risk.score.toFixed(0)}) differs from assigned profile "${client.riskProfile}".`,
      });
    }
  }

  // STALE_SNAPSHOT
  if (isOlderThanBusinessDays(input.snapshotAsOf, cfg.staleSnapshotBusinessDays, input.today)) {
    flags.push({
      code: "STALE_SNAPSHOT",
      severity: "warning",
      message: `Latest snapshot (${input.snapshotAsOf.toISOString().slice(0, 10)}) is older than ${cfg.staleSnapshotBusinessDays} business days.`,
    });
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Proposal flags (Sections 8 + 9). Same engine philosophy, different
// severities: BLOCKED_ISSUER and US_SITUS_BR_CLIENT are BLOCKERS on
// proposals; INDICATIVE_DATA blocks until refreshed or acknowledged with a
// reason. Blockers gate proposal approval, nothing else.
// ---------------------------------------------------------------------------

export type ProposalStrategyLike = {
  key: string;
  name: string;
  weight: number;
  /** Instrument symbols the strategy holds (from strategies.instruments). */
  symbols: string[];
  /** Where the return figures came from: library metrics or manual entry. */
  returnSource: "library" | "manual";
  /** As-of date for manually entered figures (required; missing = flag). */
  asOfDate: string | null;
};

export type ProposalFlagInput = {
  /** Null for prospect proposals with no client row yet. */
  client: ClientLike | null;
  riskProfile: RiskProfileBand;
  /** Risk profile of the selected model, when one was picked. */
  modelRiskProfile: RiskProfileBand | null;
  strategies: ProposalStrategyLike[];
  blockedIssuers: BlockedIssuerLike[];
  today: Date;
  /** Figures older than this many business days are indicative (default 5). */
  indicativeDataBusinessDays?: number;
};

export function evaluateProposalFlags(input: ProposalFlagInput): Flag[] {
  const flags: Flag[] = [];
  const staleDays = input.indicativeDataBusinessDays ?? 5;

  const allSymbols = input.strategies.flatMap((s) =>
    s.symbols.map((sym) => ({ strategy: s, symbol: sym.toUpperCase() })),
  );

  // US_SITUS_BR_CLIENT: blocker on proposals
  const brExposed =
    input.client &&
    (input.client.isBrazilTaxpayer ||
      (input.client.isUsNra && input.client.domicileCountry === "BR"));
  if (brExposed) {
    const hits = allSymbols.filter((e) =>
      (US_SITUS_INSTRUMENTS as readonly string[]).includes(e.symbol),
    );
    if (hits.length > 0) {
      const symbols = [...new Set(hits.map((h) => h.symbol))].join(", ");
      flags.push({
        code: "US_SITUS_BR_CLIENT",
        severity: "blocker",
        message: `Proposal includes US-situs instruments (${symbols}) for a Brazil-exposed client, creating US estate-tax exposure. UCITS alternatives: ${UCITS_GOLD_ALTERNATIVES.join(", ")}.`,
      });
    }
  }

  // BLOCKED_ISSUER: blocker on proposals
  const activeIssuers = input.blockedIssuers.filter((b) => b.active);
  const hitIssuers = new Set<string>();
  for (const entry of allSymbols) {
    for (const issuer of activeIssuers) {
      if (issuer.ticker && entry.symbol === issuer.ticker.toUpperCase()) {
        hitIssuers.add(issuer.name);
      }
    }
  }
  for (const strategy of input.strategies) {
    for (const issuer of activeIssuers) {
      if (strategy.name.toLowerCase().includes(issuer.name.toLowerCase())) {
        hitIssuers.add(issuer.name);
      }
    }
  }
  for (const name of hitIssuers) {
    flags.push({
      code: "BLOCKED_ISSUER",
      severity: "blocker",
      message: `Proposal includes an instrument matching blocked issuer "${name}".`,
    });
  }

  // INDICATIVE_DATA: manual figures need a source date within N business days
  for (const s of input.strategies) {
    if (s.returnSource !== "manual") continue;
    if (!s.asOfDate) {
      flags.push({
        code: "INDICATIVE_DATA",
        severity: "blocker",
        message: `${s.name}: manually entered figures have no source date. Add an as-of date or acknowledge with a reason.`,
      });
    } else if (isOlderThanBusinessDays(new Date(s.asOfDate), staleDays, input.today)) {
      flags.push({
        code: "INDICATIVE_DATA",
        severity: "blocker",
        message: `${s.name}: figures dated ${s.asOfDate} are older than ${staleDays} business days. Refresh or acknowledge with a reason.`,
      });
    }
  }

  // PROFILE_MISMATCH: brief profile vs selected model profile
  if (input.modelRiskProfile && input.modelRiskProfile !== input.riskProfile) {
    flags.push({
      code: "PROFILE_MISMATCH",
      severity: "warning",
      message: `Brief risk profile "${input.riskProfile}" differs from the selected model's profile "${input.modelRiskProfile}".`,
    });
  }

  return flags;
}

export { riskBand };
