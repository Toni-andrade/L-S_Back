"use client";

import { formatCurrencyUS, formatPercentUS } from "@ls/domain";
import { useMemo, useState } from "react";

type Holding = {
  id: string;
  symbol: string | null;
  description: string | null;
  asset_class: string | null;
  market_value: number;
  cost_basis: number | null;
  unrealized_gain: number | null;
  twr_ytd: number | null;
  twr_1y: number | null;
  custodian: string;
  accountMasked: string;
};

const CUSTODIAN_LABEL: Record<string, string> = {
  ibkr: "IBKR",
  morgan_stanley: "Morgan Stanley",
  other: "Other",
};

export function HoldingsTable({
  holdings,
  totalMv,
}: {
  holdings: Holding[];
  totalMv: number;
}) {
  const [custodian, setCustodian] = useState("");
  const [account, setAccount] = useState("");

  const custodians = useMemo(
    () => [...new Set(holdings.map((h) => h.custodian))].sort(),
    [holdings],
  );
  const accounts = useMemo(
    () => [...new Set(holdings.map((h) => h.accountMasked).filter(Boolean))].sort(),
    [holdings],
  );

  const filtered = holdings.filter(
    (h) => (!custodian || h.custodian === custodian) && (!account || h.accountMasked === account),
  );

  // Group by asset class, subtotal on the filtered set.
  const groups = useMemo(() => {
    const map = new Map<string, Holding[]>();
    for (const h of filtered) {
      const k = h.asset_class ?? "Unclassified";
      (map.get(k) ?? map.set(k, []).get(k)!).push(h);
    }
    return [...map.entries()]
      .map(([assetClass, rows]) => ({
        assetClass,
        rows: rows.sort((a, b) => b.market_value - a.market_value),
        subtotal: rows.reduce((s, r) => s + r.market_value, 0),
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
  }, [filtered]);

  const filteredMv = filtered.reduce((s, h) => s + h.market_value, 0);
  const selectClass =
    "rounded-lg border border-hairline bg-white px-2.5 py-1 text-xs text-oxford focus:border-royal focus:outline-none";

  const gainPct = (h: Holding) =>
    h.cost_basis && h.cost_basis !== 0 ? (h.unrealized_gain ?? 0) / h.cost_basis : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400">Filter:</span>
        <select value={custodian} onChange={(e) => setCustodian(e.target.value)} className={selectClass}>
          <option value="">All custodians</option>
          {custodians.map((c) => (
            <option key={c} value={c}>
              {CUSTODIAN_LABEL[c] ?? c}
            </option>
          ))}
        </select>
        <select value={account} onChange={(e) => setAccount(e.target.value)} className={selectClass}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {(custodian || account) && (
          <button
            onClick={() => {
              setCustodian("");
              setAccount("");
            }}
            className="text-royal hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-slate-400">
          {filtered.length} positions · {formatCurrencyUS(filteredMv)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 font-medium">Position</th>
              <th className="py-2 font-medium">Symbol</th>
              <th className="py-2 font-medium">Account</th>
              <th className="py-2 text-right font-medium">Cost Basis</th>
              <th className="py-2 text-right font-medium">Market Value</th>
              <th className="py-2 text-right font-medium">Unrealized</th>
              <th className="py-2 text-right font-medium">Gain %</th>
              <th className="py-2 text-right font-medium">% Port</th>
              <th className="py-2 text-right font-medium">YTD</th>
              <th className="py-2 text-right font-medium">1Y</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FragmentGroup key={g.assetClass} group={g} totalMv={totalMv} gainPct={gainPct} />
            ))}
            {groups.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-4 text-center text-slate-400">
                  No holdings match the filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentGroup({
  group,
  totalMv,
  gainPct,
}: {
  group: { assetClass: string; rows: Holding[]; subtotal: number };
  totalMv: number;
  gainPct: (h: Holding) => number | null;
}) {
  return (
    <>
      <tr className="border-b border-hairline bg-app-bg/50 text-xs uppercase tracking-wide text-slate-500">
        <td className="py-1.5 font-semibold" colSpan={4}>
          {group.assetClass}
        </td>
        <td className="py-1.5 text-right font-semibold tabular-nums text-oxford">
          {formatCurrencyUS(group.subtotal)}
        </td>
        <td colSpan={2} />
        <td className="py-1.5 text-right font-semibold tabular-nums text-oxford">
          {totalMv > 0 ? ((group.subtotal / totalMv) * 100).toFixed(1) : "0.0"}%
        </td>
        <td colSpan={2} />
      </tr>
      {group.rows.map((h) => {
        const gp = gainPct(h);
        return (
          <tr key={h.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/30">
            <td className="py-2 pr-2 text-oxford">{h.description ?? h.symbol ?? "—"}</td>
            <td className="py-2 font-mono text-xs text-slate-500">{h.symbol ?? "—"}</td>
            <td className="py-2 text-xs text-slate-500">
              {CUSTODIAN_LABEL[h.custodian] ?? h.custodian}
              {h.accountMasked ? ` · ${h.accountMasked}` : ""}
            </td>
            <td className="py-2 text-right tabular-nums text-slate-500">
              {h.cost_basis !== null ? formatCurrencyUS(h.cost_basis) : "—"}
            </td>
            <td className="py-2 text-right tabular-nums text-oxford">{formatCurrencyUS(h.market_value)}</td>
            <td
              className={`py-2 text-right tabular-nums ${
                (h.unrealized_gain ?? 0) >= 0 ? "text-verde" : "text-alert"
              }`}
            >
              {h.unrealized_gain !== null ? formatCurrencyUS(h.unrealized_gain) : "—"}
            </td>
            <td
              className={`py-2 text-right tabular-nums ${
                (gp ?? 0) >= 0 ? "text-verde" : "text-alert"
              }`}
            >
              {gp !== null ? formatPercentUS(gp * 100, 1) : "—"}
            </td>
            <td className="py-2 text-right tabular-nums text-slate-500">
              {totalMv > 0 ? ((h.market_value / totalMv) * 100).toFixed(1) : "0.0"}%
            </td>
            <td
              className={`py-2 text-right tabular-nums ${
                h.twr_ytd === null ? "text-slate-300" : h.twr_ytd >= 0 ? "text-verde" : "text-alert"
              }`}
            >
              {h.twr_ytd !== null ? formatPercentUS(h.twr_ytd * 100, 1) : "—"}
            </td>
            <td
              className={`py-2 text-right tabular-nums ${
                h.twr_1y === null ? "text-slate-300" : h.twr_1y >= 0 ? "text-verde" : "text-alert"
              }`}
            >
              {h.twr_1y !== null ? formatPercentUS(h.twr_1y * 100, 1) : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
