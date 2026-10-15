import { useEffect, useMemo, useRef, useState } from 'react';
import { oversTextFull } from '../engine/engine';
import { pressureLabel, type PressurePoint } from '../engine/impact';

interface Series {
  name: string;
  points: PressurePoint[];
}

const H = 220;
const PAD = { l: 28, r: 70, t: 12, b: 26 };
const BANDS = [20, 40, 65, 80];

/** Pressure Index over the innings, one line per innings, with crosshair tooltip. */
export function PressureChart({ series, maxBalls, bpo }: { series: Series[]; maxBalls: number; bpo: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Draw in real pixels so text stays legible on phones.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const x = (b: number) => PAD.l + (b / Math.max(1, maxBalls)) * (W - PAD.l - PAD.r);
  const y = (pi: number) => PAD.t + (1 - pi / 100) * (H - PAD.t - PAD.b);

  // One point per legal ball (the last delivery at that ball count, so wides don't stack).
  const lines = useMemo(
    () =>
      series.map((s) => {
        const byBall = new Map<number, number>();
        for (const p of s.points) byBall.set(p.ball, p.pi);
        return [...byBall.entries()].sort((a, b) => a[0] - b[0]);
      }),
    [series],
  );

  const xTicks: number[] = [];
  const overStep = Math.max(1, Math.ceil(maxBalls / bpo / Math.max(3, Math.floor(W / 70))));
  for (let o = 0; o * bpo <= maxBalls; o += overStep) xTicks.push(o);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const b = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * maxBalls);
    setHover(b < 0 || b > maxBalls ? null : b);
  };

  const valueAt = (i: number, b: number) => lines[i].find(([ball]) => ball === b)?.[1];

  return (
    <div className="pressure-chart">
      <div className="legend">
        {series.map((s, i) => (
          <span key={i}>
            <i style={{ background: `var(--series-${i + 1})` }} />
            {s.name}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative' }} ref={wrap}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label="Pressure index by ball for each innings"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          style={{ display: 'block', touchAction: 'pan-y' }}
        >
          {BANDS.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
                {v}
              </text>
            </g>
          ))}
          {[10, 30, 52, 72, 90].map((v) => (
            <text key={v} x={W - PAD.r + 6} y={y(v) + 4} className="band">
              {pressureLabel(v)}
            </text>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="baseline" />
          {xTicks.map((o) => (
            <text key={o} x={x(o * bpo)} y={H - 8} textAnchor="middle" className="axis">
              {o}
            </text>
          ))}
          {lines.map((pts, i) =>
            pts.length > 0 ? (
              <polyline
                key={i}
                fill="none"
                stroke={`var(--series-${i + 1})`}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={pts.map(([b, pi]) => `${x(b)},${y(pi)}`).join(' ')}
              />
            ) : null,
          )}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />
              {lines.map((_, i) => {
                const v = valueAt(i, hover);
                return v === undefined ? null : (
                  <circle key={i} cx={x(hover)} cy={y(v)} r={5} fill={`var(--series-${i + 1})`} className="dot" />
                );
              })}
            </>
          )}
        </svg>
        {hover !== null && lines.some((_, i) => valueAt(i, hover) !== undefined) && (
          <div
            className="chart-tip"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > maxBalls / 2 ? '-105%' : '5%'})` }}
          >
            <div className="tiny muted">Over {oversTextFull(hover, bpo)}</div>
            {series.map((s, i) => {
              const v = valueAt(i, hover);
              return v === undefined ? null : (
                <div key={i} className="row" style={{ gap: 6 }}>
                  <i style={{ background: `var(--series-${i + 1})` }} />
                  <span>{s.name}</span>
                  <b style={{ marginLeft: 'auto' }}>{v}</b>
                  <span className="tiny muted">{pressureLabel(v)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="tiny muted center">Overs</div>
    </div>
  );
}
