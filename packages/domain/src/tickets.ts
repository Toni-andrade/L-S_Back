/**
 * Ticket domain logic (Section 7): SLA defaults by priority and breach state.
 * No automation beyond visual state in v1.
 */

import { addBusinessDays } from "./portfolio";

export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketStatus =
  | "new"
  | "in_progress"
  | "waiting_client"
  | "waiting_custodian"
  | "resolved"
  | "closed";
export type TicketCategory =
  | "operations"
  | "trading"
  | "reporting"
  | "tax"
  | "onboarding"
  | "tech"
  | "other";

export const TICKET_PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
export const TICKET_CATEGORIES: TicketCategory[] = [
  "operations",
  "trading",
  "reporting",
  "tax",
  "onboarding",
  "tech",
  "other",
];
export const TICKET_STATUSES: TicketStatus[] = [
  "new",
  "in_progress",
  "waiting_client",
  "waiting_custodian",
  "resolved",
  "closed",
];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  waiting_client: "Waiting on Client",
  waiting_custodian: "Waiting on Custodian",
  resolved: "Resolved",
  closed: "Closed",
};

export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "new",
  "in_progress",
  "waiting_client",
  "waiting_custodian",
];

/** SLA defaults in business days: urgent 1, high 3, medium 5, low 10. */
export const SLA_BUSINESS_DAYS: Record<TicketPriority, number> = {
  urgent: 1,
  high: 3,
  medium: 5,
  low: 10,
};

export function ticketDueAt(createdAt: Date, priority: TicketPriority): Date {
  return addBusinessDays(createdAt, SLA_BUSINESS_DAYS[priority]);
}

/** Whole days elapsed since a timestamp (floor; never negative). */
export function ageDays(createdAt: Date, now: Date = new Date()): number {
  const ms = now.getTime() - createdAt.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * True when an open ticket's SLA deadline falls within the next `hours`
 * hours (not yet breached). Feeds the ops-queue breach forecast.
 */
export function slaDueWithin(
  dueAt: Date | null,
  status: TicketStatus,
  hours: number,
  now: Date = new Date(),
): boolean {
  if (!dueAt || status === "resolved" || status === "closed") return false;
  const delta = dueAt.getTime() - now.getTime();
  return delta > 0 && delta <= hours * 3_600_000;
}

export type SlaState = "none" | "ok" | "due_today" | "breached";

/** Breach state is visual only; resolved/closed tickets have no SLA state. */
export function slaState(
  dueAt: Date | null,
  status: TicketStatus,
  now: Date = new Date(),
): SlaState {
  if (!dueAt || status === "resolved" || status === "closed") return "none";
  if (now.getTime() > dueAt.getTime()) return "breached";
  const sameDay =
    now.getFullYear() === dueAt.getFullYear() &&
    now.getMonth() === dueAt.getMonth() &&
    now.getDate() === dueAt.getDate();
  return sameDay ? "due_today" : "ok";
}
