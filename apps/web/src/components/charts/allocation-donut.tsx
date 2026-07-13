"use client";

import { BRAND, formatCurrencyUS } from "@ls/domain";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

/**
 * Category colors from the brand palette only. Cash and any warm-toned
 * category map to Marrom, never yellow (Section 11 remap rule).
 */
const CLASS_COLORS: Record<string, string> = {
  "Cash & equivalents": BRAND.marrom,
  "IG fixed income": BRAND.celeste,
  "HY & EM fixed income": "#6FA0EC",
  Gold: BRAND.oxford,
  "Liquid alternatives": "#3D5A80",
  "US equities": BRAND.royal,
  "Intl developed equities": "#5D83C4",
  "EM equities": "#284B8F",
  "Real assets & REITs": BRAND.verde,
  Unclassified: "#8A94A6",
};

const FALLBACK_COLORS = [BRAND.royal, BRAND.celeste, BRAND.verde, BRAND.marrom, BRAND.oxford];

export function AllocationDonut({
  data,
  totalMv,
}: {
  data: { assetClass: string; marketValue: number }[];
  totalMv: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="marketValue"
              nameKey="assetClass"
              innerRadius={68}
              outerRadius={95}
              paddingAngle={1}
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.assetClass}
                  fill={CLASS_COLORS[entry.assetClass] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number | string) => formatCurrencyUS(Number(value))}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: BRAND.border }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Total</span>
          <span className="text-lg font-semibold text-oxford">{formatCurrencyUS(totalMv)}</span>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-1.5 text-sm">
        {data.map((entry, i) => (
          <li key={entry.assetClass} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  CLASS_COLORS[entry.assetClass] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
              }}
            />
            <span className="flex-1 truncate text-slate-600">{entry.assetClass}</span>
            <span className="font-medium tabular-nums text-oxford">
              {totalMv > 0 ? ((entry.marketValue / totalMv) * 100).toFixed(1) : "0.0"}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
