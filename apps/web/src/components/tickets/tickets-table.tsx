"use client";

import { TICKET_STATUS_LABEL, type SlaState, type TicketPriority, type TicketStatus } from "@ls/domain";
import Link from "next/link";
import { useState } from "react";
import { PriorityBadge, SlaBadge } from "@/components/tickets/badges";
import { Button } from "@/components/ui/button";
import { bulkTicketAction } from "@/lib/actions/tickets";

export type TicketTableRow = {
  id: string;
  number: string;
  title: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignee_id: string | null;
  due_at: string | null;
  sla: SlaState;
  ageDays: number;
};

const BULK_STATUSES: TicketStatus[] = [
  "new",
  "in_progress",
  "waiting_client",
  "waiting_custodian",
  "resolved",
  "closed",
];
const BULK_PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];

const selectClass =
  "rounded-lg border border-hairline bg-white px-2 py-1.5 text-sm text-oxford focus:border-royal focus:outline-none";

export function TicketsTable({
  tickets,
  users,
  back,
  canBulk,
}: {
  tickets: TicketTableRow[];
  users: { id: string; label: string }[];
  back: string;
  canBulk: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<"assign" | "status" | "priority">("assign");
  const allSelected = tickets.length > 0 && selected.size === tickets.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const userName = new Map(users.map((u) => [u.id, u.label]));

  return (
    <form action={bulkTicketAction}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="back" value={back} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      {canBulk && selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2 text-sm">
          <span className="font-medium text-oxford">{selected.size} selected</span>
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as typeof op)}
            className={selectClass}
            aria-label="Bulk action"
          >
            <option value="assign">Assign to</option>
            <option value="status">Set status</option>
            <option value="priority">Set priority</option>
          </select>
          {op === "assign" ? (
            <select name="value" className={selectClass} defaultValue="">
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          ) : op === "status" ? (
            <select name="value" className={selectClass} defaultValue="in_progress">
              {BULK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          ) : (
            <select name="value" className={selectClass} defaultValue="medium">
              {BULK_PRIORITIES.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" size="sm">
            Apply
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-slate-500 hover:text-royal"
          >
            Clear selection
          </button>
        </div>
      ) : null}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
            {canBulk ? (
              <th className="w-8 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(tickets.map((t) => t.id)))
                  }
                  aria-label="Select all"
                />
              </th>
            ) : null}
            <th className="py-2 font-medium">Number</th>
            <th className="py-2 font-medium">Title</th>
            <th className="py-2 font-medium">Category</th>
            <th className="py-2 font-medium">Priority</th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 font-medium">Assignee</th>
            <th className="py-2 font-medium">Age</th>
            <th className="py-2 font-medium">SLA</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
              {canBulk ? (
                <td className="py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    aria-label={`Select ${t.number}`}
                  />
                </td>
              ) : null}
              <td className="py-2.5 font-mono text-xs text-slate-500">{t.number}</td>
              <td className="py-2.5">
                <Link href={`/tickets/${t.id}`} className="font-medium text-royal hover:underline">
                  {t.title}
                </Link>
              </td>
              <td className="py-2.5 capitalize text-slate-500">{t.category}</td>
              <td className="py-2.5">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="py-2.5 text-slate-500">{TICKET_STATUS_LABEL[t.status]}</td>
              <td className="py-2.5 text-slate-500">
                {t.assignee_id ? (userName.get(t.assignee_id) ?? "—") : "Unassigned"}
              </td>
              <td className="py-2.5 tabular-nums text-slate-500">
                {t.ageDays === 0 ? "today" : `${t.ageDays}d`}
              </td>
              <td className="py-2.5">
                <SlaBadge state={t.sla} dueAt={t.due_at} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </form>
  );
}
