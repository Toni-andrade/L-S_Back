"use client";

import { useRouter } from "next/navigation";

type Option = { scope: "household" | "client"; id: string; name: string };

/**
 * Quick jump to a household (group) or household-less client review page.
 * Options are already access-scoped by RLS on the server, so a user only ever
 * sees the groups they may visualize.
 */
export function GroupSelector({ options }: { options: Option[] }) {
  const router = useRouter();
  if (options.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Go to group:</span>
      <select
        defaultValue=""
        onChange={(e) => {
          const opt = options.find((o) => `${o.scope}:${o.id}` === e.target.value);
          if (opt) router.push(`/portfolio-review/${opt.scope}/${opt.id}`);
        }}
        className="rounded-lg border border-hairline bg-white px-3 py-1.5 text-sm text-oxford focus:border-royal focus:outline-none"
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={`${o.scope}:${o.id}`} value={`${o.scope}:${o.id}`}>
            {o.name}
            {o.scope === "client" ? " (client)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
