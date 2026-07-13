"use client";

import { BRAND } from "@ls/domain";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function TwrLine({
  data,
}: {
  data: { as_of: string; twr: number; benchmark_twr: number | null }[];
}) {
  const hasBenchmark = data.some((d) => d.benchmark_twr !== null);
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={BRAND.border} vertical={false} />
          <XAxis
            dataKey="as_of"
            tick={{ fontSize: 11, fill: "#8A94A6" }}
            tickFormatter={(v: string) => v.slice(5)}
            tickLine={false}
            axisLine={{ stroke: BRAND.border }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#8A94A6" }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number | string) => `${Number(value).toFixed(2)}%`}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: BRAND.border }}
          />
          <Line
            type="monotone"
            dataKey="twr"
            name="Portfolio TWR"
            stroke={BRAND.royal}
            strokeWidth={2}
            dot={false}
          />
          {hasBenchmark ? (
            <Line
              type="monotone"
              dataKey="benchmark_twr"
              name="Benchmark"
              stroke="#8A94A6"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
