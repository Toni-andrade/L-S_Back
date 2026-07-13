"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NAV_ITEMS } from "./nav-items";

/**
 * ⌘K palette shell. Phase 0 searches navigation only; clients, accounts,
 * tickets and proposals become sources as their tables land in later phases.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-64 items-center gap-2 rounded-lg border border-hairline bg-white px-3 text-sm text-slate-400 hover:border-celeste/50"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="rounded border border-hairline bg-app-bg px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-oxford/30 pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-card border border-hairline bg-white shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-hairline px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients, accounts, tickets, proposals..."
                className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto p-2">
              {results.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-slate-400">
                  No results. Clients, accounts, tickets and proposals become
                  searchable as those modules ship.
                </li>
              ) : (
                results.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setQuery("");
                          router.push(item.href);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-oxford hover:bg-celeste/10 hover:text-royal"
                      >
                        <Icon className="h-4 w-4 text-slate-400" />
                        {item.label}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
