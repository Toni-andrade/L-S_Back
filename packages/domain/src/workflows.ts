/**
 * Workflow playbook domain logic: step scheduling (business-day due dates
 * snapshotted at run start) and structured per-step capture fields.
 */

import { addBusinessDays } from "./portfolio";

export type WorkflowStepStatus = "todo" | "done" | "skipped" | "blocked";

export type WorkflowStepField = {
  key: string;
  label: string;
  type: "text" | "date";
};

/** Parse a template/run step's fields column; tolerates null/garbage. */
export function parseStepFields(json: unknown): WorkflowStepField[] {
  if (!Array.isArray(json)) return [];
  const fields: WorkflowStepField[] = [];
  for (const f of json) {
    if (typeof f !== "object" || f === null) continue;
    const { key, label, type } = f as Record<string, unknown>;
    if (typeof key !== "string" || key.length === 0) continue;
    if (typeof label !== "string" || label.length === 0) continue;
    fields.push({ key, label, type: type === "date" ? "date" : "text" });
  }
  return fields;
}

/** Step deadline: run start + due_days business days (null = no deadline). */
export function stepDueAt(startedAt: Date, dueDays: number | null): Date | null {
  if (dueDays === null || !Number.isFinite(dueDays)) return null;
  return addBusinessDays(startedAt, dueDays);
}

export type WorkflowStepDueState = "none" | "ok" | "overdue";

/** Overdue is visual only, and only meaningful while the step is actionable. */
export function stepDueState(
  dueAt: Date | null,
  status: WorkflowStepStatus,
  now: Date = new Date(),
): WorkflowStepDueState {
  if (!dueAt || status === "done" || status === "skipped") return "none";
  return now.getTime() > dueAt.getTime() ? "overdue" : "ok";
}
