import { formatPercentUS } from "@ls/domain";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createModel, updateModelStatus } from "@/lib/actions/models";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SLEEVE_ROWS = 6;

export default async function ModelsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: strategies }, { data: models }] = await Promise.all([
    supabase
      .from("strategies")
      .select("id, key, name, kind, risk_label, metrics, active")
      .order("kind")
      .order("key"),
    supabase
      .from("models")
      .select("id, name, risk_profile, version, status, notes, model_sleeves(strategy_id, target_weight)")
      .order("created_at", { ascending: false }),
  ]);
  const strategyById = new Map((strategies ?? []).map((s) => [s.id, s]));
  const isAdmin = user.role === "admin";

  const inputClass =
    "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

  return (
    <div>
      <PageHeader
        title="Models"
        subtitle="Strategy library (seeded per spec) and investment models. Sleeve weights must sum to 100."
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Strategy library</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Key</th>
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Kind</th>
                  <th className="py-2 font-medium">Risk</th>
                  <th className="py-2 text-right font-medium">CAGR</th>
                  <th className="py-2 text-right font-medium">Vol</th>
                  <th className="py-2 text-right font-medium">Max DD</th>
                  <th className="py-2 text-right font-medium">Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {(strategies ?? []).map((s) => {
                  const m = (s.metrics ?? {}) as {
                    cagr?: number;
                    vol?: number;
                    max_dd?: number;
                    sharpe?: number;
                  };
                  return (
                    <tr key={s.id} className="border-b border-hairline last:border-0">
                      <td className="py-2 font-mono text-xs text-royal">{s.key}</td>
                      <td className="py-2">{s.name}</td>
                      <td className="py-2">
                        <Badge variant={s.kind === "built_in" ? "celeste" : "default"}>
                          {s.kind.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2 text-slate-500">{s.risk_label ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {m.cagr !== undefined ? formatPercentUS(m.cagr) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {m.vol !== undefined ? formatPercentUS(m.vol) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-alert">
                        {m.max_dd !== undefined ? formatPercentUS(m.max_dd) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {m.sharpe !== undefined ? m.sharpe.toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-400">
              Static-model metrics are backtested simulations (Jan 2008, or noted start, through Dez
              2025); the generated slides always say so.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {(models ?? []).map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>
                    {m.name}{" "}
                    <span className="ml-1 text-xs font-normal capitalize text-slate-400">
                      {m.risk_profile} · v{m.version}
                    </span>
                  </span>
                  <Badge
                    variant={
                      m.status === "active" ? "success" : m.status === "retired" ? "marrom" : "default"
                    }
                  >
                    {m.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm">
                  {(m.model_sleeves ?? []).map(
                    (s: { strategy_id: string; target_weight: number }) => (
                      <li key={s.strategy_id} className="flex items-center justify-between">
                        <span className="text-slate-500">
                          {strategyById.get(s.strategy_id)?.name ?? s.strategy_id}
                        </span>
                        <span className="tabular-nums text-oxford">{Number(s.target_weight)}%</span>
                      </li>
                    ),
                  )}
                </ul>
                {isAdmin ? (
                  <div className="mt-3 flex gap-2">
                    {m.status !== "active" ? (
                      <form action={updateModelStatus}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="to" value="active" />
                        <Button type="submit" variant="outline">
                          Activate
                        </Button>
                      </form>
                    ) : null}
                    {m.status !== "retired" ? (
                      <form action={updateModelStatus}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="to" value="retired" />
                        <Button type="submit" variant="outline">
                          Retire
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        {isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle>
                New model{" "}
                <span className="text-xs font-normal text-slate-400">
                  (sleeve definitions pending Antonio, Open Item 3)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createModel} className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      Name
                    </label>
                    <input name="name" required minLength={2} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      Risk profile
                    </label>
                    <select name="riskProfile" defaultValue="moderado" className={inputClass}>
                      <option value="conservador">Conservador</option>
                      <option value="moderado">Moderado</option>
                      <option value="agressivo">Agressivo</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      Notes
                    </label>
                    <input name="notes" className={inputClass} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-[1fr_120px] gap-2 text-xs uppercase tracking-wide text-slate-400">
                    <span>Sleeve strategy</span>
                    <span>Weight %</span>
                  </div>
                  {Array.from({ length: SLEEVE_ROWS }).map((_, i) => (
                    <div key={i} className="grid grid-cols-[1fr_120px] gap-2">
                      <select name="sleeveStrategyId" defaultValue="" className={inputClass}>
                        <option value="">—</option>
                        {(strategies ?? [])
                          .filter((s) => s.active)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.key} · {s.name}
                            </option>
                          ))}
                      </select>
                      <input
                        name="sleeveWeight"
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        className={inputClass}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button type="submit">Create Model</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
