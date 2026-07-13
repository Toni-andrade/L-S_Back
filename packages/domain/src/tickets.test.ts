import { describe, expect, it } from "vitest";
import { slaState, ticketDueAt } from "./tickets";

describe("ticketDueAt", () => {
  // Wed 2026-07-08
  const wed = new Date("2026-07-08T15:00:00Z");

  it("urgent = 1 business day", () => {
    expect(ticketDueAt(wed, "urgent").toISOString().slice(0, 10)).toBe("2026-07-09");
  });

  it("high = 3 business days, skipping the weekend", () => {
    // Wed + 3 business days = Mon
    expect(ticketDueAt(wed, "high").toISOString().slice(0, 10)).toBe("2026-07-13");
  });

  it("medium = 5 business days", () => {
    expect(ticketDueAt(wed, "medium").toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("low = 10 business days", () => {
    expect(ticketDueAt(wed, "low").toISOString().slice(0, 10)).toBe("2026-07-22");
  });
});

describe("slaState", () => {
  const due = new Date("2026-07-09T15:00:00Z");

  it("ok before the due day", () => {
    expect(slaState(due, "new", new Date("2026-07-08T10:00:00Z"))).toBe("ok");
  });

  it("due_today on the due day (before the deadline)", () => {
    expect(slaState(due, "in_progress", new Date("2026-07-09T10:00:00Z"))).toBe("due_today");
  });

  it("breached after the deadline", () => {
    expect(slaState(due, "waiting_custodian", new Date("2026-07-10T10:00:00Z"))).toBe("breached");
  });

  it("no SLA state for resolved/closed or missing due date", () => {
    expect(slaState(due, "resolved", new Date("2026-07-10T10:00:00Z"))).toBe("none");
    expect(slaState(due, "closed", new Date("2026-07-10T10:00:00Z"))).toBe("none");
    expect(slaState(null, "new")).toBe("none");
  });
});
