import { requireUser } from "@/lib/auth";
import { unreadNotificationCount } from "@/lib/data";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const notificationCount = await unreadNotificationCount();

  return (
    <div className="flex min-h-screen">
      <Sidebar notificationCount={notificationCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
