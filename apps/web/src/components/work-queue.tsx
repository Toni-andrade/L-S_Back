import type { ActionItem } from "@/lib/data";
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  Clock,
  Flag,
  Inbox,
  Plug,
  Ticket,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { claimTicket } from "@/lib/actions/tickets";

const ICON: Record<string, typeof Flag> = {
  periodic_review: CalendarClock,
  onboarding_touch: CalendarClock,
  flag_response: Flag,
  flag: Flag,
  follow_up: CalendarClock,
  movement: TrendingUp,
  ticket: Ticket,
  ticket_unassigned: Ticket,
  ticket_breach: AlertTriangle,
  ticket_due_soon: Clock,
  ticket_custodian: Ticket,
  intake: Inbox,
  sync_error: Plug,
  unmapped: Plug,
};

const DOT: Record<ActionItem["severity"], string> = {
  high: "bg-alert",
  medium: "bg-marrom",
  low: "bg-celeste",
};

export function WorkQueue({
  title,
  subtitle,
  items,
  emptyText,
  limit = 12,
  stats,
}: {
  title: string;
  subtitle?: string;
  items: ActionItem[];
  emptyText: string;
  limit?: number;
  stats?: { label: string; value: number; alert?: boolean }[];
}) {
  const shown = items.slice(0, limit);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          {items.length > 0 ? (
            <span className="rounded-full bg-royal px-2 py-0.5 text-xs font-medium text-white">
              {items.length}
            </span>
          ) : null}
        </CardTitle>
        {subtitle ? <p className="text-xs text-slate-400">{subtitle}</p> : null}
        {stats && stats.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.map((s) => (
              <span
                key={s.label}
                className={`rounded-lg px-2 py-1 text-xs ring-1 ring-hairline ${
                  s.alert && s.value > 0 ? "bg-alert/5 text-alert" : "bg-white text-slate-500"
                }`}
              >
                {s.label}: <span className="font-semibold tabular-nums">{s.value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{emptyText}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {shown.map((item, i) => {
              const Icon = ICON[item.kind] ?? Flag;
              return (
                <li key={`${item.kind}-${i}`} className="flex items-center gap-1">
                  <Link
                    href={item.href}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 hover:bg-app-bg/50"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[item.severity]}`} />
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-oxford">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                  {item.claimTicketId ? (
                    <form action={claimTicket}>
                      <input type="hidden" name="id" value={item.claimTicketId} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-royal ring-1 ring-hairline hover:bg-celeste/10"
                      >
                        Claim
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
            {items.length > limit ? (
              <li className="py-2 text-center text-xs text-slate-400">
                +{items.length - limit} more
              </li>
            ) : null}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
