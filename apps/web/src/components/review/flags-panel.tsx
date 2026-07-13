import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { acknowledgeFlag } from "@/lib/actions/portfolio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FlagRow = {
  id: string;
  code: string;
  severity: string;
  message: string;
  acknowledged_at: string | null;
  ack_reason: string | null;
};

export function FlagsPanel({ flags }: { flags: FlagRow[] }) {
  const open = flags.filter((f) => !f.acknowledged_at);
  const acked = flags.filter((f) => f.acknowledged_at);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-royal" /> Flags
          {open.length > 0 ? <Badge variant="alert">{open.length} open</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {open.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-verde">
            <CheckCircle2 className="h-4 w-4" /> No open flags.
          </p>
        ) : (
          open.map((f) => (
            <div key={f.id} className="rounded-lg border border-hairline p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${f.severity === "blocker" ? "text-alert" : "text-marrom"}`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-oxford">{f.code}</span>
                    <Badge variant={f.severity === "blocker" ? "alert" : "marrom"}>{f.severity}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{f.message}</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-royal">
                      Acknowledge (reason required)
                    </summary>
                    <form action={acknowledgeFlag} className="mt-2 flex gap-2">
                      <input type="hidden" name="flagId" value={f.id} />
                      <Input name="reason" placeholder="Reason (audit-logged)" required minLength={3} />
                      <Button type="submit" variant="outline" size="sm">
                        Acknowledge
                      </Button>
                    </form>
                  </details>
                </div>
              </div>
            </div>
          ))
        )}
        {acked.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs text-slate-400">
              {acked.length} acknowledged
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-400">
              {acked.map((f) => (
                <li key={f.id}>
                  <span className="font-mono">{f.code}</span>, {f.ack_reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
