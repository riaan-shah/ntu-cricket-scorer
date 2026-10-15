import { useEffect, useRef, useState, type ReactNode } from 'react';
import { oversTextFull, type InningsState } from '../engine/engine';
import type { Match } from '../types';

/** Measures its box so charts draw in real pixels (legible text on phones). */
function useWidth(initial = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((s) => (
        <span key={s.name}>
          <i style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Tip({ x, w, children }: { x: number; w: number; children: ReactNode }) {
  return (
    <div className="chart-tip" style={{ left: `${(x / w) * 100}%`, transform: `translateX(${x > w / 2 ? '-105%' : '5%'})` }}>
      {children}
    </div>
  );
}

const SERIES = ['var(--series-1)', 'var(--series-2)'];
const H = 200;
const PAD = { l: 30, r: 12, t: 12, b: 26 };

interface OverData {
  runs: number;
  wickets: number;
}
function perOver(inn: InningsState): OverData[] {
  return inn.overs.map((o) => ({ runs: o.runs, wickets: o.wickets }));
}

/** Runs per over, both innings side by side; dots above a bar mark wickets in that over. */
export function ManhattanChart({ match, innings }: { match: Match; innings: InningsState[] }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const data = innings.map(perOver);
  const overs = Math.max(match.rules.overs, ...data.map((d) => d.length));
  const max = Math.max(6, ...data.flat().map((d) => d.runs));
  const step = Math.max(2, Math.ceil(max / 4 / 2) * 2);
  // Round the scale up so the tallest over (and its wicket dots) always fit.
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const slot = (w - PAD.l - PAD.r) / overs;
  const gap = 2;
  const bw = Math.max(3, Math.min(22, (slot - 6 - gap) / innings.length));
  const y = (v: number) => PAD.t + 14 + (1 - v / top) * (H - PAD.t - 14 - PAD.b);
  const names = innings.map((i) => match.teams[i.battingTeam].name);
  return (
    <div className="pressure-chart" ref={ref}>
      <Legend items={names.map((n, i) => ({ name: n, color: SERIES[i] }))} />
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${w} ${H}`} width="100%" role="img" aria-label="Runs per over" onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
                {t}
              </text>
            </g>
          ))}
          {Array.from({ length: overs }, (_, o) => {
            const x0 = PAD.l + o * slot + (slot - (bw * innings.length + gap * (innings.length - 1))) / 2;
            return (
              <g key={o} onPointerEnter={() => setHover(o)} onClick={() => setHover(o)}>
                <rect x={PAD.l + o * slot} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
                {data.map((d, i) => {
                  const v = d[o];
                  if (!v) return null;
                  const x = x0 + i * (bw + gap);
                  const top = Math.min(y(v.runs), y(0) - 2);
                  const r = Math.min(4, bw / 2);
                  return (
                    <g key={i} opacity={hover === null || hover === o ? 1 : 0.5}>
                      <path
                        d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`}
                        fill={SERIES[i]}
                      />
                      {Array.from({ length: v.wickets }, (_, k) => (
                        <circle key={k} cx={x + bw / 2} cy={top - 7 - k * 9} r={3.5} fill="var(--wicket)" stroke="var(--card)" strokeWidth={1.5} />
                      ))}
                    </g>
                  );
                })}
                {(overs <= 12 || o % 2 === 1) && (
                  <text x={PAD.l + o * slot + slot / 2} y={H - 8} textAnchor="middle" className="axis">
                    {o + 1}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={PAD.l} x2={w - PAD.r} y1={y(0)} y2={y(0)} className="baseline" />
        </svg>
        {hover !== null && (
          <Tip x={PAD.l + hover * slot + slot / 2} w={w}>
            <div className="tiny muted">Over {hover + 1}</div>
            {data.map((d, i) =>
              d[hover] ? (
                <div key={i} className="row" style={{ gap: 6 }}>
                  <i style={{ background: SERIES[i] }} />
                  <span>{names[i]}</span>
                  <b style={{ marginLeft: 'auto' }}>{d[hover].runs}</b>
                  {d[hover].wickets > 0 && <span className="tiny" style={{ color: 'var(--wicket)' }}>{d[hover].wickets}W</span>}
                </div>
              ) : null,
            )}
          </Tip>
        )}
      </div>
      <div className="tiny muted center">Overs · ● = wicket</div>
    </div>
  );
}

/** Running total by over for both innings, with wickets marked on the line. */
export function WormChart({ match, innings }: { match: Match; innings: InningsState[] }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const bpo = match.rules.ballsPerOver;
  const maxBalls = Math.max(match.rules.overs * bpo, ...innings.map((i) => i.legalBalls));
  // Points after every ball (x = legal balls) so the line climbs smoothly; wickets as markers.
  const series = innings.map((inn) => {
    const pts: { ball: number; runs: number }[] = [{ ball: 0, runs: 0 }];
    const wkts: { ball: number; runs: number }[] = [];
    for (const b of inn.balls) {
      pts.push({ ball: b.legalBallsAfter, runs: b.scoreAfter.runs });
      if (b.event.wicket) wkts.push({ ball: b.legalBallsAfter, runs: b.scoreAfter.runs });
    }
    return { pts, wkts };
  });
  const max = Math.max(10, ...innings.map((i) => i.runs), ...innings.map((i) => (i.target ?? 0) - 1));
  const step = Math.max(5, Math.ceil(max / 4 / 5) * 5);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const x = (b: number) => PAD.l + (b / maxBalls) * (w - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const names = innings.map((i) => match.teams[i.battingTeam].name);
  const overTicks: number[] = [];
  // Span the longest innings (overs may have been cut for the chase).
  const totalOvers = Math.ceil(maxBalls / bpo);
  const everyN = Math.max(1, Math.ceil(totalOvers / Math.max(3, Math.floor(w / 60))));
  for (let o = 0; o <= totalOvers; o += everyN) overTicks.push(o);
  const at = (s: (typeof series)[number], ball: number) => [...s.pts].reverse().find((p) => p.ball <= ball);
  return (
    <div className="pressure-chart" ref={ref}>
      <Legend items={names.map((n, i) => ({ name: n, color: SERIES[i] }))} />
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${w} ${H}`}
          width="100%"
          role="img"
          aria-label="Running totals by over"
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * w;
            const ball = Math.round(((px - PAD.l) / (w - PAD.l - PAD.r)) * maxBalls);
            setHover(ball < 0 || ball > maxBalls ? null : ball);
          }}
          onPointerLeave={() => setHover(null)}
          style={{ touchAction: 'pan-y' }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
                {t}
              </text>
            </g>
          ))}
          {overTicks.map((o) => (
            <text key={o} x={x(o * bpo)} y={H - 8} textAnchor="middle" className="axis">
              {o}
            </text>
          ))}
          <line x1={PAD.l} x2={w - PAD.r} y1={y(0)} y2={y(0)} className="baseline" />
          {series.map((s, i) => (
            <polyline
              key={i}
              fill="none"
              stroke={SERIES[i]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.pts.map((p) => `${x(p.ball)},${y(p.runs)}`).join(' ')}
            />
          ))}
          {series.map((s, i) =>
            s.wkts.map((p, k) => (
              <circle key={`${i}-${k}`} cx={x(p.ball)} cy={y(p.runs)} r={4} fill={SERIES[i]} stroke="var(--card)" strokeWidth={2} />
            )),
          )}
          {/* Direct end labels */}
          {series.map((s, i) => {
            const last = s.pts[s.pts.length - 1];
            return (
              <text key={i} x={Math.min(x(last.ball) + 4, w - PAD.r - 2)} y={y(last.runs) - 6} className="axis" style={{ fontWeight: 700, fill: 'var(--text)' }} textAnchor={x(last.ball) > w - 40 ? 'end' : 'start'}>
                {innings[i].runs}/{innings[i].wickets}
              </text>
            );
          })}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />}
        </svg>
        {hover !== null && (
          <Tip x={x(hover)} w={w}>
            <div className="tiny muted">After {oversTextFull(hover, bpo)} overs</div>
            {series.map((s, i) => {
              const p = at(s, hover);
              return p && innings[i].legalBalls >= hover ? (
                <div key={i} className="row" style={{ gap: 6 }}>
                  <i style={{ background: SERIES[i] }} />
                  <span>{names[i]}</span>
                  <b style={{ marginLeft: 'auto' }}>{p.runs}</b>
                </div>
              ) : null;
            })}
          </Tip>
        )}
      </div>
      <div className="tiny muted center">Overs · ● = wicket</div>
    </div>
  );
}

/** Chasing side's win probability ball by ball (built on the Pressure Index). */
export function WinProbChart({
  points,
  maxBalls,
  bpo,
  team,
}: {
  points: { ball: number; win: number }[];
  maxBalls: number;
  bpo: number;
  team: string;
}) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const L = PAD.l + 10; // room for "100%"
  const x = (b: number) => L + (b / Math.max(1, maxBalls)) * (w - L - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  // One point per legal ball (the latest at that ball).
  const byBall = new Map<number, number>();
  for (const p of points) byBall.set(p.ball, p.win);
  const line = [...byBall.entries()].sort((a, b) => a[0] - b[0]);
  const last = line[line.length - 1];
  const hv = hover !== null ? [...line].reverse().find(([b]) => b <= hover) : null;
  const overTicks: number[] = [];
  const overs = Math.ceil(maxBalls / bpo);
  const everyN = Math.max(1, Math.ceil(overs / Math.max(3, Math.floor(w / 60))));
  for (let o = 0; o <= overs; o += everyN) overTicks.push(o);
  return (
    <div className="pressure-chart" ref={ref}>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${w} ${H}`}
          width="100%"
          role="img"
          aria-label={`${team} win probability`}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * w;
            const b = Math.round(((px - L) / (w - L - PAD.r)) * maxBalls);
            setHover(b < 0 || b > maxBalls ? null : b);
          }}
          onPointerLeave={() => setHover(null)}
          style={{ touchAction: 'pan-y' }}
        >
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={L} x2={w - PAD.r} y1={y(t)} y2={y(t)} className={t === 50 ? 'crosshair' : 'grid'} />
              <text x={L - 6} y={y(t) + 4} textAnchor="end" className="axis">
                {t}%
              </text>
            </g>
          ))}
          {overTicks.map((o) => (
            <text key={o} x={x(o * bpo)} y={H - 8} textAnchor="middle" className="axis">
              {o}
            </text>
          ))}
          <polyline
            fill="none"
            stroke="var(--series-2)"
            strokeWidth={2}
            strokeLinejoin="round"
            points={line.map(([b, v]) => `${x(b)},${y(v)}`).join(' ')}
          />
          {last && (
            <>
              <circle cx={x(last[0])} cy={y(last[1])} r={4.5} fill="var(--series-2)" stroke="var(--card)" strokeWidth={2} />
              <text
                x={x(last[0]) + (x(last[0]) > w - 50 ? -8 : 8)}
                y={y(last[1]) - 8}
                textAnchor={x(last[0]) > w - 50 ? 'end' : 'start'}
                className="axis"
                style={{ fontWeight: 700, fill: 'var(--text)' }}
              >
                {last[1]}%
              </text>
            </>
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />}
        </svg>
        {hv && hover !== null && (
          <Tip x={x(hover)} w={w}>
            <div className="tiny muted">After {oversTextFull(hv[0], bpo)} overs</div>
            <div>
              {team} <b>{hv[1]}%</b>
            </div>
          </Tip>
        )}
      </div>
      <div className="tiny muted center">Overs of the chase · dashed line = even</div>
    </div>
  );
}
