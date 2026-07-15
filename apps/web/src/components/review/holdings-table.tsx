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

const TH = "px-3 py-2 font-medium whitespace-nowrap";
const TD = "px-3 py-2 whitespace-nowrap";

export function HoldingsTable({ holdings, totalMv }: { holdings: Holding[]; totalMv: number }) {
  const [custodian, setCustodian] = useState("");
  const [account, setAccount] = useState("");

  const custodians = useMemo(() => [...new Set(holdings.map((h) => h.custodian))].sort(), [holdings]);
  const accounts = useMemo(
    () => [...new Set(holdings.map((h) => h.accountMasked).filter(Boolean))].sort(),
    [holdings],
  );

  const filtered = holdings.filter(
    (h) => (!custodian || h.custodian === custodian) && (!account || h.accountMasked === account),
  );

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
  const signed = (v: number | null) =>
    v === null ? "text-slate-300" : v >= 0 ? "text-verde" : "text-alert";

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

      <div className="-mx-1 overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-app-bg/60 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className={`${TH} sticky left-0 z-10 bg-app-bg/60`}>Position</th>
              <th className={TH}>Symbol</th>
              <th className={TH}>Account</th>
              <th className={`${TH} text-right`}>Cost Basis</th>
              <th className={`${TH} text-right`}>Market Value</th>
              <th className={`${TH} text-right`}>Unrealized</th>
              <th className={`${TH} text-right`}>Gain %</th>
              <th className={`${TH} text-right`}>Weight</th>
              <th className={`${TH} text-right`}>YTD</th>
              <th className={`${TH} text-right`}>1Y</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FragmentGroup
                key={g.assetClass}
                group={g}
                totalMv={totalMv}
                gainPct={gainPct}
                signed={signed}
              />
            ))}
            {groups.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-center text-slate-400">
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
  signed,
}: {
  group: { assetClass: string; rows: Holding[]; subtotal: number };
  totalMv: number;
  gainPct: (h: Holding) => number | null;
  signed: (v: number | null) => string;
}) {
  return (
    <>
      <tr className="border-b border-hairline bg-app-bg/40 text-[11px] uppercase tracking-wide text-slate-500">
        <td className={`${TD} sticky left-0 z-10 bg-app-bg/40 font-semibold`}>{group.assetClass}</td>
        <td className={TD} colSpan={3} />
        <td className={`${TD} text-right font-semibold tabular-nums text-oxford`}>
          {formatCurrencyUS(group.subtotal)}
        </td>
        <td className={TD} colSpan={2} />
        <td className={`${TD} text-right font-semibold tabular-nums text-oxford`}>
          {totalMv > 0 ? ((group.subtotal / totalMv) * 100).toFixed(1) : "0.0"}%
        </td>
        <td className={TD} colSpan={2} />
      </tr>
      {group.rows.map((h) => {
        const gp = gainPct(h);
        return (
          <tr key={h.id} className="border-b border-hairline last:border-0 hover:bg-app-bg/30">
            <td
              className={`${TD} sticky left-0 z-10 max-w-[300px] truncate bg-white text-oxford`}
              title={h.description ?? h.symbol ?? ""}
            >
              {h.description ?? h.symbol ?? "—"}
            </td>
            <td className={`${TD} font-mono text-xs text-slate-500`}>{h.symbol ?? "—"}</td>
            <td className={`${TD} text-xs text-slate-500`}>
              {CUSTODIAN_LABEL[h.custodian] ?? h.custodian}
              {h.accountMasked ? ` · ${h.accountMasked}` : ""}
            </td>
            <td className={`${TD} text-right tabular-nums text-slate-500`}>
              {h.cost_basis !== null ? formatCurrencyUS(h.cost_basis) : "—"}
            </td>
            <td className={`${TD} text-right tabular-nums text-oxford`}>{formatCurrencyUS(h.market_value)}</td>
            <td className={`${TD} text-right tabular-nums ${signed(h.unrealized_gain)}`}>
              {h.unrealized_gain !== null ? formatCurrencyUS(h.unrealized_gain) : "—"}
            </td>
            <td className={`${TD} text-right tabular-nums ${signed(gp)}`}>
              {gp !== null ? formatPercentUS(gp * 100, 1) : "—"}
            </td>
            <td className={`${TD} text-right tabular-nums text-slate-500`}>
              {totalMv > 0 ? ((h.market_value / totalMv) * 100).toFixed(1) : "0.0"}%
            </td>
            <td className={`${TD} text-right tabular-nums ${signed(h.twr_ytd)}`}>
              {h.twr_ytd !== null ? formatPercentUS(h.twr_ytd * 100, 1) : "—"}
            </td>
            <td className={`${TD} text-right tabular-nums ${signed(h.twr_1y)}`}>
              {h.twr_1y !== null ? formatPercentUS(h.twr_1y * 100, 1) : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
