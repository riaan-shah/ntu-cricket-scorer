import { useState } from 'react';

export interface FormPoint {
  key: string;
  label: string;
  value: number;
  /** Shown in the tooltip and the text list, e.g. "45* (30) v Net Ninjas". */
  detail: string;
}

/**
 * Recent form: one bar per innings/match, oldest → newest. Single series, so no legend; values appear on hover/tap
 * and in the text line below (which doubles as the accessible table view).
 */
export function FormChart({ points, unit, color = 'var(--series-1)' }: { points: FormPoint[]; unit: string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <div className="empty small">No matches yet</div>;
  const W = 320;
  const H = 120;
  const PAD = { l: 26, r: 6, t: 8, b: 18 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const slot = (W - PAD.l - PAD.r) / points.length;
  const bw = Math.min(26, slot - 6);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const h = hover !== null ? points[hover] : null;
  return (
    <div className="form-chart">
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Recent form (${unit})`} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={PAD.l - 5} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = PAD.l + i * slot + (slot - bw) / 2;
            // Ducks still get a 2px stub so the slot doesn't look empty.
            const top = Math.min(y(p.value), y(0) - 2);
            return (
              <g key={p.key} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: 'pointer' }}>
                {/* generous hit target */}
                <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
                <path
                  d={`M${x},${y(0)} V${top + 4} Q${x},${top} ${x + 4},${top} H${x + bw - 4} Q${x + bw},${top} ${x + bw},${top + 4} V${y(0)} Z`}
                  fill={color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
                <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--muted)">
                  {p.label}
                </text>
              </g>
            );
          })}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--muted)" />
        </svg>
        {h && (
          <div className="chart-tip" style={{ left: '50%', transform: 'translateX(-50%)' }}>
            <b>
              {h.value} {unit}
            </b>
            <span className="tiny muted">{h.detail}</span>
          </div>
        )}
      </div>
      <div className="tiny muted" style={{ marginTop: 4 }}>
        {points.map((p) => p.detail.split(' v ')[0]).join(' · ')}
      </div>
    </div>
  );
}
