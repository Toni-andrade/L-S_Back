"use client";

import { TICKET_STATUSES, TICKET_STATUS_LABEL, type TicketStatus } from "@ls/domain";
import { useState, useTransition } from "react";
import { updateTicketStatus } from "@/lib/actions/tickets";

export function StatusSelect({ id, status }: { id: string; status: TicketStatus }) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={pending}
      onChange={(e) => {
        const to = e.target.value as TicketStatus;
        setCurrent(to);
        const fd = new FormData();
        fd.append("id", id);
        fd.append("to", to);
        startTransition(() => updateTicketStatus(fd));
      }}
      className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none disabled:opacity-60"
      aria-label="Ticket status"
    >
      {TICKET_STATUSES.map((s) => (
        <option key={s} value={s}>
          {TICKET_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
