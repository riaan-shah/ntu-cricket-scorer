import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FormChart, type FormPoint } from '../components/FormChart';
import { AppBar } from '../components/ui';
import { useMatches, usePlayerNames } from '../db';
import { headToHead, type HeadToHead } from '../engine/insights';
import {
  batAverage,
  batStrikeRate,
  bowlAverage,
  bowlEconomy,
  computeCareerStats,
  type CareerStats,
} from '../engine/stats';
import type { ID } from '../types';

type Better = 'high' | 'low' | 'none';
interface StatRow {
  label: string;
  value: (s: CareerStats) => number | null;
  show: (s: CareerStats) => string;
  better: Better;
}

const num = (v: string) => (v === '-' || v === '∞' ? null : Number(v));

const SECTIONS: { title: string; rows: StatRow[] }[] = [
  {
    title: 'Overview',
    rows: [
      { label: 'Matches', value: (s) => s.matches, show: (s) => `${s.matches}`, better: 'none' },
      { label: 'Won', value: (s) => s.wins, show: (s) => `${s.wins}`, better: 'high' },
      { label: 'Player of the match', value: (s) => s.motm, show: (s) => `${s.motm}`, better: 'high' },
      {
        label: 'Avg impact',
        value: (s) => (s.impactMatches ? s.impact / s.impactMatches : null),
        show: (s) => (s.impactMatches ? (s.impact / s.impactMatches).toFixed(1) : '-'),
        better: 'high',
      },
    ],
  },
  {
    title: 'Batting',
    rows: [
      { label: 'Innings', value: (s) => s.bat.innings, show: (s) => `${s.bat.innings}`, better: 'none' },
      { label: 'Runs', value: (s) => s.bat.runs, show: (s) => `${s.bat.runs}`, better: 'high' },
      { label: 'Highest', value: (s) => s.bat.highest, show: (s) => `${s.bat.highest}${s.bat.highestNotOut ? '*' : ''}`, better: 'high' },
      { label: 'Average', value: (s) => num(batAverage(s.bat)), show: (s) => batAverage(s.bat), better: 'high' },
      { label: 'Strike rate', value: (s) => num(batStrikeRate(s.bat)), show: (s) => batStrikeRate(s.bat), better: 'high' },
      { label: '4s / 6s', value: (s) => s.bat.fours + 2 * s.bat.sixes, show: (s) => `${s.bat.fours} / ${s.bat.sixes}`, better: 'high' },
      { label: 'Runs under pressure', value: (s) => s.pressureRuns, show: (s) => `${s.pressureRuns}`, better: 'high' },
      { label: 'Out of cage', value: (s) => s.outOfCage, show: (s) => `${s.outOfCage}`, better: 'low' },
    ],
  },
  {
    title: 'Bowling',
    rows: [
      { label: 'Wickets', value: (s) => s.bowl.wickets, show: (s) => `${s.bowl.wickets}`, better: 'high' },
      {
        label: 'Best',
        value: (s) => (s.bowl.innings ? s.bowl.bestW * 1000 - s.bowl.bestR : null),
        show: (s) => (s.bowl.innings ? `${s.bowl.bestW}/${s.bowl.bestR}` : '-'),
        better: 'high',
      },
      { label: 'Economy', value: (s) => num(bowlEconomy(s.bowl)), show: (s) => bowlEconomy(s.bowl), better: 'low' },
      { label: 'Average', value: (s) => num(bowlAverage(s.bowl)), show: (s) => bowlAverage(s.bowl), better: 'low' },
      { label: 'Dot balls', value: (s) => s.bowl.dots, show: (s) => `${s.bowl.dots}`, better: 'high' },
    ],
  },
  {
    title: 'Fielding',
    rows: [
      { label: 'Catches', value: (s) => s.catches, show: (s) => `${s.catches}`, better: 'high' },
      { label: 'Run outs + stumpings', value: (s) => s.runOuts + s.stumpings, show: (s) => `${s.runOuts + s.stumpings}`, better: 'high' },
      { label: 'Runs saved', value: (s) => s.runsSaved, show: (s) => `${s.runsSaved}`, better: 'high' },
      { label: 'Catches dropped', value: (s) => s.drops, show: (s) => `${s.drops}`, better: 'low' },
    ],
  },
];

/** Last `n` batting performances, oldest → newest (a player's two turns in one match are combined). */
export function battingForm(s: CareerStats | undefined, n = 10): FormPoint[] {
  if (!s) return [];
  return s.performances
    .filter((p) => p.bat.length > 0)
    .slice(0, n)
    .reverse()
    .map((p) => {
      const runs = p.bat.reduce((a, b) => a + b.runs, 0);
      const balls = p.bat.reduce((a, b) => a + b.balls, 0);
      const notOut = !p.bat[p.bat.length - 1].out;
      return {
        key: p.matchId,
        label: p.date.slice(8, 10) + '/' + p.date.slice(5, 7),
        value: runs,
        detail: `${runs}${notOut ? '*' : ''} (${balls}) v ${p.opponent}`,
      };
    });
}

export function bowlingForm(s: CareerStats | undefined, n = 10): FormPoint[] {
  if (!s) return [];
  return s.performances
    .filter((p) => p.bowl.length > 0)
    .slice(0, n)
    .reverse()
    .map((p) => {
      const w = p.bowl.reduce((a, b) => a + b.wickets, 0);
      const r = p.bowl.reduce((a, b) => a + b.runs, 0);
      return {
        key: p.matchId,
        label: p.date.slice(8, 10) + '/' + p.date.slice(5, 7),
        value: w,
        detail: `${w}/${r} v ${p.opponent}`,
      };
    });
}

function H2HCard({ title, h }: { title: string; h: HeadToHead }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      {h.balls === 0 ? (
        <div className="empty small">They haven't faced each other yet.</div>
      ) : (
        <div className="stat-grid">
          {(
            [
              ['Balls', h.balls],
              ['Runs', h.runs],
              ['Outs', h.dismissals],
              ['SR', ((h.runs * 100) / h.balls).toFixed(0)],
              ['Dots', h.dots],
              ['4s', h.fours],
              ['6s', h.sixes],
              ['Matches', h.matches],
            ] as [string, string | number][]
          ).map(([l, v]) => (
            <div className="stat" key={l}>
              <div className="v">{v}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const { players, nameOf } = usePlayerNames();
  const matches = useMatches() ?? [];
  const stats = useMemo(() => computeCareerStats(matches), [matches]);
  const roster = players.filter((p) => !p.archived);
  const a = params.get('a') ?? '';
  const b = params.get('b') ?? '';
  const sa = stats.get(a);
  const sb = stats.get(b);
  const pick = (key: 'a' | 'b', id: ID) => {
    const next = new URLSearchParams(params);
    if (id) next.set(key, id);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const h2hAB = useMemo(() => (a && b ? headToHead(matches, a, b) : null), [matches, a, b]);
  const h2hBA = useMemo(() => (a && b ? headToHead(matches, b, a) : null), [matches, a, b]);

  const select = (key: 'a' | 'b', value: string) => (
    <select className="input" value={value} onChange={(e) => pick(key, e.target.value)}>
      <option value="">Choose player…</option>
      {roster.map((p) => (
        <option key={p.id} value={p.id} disabled={p.id === (key === 'a' ? b : a)}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <AppBar title="Compare players" back="/players" />
      <div className="page">
        <div className="grid-2">
          {select('a', a)}
          {select('b', b)}
        </div>

        {a && b && (
          <>
            {SECTIONS.map((sec) => (
              <div className="card" key={sec.title}>
                <table className="mini-table cmp-table">
                  <thead>
                    <tr>
                      <th>{sec.title}</th>
                      <th>
                        <Link to={`/players/${a}`}>{nameOf(a)}</Link>
                      </th>
                      <th>
                        <Link to={`/players/${b}`}>{nameOf(b)}</Link>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.rows.map((r) => {
                      const va = sa ? r.value(sa) : null;
                      const vb = sb ? r.value(sb) : null;
                      const winA = r.better !== 'none' && va !== null && (vb === null || (r.better === 'high' ? va > vb : va < vb));
                      const winB = r.better !== 'none' && vb !== null && (va === null || (r.better === 'high' ? vb > va : vb < va));
                      return (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          <td className={winA ? 'win' : ''}>{sa ? r.show(sa) : '-'}</td>
                          <td className={winB ? 'win' : ''}>{sb ? r.show(sb) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="section-title">Head to head</div>
            {h2hAB && <H2HCard title={`${nameOf(a)} batting v ${nameOf(b)} bowling`} h={h2hAB} />}
            {h2hBA && <H2HCard title={`${nameOf(b)} batting v ${nameOf(a)} bowling`} h={h2hBA} />}

            <div className="section-title">Recent batting form (runs)</div>
            <div className="card">
              <div className="card-head">
                <h2>{nameOf(a)}</h2>
              </div>
              <FormChart points={battingForm(sa)} unit="runs" color="var(--series-1)" />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>{nameOf(b)}</h2>
              </div>
              <FormChart points={battingForm(sb)} unit="runs" color="var(--series-2)" />
            </div>
          </>
        )}
        {(!a || !b) && <div className="empty">Pick two players to compare them side by side.</div>}
      </div>
    </div>
  );
}
