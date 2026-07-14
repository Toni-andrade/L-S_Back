/**
 * Client SLA assessment: measures the contact timeline against pre-established
 * cadence policies. Pure and deterministic; the app layer supplies the client's
 * last touch, open blockers and activation date.
 */

import { addBusinessDays, businessDaysBetween } from "./portfolio";
import type { RiskProfileBand } from "./portfolio";

export type SlaKind = "periodic_review" | "flag_response" | "onboarding_touch" | "request_response";

export type SlaPolicy = {
  kind: SlaKind;
  name: string;
  thresholdDays: number;
  businessDays: boolean;
  /** {} = all clients; { risk_profile: [...] } segments by profile. */
  appliesTo: { risk_profile?: string[] } | null;
};

export type ClientSlaInput = {
  riskProfile: RiskProfileBand | null;
  /** Latest of any contact or portfolio review; null if never touched. */
  lastTouchAt: Date | null;
  /** When the client became active (for onboarding_touch); null if not active. */
  activatedAt: Date | null;
  /** Oldest unacknowledged blocker flag, if any (for flag_response). */
  oldestOpenBlockerAt: Date | null;
};

export type ClientSlaState = "ok" | "due_soon" | "overdue" | "breached" | "none";

export type SlaAssessment = {
  kind: SlaKind;
  policyName: string;
  dueAt: Date | null;
  state: ClientSlaState;
  detail: string;
};

/** Days out from "due" that still counts as due-soon (amber) for review cadence. */
const DUE_SOON_WINDOW_DAYS = 14;

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Pick the review policy matching the client's profile, else the {} fallback. */
export function selectReviewPolicy(
  policies: SlaPolicy[],
  riskProfile: RiskProfileBand | null,
): SlaPolicy | null {
  const reviews = policies.filter((p) => p.kind === "periodic_review");
  if (riskProfile) {
    const match = reviews.find((p) => p.appliesTo?.risk_profile?.includes(riskProfile));
    if (match) return match;
  }
  return reviews.find((p) => !p.appliesTo?.risk_profile?.length) ?? null;
}

export function assessClientSla(
  input: ClientSlaInput,
  policies: SlaPolicy[],
  now: Date = new Date(),
): SlaAssessment[] {
  const out: SlaAssessment[] = [];

  // Periodic review (profile-aware)
  const review = selectReviewPolicy(policies, input.riskProfile);
  if (review) {
    if (!input.lastTouchAt) {
      out.push({
        kind: "periodic_review",
        policyName: review.name,
        dueAt: null,
        state: "overdue",
        detail: "No contact or review on record yet.",
      });
    } else {
      const dueAt = addDays(input.lastTouchAt, review.thresholdDays);
      const daysToDue = Math.round((dueAt.getTime() - now.getTime()) / 86_400_000);
      const state: ClientSlaState =
        daysToDue < 0 ? "overdue" : daysToDue <= DUE_SOON_WINDOW_DAYS ? "due_soon" : "ok";
      out.push({
        kind: "periodic_review",
        policyName: review.name,
        dueAt,
        state,
        detail:
          state === "overdue"
            ? `Review overdue by ${Math.abs(daysToDue)} day(s).`
            : `Next review in ${daysToDue} day(s).`,
      });
    }
  }

  // Onboarding touch
  const onboarding = policies.find((p) => p.kind === "onboarding_touch");
  if (onboarding && input.activatedAt && !input.lastTouchAt) {
    const dueAt = addDays(input.activatedAt, onboarding.thresholdDays);
    out.push({
      kind: "onboarding_touch",
      policyName: onboarding.name,
      dueAt,
      state: now.getTime() > dueAt.getTime() ? "overdue" : "due_soon",
      detail: "New client awaiting a welcome contact.",
    });
  }

  // Flag response (business-day aware)
  const flagPolicy = policies.find((p) => p.kind === "flag_response");
  if (flagPolicy && input.oldestOpenBlockerAt) {
    const age = flagPolicy.businessDays
      ? businessDaysBetween(input.oldestOpenBlockerAt, now)
      : Math.round((now.getTime() - input.oldestOpenBlockerAt.getTime()) / 86_400_000);
    const dueAt = flagPolicy.businessDays
      ? addBusinessDays(input.oldestOpenBlockerAt, flagPolicy.thresholdDays)
      : addDays(input.oldestOpenBlockerAt, flagPolicy.thresholdDays);
    out.push({
      kind: "flag_response",
      policyName: flagPolicy.name,
      dueAt,
      state: age > flagPolicy.thresholdDays ? "breached" : "due_soon",
      detail:
        age > flagPolicy.thresholdDays
          ? `Unresolved blocking flag for ${age} ${flagPolicy.businessDays ? "business " : ""}day(s).`
          : "Blocking flag within response window.",
    });
  }

  return out;
}

/** Worst state across a client's assessments, for a single badge/sort key. */
const SEVERITY: Record<ClientSlaState, number> = { breached: 4, overdue: 3, due_soon: 2, ok: 1, none: 0 };

export function worstSlaState(assessments: SlaAssessment[]): ClientSlaState {
  return assessments.reduce<ClientSlaState>(
    (worst, a) => (SEVERITY[a.state] > SEVERITY[worst] ? a.state : worst),
    "none",
  );
}
