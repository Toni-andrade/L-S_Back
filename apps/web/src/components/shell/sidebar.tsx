"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

export function Sidebar({ ticketCount = 0 }: { ticketCount?: number }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-hairline bg-white transition-[width] duration-150",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-hairline px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Link href="/" className="text-lg font-semibold tracking-tight text-oxford">
          {collapsed ? (
            <span>
              L<span className="italic text-celeste">&amp;</span>S
            </span>
          ) : (
            <span>
              L<span className="italic text-celeste">&amp;</span>S{" "}
              <span className="text-sm font-normal text-slate-500">Backoffice</span>
            </span>
          )}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-celeste/10 text-royal"
                  : "text-slate-500 hover:bg-app-bg hover:text-oxford",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-royal" : "")} />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.label === "Tickets" && ticketCount > 0 ? (
                <span className="rounded-full bg-royal px-2 py-0.5 text-[11px] font-semibold text-white">
                  {ticketCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-hairline p-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-app-bg hover:text-oxford",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
