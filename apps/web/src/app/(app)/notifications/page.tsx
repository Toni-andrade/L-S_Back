import { Bell } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { requireUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { notificationsList } from "@/lib/data";

export default async function NotificationsPage() {
  await requireUser();
  const notifications = await notificationsList();
  const unread = notifications.filter((n) => !n.read_at);

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`Assignments, handoffs and SLA breaches land here${emailConfigured() ? " and in your inbox" : ""}.`}
        action={
          unread.length > 0 ? (
            <form action={markAllNotificationsRead}>
              <Button type="submit" variant="outline">
                Mark all read
              </Button>
            </form>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nothing yet"
          description="You will be notified when a ticket or playbook is assigned to you, or when an SLA breaches."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <ul className="flex flex-col divide-y divide-hairline">
              {notifications.map((n) => (
                <li key={n.id} className="flex items-center gap-3 py-3">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-slate-200" : "bg-royal"}`}
                  />
                  <div className="min-w-0 flex-1">
                    {n.href ? (
                      <Link
                        href={n.href}
                        className={`block truncate text-sm hover:underline ${
                          n.read_at ? "text-slate-500" : "font-medium text-oxford"
                        }`}
                      >
                        {n.title}
                      </Link>
                    ) : (
                      <span
                        className={`block truncate text-sm ${
                          n.read_at ? "text-slate-500" : "font-medium text-oxford"
                        }`}
                      >
                        {n.title}
                      </span>
                    )}
                    {n.body ? (
                      <span className="block truncate text-xs text-slate-400">{n.body}</span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(n.created_at).toLocaleString("en-US")}
                  </span>
                  {!n.read_at ? (
                    <form action={markNotificationRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="shrink-0 text-xs text-slate-400 hover:text-royal">
                        Mark read
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
