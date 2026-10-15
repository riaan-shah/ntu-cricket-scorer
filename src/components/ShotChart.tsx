import type { ZoneStats } from '../engine/insights';
import type { ShotZone } from '../types';

const W = 240;
const H = 300;
const BAT = { x: W / 2, y: H * 0.74 };

/**
 * Top-down cage, bowler at the top, batter near the bottom. Each zone is shaded by its share of the batter's runs
 * (one hue, light → dark) and labelled with runs and %, so it reads without colour too.
 * Off/leg flip for left-handers.
 */
export function ShotChart({ zones, leftHanded }: { zones: ZoneStats; leftHanded?: boolean }) {
  const total = Object.values(zones).reduce((n, z) => n + z.runs, 0) || 1;
  const tl = { x: W * 0.22, y: 0 };
  const tr = { x: W * 0.78, y: 0 };
  const bl = { x: W * 0.3, y: H };
  const br = { x: W * 0.7, y: H };
  const pts = (...p: { x: number; y: number }[]) => p.map((q) => `${q.x},${q.y}`).join(' ');
  // Right-hander seen from behind facing the bowler: off side is to the right.
  const right: ShotZone = leftHanded ? 'leg' : 'off';
  const left: ShotZone = leftHanded ? 'off' : 'leg';
  const shapes: { zone: ShotZone; points: string; label: { x: number; y: number } }[] = [
    { zone: 'straight', points: pts(BAT, tl, tr), label: { x: W / 2, y: H * 0.22 } },
    { zone: right, points: pts(BAT, tr, { x: W, y: 0 }, { x: W, y: H }, br), label: { x: W * 0.84, y: H * 0.5 } },
    { zone: left, points: pts(BAT, bl, { x: 0, y: H }, { x: 0, y: 0 }, tl), label: { x: W * 0.16, y: H * 0.5 } },
    { zone: 'behind', points: pts(BAT, br, bl), label: { x: W / 2, y: H * 0.92 } },
  ];
  const names: Record<ShotZone, string> = { straight: 'Straight', off: 'Off', leg: 'Leg', behind: 'Behind' };
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} width="100%" style={{ maxWidth: 260, display: 'block', margin: '0 auto' }} role="img" aria-label="Shot zones">
      <rect x={0} y={0} width={W} height={H} rx={16} fill="var(--chip)" stroke="var(--line)" strokeWidth={2} />
      {shapes.map(({ zone, points }) => {
        const share = zones[zone].runs / total;
        return (
          <polygon
            key={zone}
            points={points}
            fill="var(--brand-2)"
            fillOpacity={0.08 + share * 0.82}
            stroke="var(--card)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        );
      })}
      <rect x={0} y={0} width={W} height={H} rx={16} fill="none" stroke="var(--line)" strokeWidth={2} />
      {/* pitch + batter */}
      <rect x={W / 2 - 9} y={H * 0.08} width={18} height={H * 0.66} rx={3} fill="none" stroke="var(--muted)" strokeOpacity={0.5} />
      <circle cx={BAT.x} cy={BAT.y} r={6} fill="var(--text)" />
      {shapes.map(({ zone, label }) => {
        const z = zones[zone];
        const share = Math.round((z.runs / total) * 100);
        const dark = z.runs / total > 0.45;
        return (
          <g key={zone} textAnchor="middle" style={{ fill: dark ? '#fff' : 'var(--text)' }}>
            <text x={label.x} y={label.y - 8} fontSize={11} fontWeight={700} opacity={0.85}>
              {names[zone]}
            </text>
            <text x={label.x} y={label.y + 10} fontSize={18} fontWeight={800}>
              {z.runs}
            </text>
            <text x={label.x} y={label.y + 25} fontSize={11}>
              {share}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
