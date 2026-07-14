import { describe, expect, it } from "vitest";
import { assessClientSla, selectReviewPolicy, worstSlaState, type SlaPolicy } from "./sla";

const POLICIES: SlaPolicy[] = [
  { kind: "periodic_review", name: "Agressivo", thresholdDays: 60, businessDays: false, appliesTo: { risk_profile: ["agressivo"] } },
  { kind: "periodic_review", name: "Moderado", thresholdDays: 90, businessDays: false, appliesTo: { risk_profile: ["moderado"] } },
  { kind: "periodic_review", name: "Conservador", thresholdDays: 180, businessDays: false, appliesTo: { risk_profile: ["conservador"] } },
  { kind: "periodic_review", name: "Default", thresholdDays: 90, businessDays: false, appliesTo: {} },
  { kind: "onboarding_touch", name: "Onboarding", thresholdDays: 7, businessDays: false, appliesTo: {} },
  { kind: "flag_response", name: "Flag response", thresholdDays: 5, businessDays: true, appliesTo: {} },
];

const now = new Date("2026-07-14T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("selectReviewPolicy", () => {
  it("matches by risk profile, falls back to default", () => {
    expect(selectReviewPolicy(POLICIES, "agressivo")?.thresholdDays).toBe(60);
    expect(selectReviewPolicy(POLICIES, "conservador")?.thresholdDays).toBe(180);
    expect(selectReviewPolicy(POLICIES, null)?.name).toBe("Default");
  });
});

describe("assessClientSla - periodic review", () => {
  it("overdue when never contacted", () => {
    const a = assessClientSla(
      { riskProfile: "moderado", lastTouchAt: null, activatedAt: daysAgo(200), oldestOpenBlockerAt: null },
      POLICIES,
      now,
    );
    expect(a.find((x) => x.kind === "periodic_review")?.state).toBe("overdue");
  });

  it("agressivo cadence is 60 days: touched 70d ago = overdue", () => {
    const a = assessClientSla(
      { riskProfile: "agressivo", lastTouchAt: daysAgo(70), activatedAt: daysAgo(400), oldestOpenBlockerAt: null },
      POLICIES,
      now,
    );
    expect(a.find((x) => x.kind === "periodic_review")?.state).toBe("overdue");
  });

  it("conservador cadence is 180 days: touched 70d ago = ok", () => {
    const a = assessClientSla(
      { riskProfile: "conservador", lastTouchAt: daysAgo(70), activatedAt: daysAgo(400), oldestOpenBlockerAt: null },
      POLICIES,
      now,
    );
    expect(a.find((x) => x.kind === "periodic_review")?.state).toBe("ok");
  });

  it("due_soon within the 14-day window", () => {
    // moderado 90d, touched 80d ago -> due in 10 days
    const a = assessClientSla(
      { riskProfile: "moderado", lastTouchAt: daysAgo(80), activatedAt: daysAgo(400), oldestOpenBlockerAt: null },
      POLICIES,
      now,
    );
    expect(a.find((x) => x.kind === "periodic_review")?.state).toBe("due_soon");
  });
});

describe("assessClientSla - onboarding + flags", () => {
  it("onboarding overdue for a new active client never contacted", () => {
    const a = assessClientSla(
      { riskProfile: "moderado", lastTouchAt: null, activatedAt: daysAgo(10), oldestOpenBlockerAt: null },
      POLICIES,
      now,
    );
    expect(a.find((x) => x.kind === "onboarding_touch")?.state).toBe("overdue");
  });

  it("flag response breached past 5 business days", () => {
    const a = assessClientSla(
      { riskProfile: "moderado", lastTouchAt: daysAgo(1), activatedAt: daysAgo(400), oldestOpenBlockerAt: daysAgo(12) },
      POLICIES,
      now,
    );
    expect(a.find((x) => x.kind === "flag_response")?.state).toBe("breached");
  });
});

describe("worstSlaState", () => {
  it("returns the most severe", () => {
    const a = assessClientSla(
      { riskProfile: "moderado", lastTouchAt: daysAgo(1), activatedAt: daysAgo(400), oldestOpenBlockerAt: daysAgo(12) },
      POLICIES,
      now,
    );
    expect(worstSlaState(a)).toBe("breached");
  });
});
