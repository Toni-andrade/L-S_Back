import type { SlaState, TicketPriority } from "@ls/domain";
import { Badge } from "@/components/ui/badge";

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const variant =
    priority === "urgent"
      ? "alert"
      : priority === "high"
        ? "marrom"
        : priority === "medium"
          ? "celeste"
          : "default";
  return (
    <Badge variant={variant} className="capitalize">
      {priority}
    </Badge>
  );
}

export function SlaBadge({ state, dueAt }: { state: SlaState; dueAt: string | null }) {
  if (state === "none") return <span className="text-slate-400">—</span>;
  const due = dueAt ? new Date(dueAt).toLocaleDateString("en-US") : "";
  if (state === "breached") return <Badge variant="alert">Breached · {due}</Badge>;
  if (state === "due_today") return <Badge variant="marrom">Due today</Badge>;
  return <span className="text-slate-500">Due {due}</span>;
}
