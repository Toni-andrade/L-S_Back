import { BRAND } from "@ls/domain";

/**
 * 0-100 risk gauge. Gradient Celeste -> Royal -> Red per the brand remap rule
 * (never yellow). Pure SVG, rendered server-side.
 */
export function RiskGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = -180 + (clamped / 100) * 180; // needle rotation
  const r = 80;
  const cx = 100;
  const cy = 95;

  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-[260px]">
      <defs>
        <linearGradient id="ls-risk-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={BRAND.celeste} />
          <stop offset="50%" stopColor={BRAND.royal} />
          <stop offset="100%" stopColor={BRAND.red} />
        </linearGradient>
      </defs>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="url(#ls-risk-gradient)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <g transform={`rotate(${angle + 90} ${cx} ${cy})`}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 20} stroke={BRAND.oxford} strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={BRAND.oxford} />
      </g>
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize="26" fontWeight="600" fill={BRAND.oxford}>
        {clamped.toFixed(0)}
      </text>
    </svg>
  );
}
