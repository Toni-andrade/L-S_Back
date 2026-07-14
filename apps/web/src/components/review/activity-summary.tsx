import {
  formatCurrencyUS,
  summarizeActivity,
  type ActivityMetrics,
  type ActivityMover,
} from "@ls/domain";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";

/**
 * The advisor's month-at-a-glance: return, the movement decomposition (with a
 * hover tooltip), a plain-language recap, and the biggest movers. Anchors the
 * client review page. Colors follow the brand rules (verde up, red down).
 */
export function ActivitySummaryCard({
  metrics,
  movers,
  period = "trailing_30d",
}: {
  metrics: ActivityMetrics;
  movers?: ActivityMover[] | null;
  period?: "trailing_30d" | "ytd" | "one_year";
}) {
  const s = summarizeActivity(metrics, period);
  const tone =
    s.direction === "up" ? "text-verde" : s.direction === "down" ? "text-alert" : "text-slate-500";
  const Arrow = s.direction === "up" ? ArrowUpRight : s.direction === "down" ? ArrowDownRight : Minus;

  const gainers = (movers ?? []).filter((m) => m.change > 0).slice(0, 4);
  const losers = (movers ?? []).filter((m) => m.change < 0).slice(0, 4);

  return (
    <div className="mb-4 rounded-card border border-hairline bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Portfolio activity
          </div>
          <div className={`mt-1 flex items-center gap-2 text-2xl font-semibold ${tone}`}>
            <Arrow className="h-6 w-6" />
            {s.headline}
          </div>
          <p className="mt-1 max-w-xl text-sm text-slate-600">{s.detail}</p>
        </div>

        <div className="flex items-center gap-3">
          {metrics.changeInValue !== null ? (
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">Change in value</div>
              <div className={`text-xl font-semibold tabular-nums ${tone}`}>
                {metrics.changeInValue >= 0 ? "+" : "-"}
                {formatCurrencyUS(Math.abs(metrics.changeInValue))}
              </div>
            </div>
          ) : null}
          {/* Movements tooltip (CSS hover) */}
          <div className="group/tip relative">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-app-bg hover:text-royal"
              aria-label="Movement breakdown"
            >
              <Info className="h-4 w-4" />
            </button>
            <div className="pointer-events-none absolute right-0 top-9 z-10 hidden w-64 rounded-card border border-hairline bg-white p-3 text-sm shadow-lg group-hover/tip:block">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                What moved the portfolio
              </div>
              {s.breakdown.map((row) => (
                <div key={row.label} className="flex items-center justify-between py-0.5">
                  <span className="text-slate-500">{row.label}</span>
                  <span
                    className={`tabular-nums ${row.value >= 0 ? "text-verde" : "text-alert"}`}
                  >
                    {row.value >= 0 ? "+" : "-"}
                    {formatCurrencyUS(Math.abs(row.value))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {gainers.length > 0 || losers.length > 0 ? (
        <div className="mt-4 grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2">
          <MoverList title="Top gainers" movers={gainers} positive />
          <MoverList title="Top detractors" movers={losers} />
        </div>
      ) : null}
    </div>
  );
}

function MoverList({
  title,
  movers,
  positive,
}: {
  title: string;
  movers: ActivityMover[];
  positive?: boolean;
}) {
  if (movers.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {movers.map((m, i) => (
          <li key={`${m.symbol ?? m.name}-${i}`} className="flex items-center justify-between">
            <span className="truncate text-oxford">
              {m.symbol ? <span className="font-medium">{m.symbol}</span> : null}{" "}
              <span className="text-slate-500">{m.name}</span>
            </span>
            <span className={`tabular-nums ${positive ? "text-verde" : "text-alert"}`}>
              {m.change >= 0 ? "+" : "-"}
              {formatCurrencyUS(Math.abs(m.change))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
