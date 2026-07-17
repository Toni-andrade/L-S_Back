"use client";

import {
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  type SlaState,
  type TicketPriority,
  type TicketStatus,
} from "@ls/domain";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PriorityBadge, SlaBadge } from "@/components/tickets/badges";
import { Button } from "@/components/ui/button";
import {
  assignTicket,
  bulkTicketAction,
  changeTicketPriority,
  updateTicketStatus,
} from "@/lib/actions/tickets";

export type WorkspaceRow = {
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

const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];

const selectClass =
  "rounded-lg border border-hairline bg-white px-2 py-1 text-xs text-oxford focus:border-royal focus:outline-none";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

export function TicketsWorkspace({
  tickets,
  users,
  back,
  canBulk,
  mode,
}: {
  tickets: WorkspaceRow[];
  users: { id: string; label: string }[];
  back: string;
  canBulk: boolean;
  mode: "list" | "board";
}) {
  const [rows, setRows] = useState(tickets);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<"assign" | "status" | "priority">("assign");
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Server revalidation delivers fresh props; resync local optimistic state.
  useEffect(() => setRows(tickets), [tickets]);

  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.label])), [users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (t) =>
        t.number.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.assignee_id ? (userName.get(t.assignee_id) ?? "").toLowerCase().includes(q) : false),
    );
  }, [rows, query, userName]);

  function patch(id: string, p: Partial<WorkspaceRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function setStatus(id: string, to: TicketStatus) {
    patch(id, { status: to });
    startTransition(() => updateTicketStatus(fd({ id, to })));
  }
  function setPriority(id: string, to: TicketPriority) {
    patch(id, { priority: to });
    startTransition(() => changeTicketPriority(fd({ id, to })));
  }
  function setAssignee(id: string, assigneeId: string) {
    patch(id, { assignee_id: assigneeId === "" ? null : assigneeId });
    startTransition(() => assignTicket(fd({ id, assigneeId })));
  }

  const searchBox = (
    <input
      type="search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search number, title or assignee…"
      className="w-64 rounded-lg border border-hairline bg-white px-3 py-1.5 text-sm text-oxford focus:border-royal focus:outline-none"
      aria-label="Search tickets"
    />
  );

  if (mode === "board") {
    const columns = TICKET_STATUSES.map((s) => ({
      status: s,
      items: visible.filter((t) => t.status === s),
    }));
    return (
      <div>
        <div className="mb-3">{searchBox}</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {columns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) {
                  const t = rows.find((r) => r.id === dragId);
                  if (t && t.status !== col.status) setStatus(dragId, col.status);
                }
                setDragId(null);
              }}
              className={`flex min-h-40 flex-col gap-2 rounded-xl border p-2 ${
                dragId ? "border-royal/40 bg-celeste/5" : "border-hairline bg-app-bg/40"
              }`}
            >
              <div className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>{TICKET_STATUS_LABEL[col.status]}</span>
                <span className="tabular-nums text-slate-400">{col.items.length}</span>
              </div>
              {col.items.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`cursor-grab rounded-lg border border-hairline bg-white p-2.5 shadow-sm active:cursor-grabbing ${
                    dragId === t.id ? "opacity-50" : ""
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-slate-400">{t.number}</span>
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <Link
                    href={`/tickets/${t.id}`}
                    className="block text-sm font-medium leading-snug text-oxford hover:text-royal"
                  >
                    {t.title}
                  </Link>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="truncate">
                      {t.assignee_id ? (userName.get(t.assignee_id) ?? "—") : "Unassigned"}
                    </span>
                    <SlaBadge state={t.sla} dueAt={t.due_at} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Drag a card to change its status. Changes save immediately and are audit-logged.
        </p>
      </div>
    );
  }

  const allSelected = visible.length > 0 && selected.size === visible.length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {searchBox}
        {canBulk && selected.size > 0 ? (
          <form
            action={bulkTicketAction}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-1.5 text-sm"
          >
            <input type="hidden" name="op" value={op} />
            <input type="hidden" name="back" value={back} />
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
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
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            ) : (
              <select name="value" className={selectClass} defaultValue="medium">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
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
              Clear
            </button>
          </form>
        ) : null}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
            {canBulk ? (
              <th className="w-8 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(visible.map((t) => t.id)))
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
          {visible.map((t) => (
            <tr key={t.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/40">
              {canBulk ? (
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      })
                    }
                    aria-label={`Select ${t.number}`}
                  />
                </td>
              ) : null}
              <td className="py-2 font-mono text-xs text-slate-500">{t.number}</td>
              <td className="py-2">
                <Link href={`/tickets/${t.id}`} className="font-medium text-royal hover:underline">
                  {t.title}
                </Link>
              </td>
              <td className="py-2 capitalize text-slate-500">{t.category}</td>
              <td className="py-2">
                <select
                  value={t.priority}
                  onChange={(e) => setPriority(t.id, e.target.value as TicketPriority)}
                  className={selectClass}
                  aria-label={`Priority of ${t.number}`}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2">
                <select
                  value={t.status}
                  onChange={(e) => setStatus(t.id, e.target.value as TicketStatus)}
                  className={selectClass}
                  aria-label={`Status of ${t.number}`}
                >
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TICKET_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2">
                <select
                  value={t.assignee_id ?? ""}
                  onChange={(e) => setAssignee(t.id, e.target.value)}
                  className={selectClass}
                  aria-label={`Assignee of ${t.number}`}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 tabular-nums text-slate-500">
                {t.ageDays === 0 ? "today" : `${t.ageDays}d`}
              </td>
              <td className="py-2">
                <SlaBadge state={t.sla} dueAt={t.due_at} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">
        Edits in the row save immediately and are audit-logged. Priority changes recalculate the
        SLA from the ticket&apos;s creation date.
      </p>
    </div>
  );
}
