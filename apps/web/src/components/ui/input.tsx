import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-lg border border-hairline bg-white px-3 py-1 text-sm text-oxford placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celeste disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
