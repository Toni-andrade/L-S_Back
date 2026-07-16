import { describe, expect, it } from "vitest";
import { parseStepFields, stepDueAt, stepDueState } from "./workflows";

describe("parseStepFields", () => {
  it("parses well-formed field arrays", () => {
    expect(
      parseStepFields([
        { key: "approval_date", label: "Approval date", type: "date" },
        { key: "application_ref", label: "Application reference", type: "text" },
      ]),
    ).toEqual([
      { key: "approval_date", label: "Approval date", type: "date" },
      { key: "application_ref", label: "Application reference", type: "text" },
    ]);
  });

  it("defaults unknown types to text and drops malformed entries", () => {
    expect(
      parseStepFields([
        { key: "amount", label: "Amount", type: "number" },
        { key: "", label: "No key" },
        { label: "Missing key" },
        "garbage",
        null,
      ]),
    ).toEqual([{ key: "amount", label: "Amount", type: "text" }]);
  });

  it("returns [] for null / non-array input", () => {
    expect(parseStepFields(null)).toEqual([]);
    expect(parseStepFields({ key: "x" })).toEqual([]);
    expect(parseStepFields(undefined)).toEqual([]);
  });
});

describe("stepDueAt", () => {
  // Wed 2026-07-08
  const wed = new Date("2026-07-08T15:00:00Z");

  it("adds business days, skipping weekends", () => {
    expect(stepDueAt(wed, 3)?.toISOString().slice(0, 10)).toBe("2026-07-13");
    expect(stepDueAt(wed, 10)?.toISOString().slice(0, 10)).toBe("2026-07-22");
  });

  it("null due_days means no deadline", () => {
    expect(stepDueAt(wed, null)).toBeNull();
  });
});

describe("stepDueState", () => {
  const due = new Date("2026-07-10T15:00:00Z");

  it("ok before the deadline, overdue after", () => {
    expect(stepDueState(due, "todo", new Date("2026-07-09T10:00:00Z"))).toBe("ok");
    expect(stepDueState(due, "todo", new Date("2026-07-11T10:00:00Z"))).toBe("overdue");
    expect(stepDueState(due, "blocked", new Date("2026-07-11T10:00:00Z"))).toBe("overdue");
  });

  it("none for completed/skipped steps and missing deadlines", () => {
    expect(stepDueState(due, "done", new Date("2026-07-11T10:00:00Z"))).toBe("none");
    expect(stepDueState(due, "skipped", new Date("2026-07-11T10:00:00Z"))).toBe("none");
    expect(stepDueState(null, "todo")).toBe("none");
  });
});
