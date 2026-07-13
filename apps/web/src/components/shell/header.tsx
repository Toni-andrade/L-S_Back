import type { AppUser } from "@ls/domain";
import { Bell, HelpCircle, LogOut } from "lucide-react";
import { CommandPalette } from "./command-palette";

export function Header({ user }: { user: AppUser }) {
  const initials = (user.name || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-hairline bg-white px-6">
      <CommandPalette />
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative rounded-lg p-2 text-slate-500 hover:bg-app-bg hover:text-oxford"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-lg p-2 text-slate-500 hover:bg-app-bg hover:text-oxford"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 border-l border-hairline pl-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-royal text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium text-oxford">{user.name || user.email}</div>
            <div className="text-xs capitalize text-slate-400">{user.role}</div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-app-bg hover:text-alert"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
