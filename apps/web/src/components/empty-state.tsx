import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Empty and error states share the standard card chrome (Section 13):
 * never a blank panel.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-celeste/10">
        <Icon className="h-5 w-5 text-royal" />
      </div>
      <h3 className="text-[15px] font-semibold text-oxford">{title}</h3>
      <p className="max-w-md text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </Card>
  );
}
