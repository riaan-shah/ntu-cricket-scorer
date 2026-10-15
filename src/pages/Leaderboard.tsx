import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppBar, Avatar, Seg } from '../components/ui';
import { useMatches, usePlayerNames } from '../db';
import { batStrikeRate, bowlEconomy, computeCareerStats, type CareerStats } from '../engine/stats';

interface Board {
  key: string;
  title: string;
  value: (s: CareerStats) => number;
  show: (s: CareerStats) => string;
  sub?: (s: CareerStats) => string;
  eligible?: (s: CareerStats) => boolean;
  asc?: boolean;
}

const BOARDS: Record<'bat' | 'bowl' | 'other', Board[]> = {
  bat: [
    { key: 'runs', title: 'Most runs', value: (s) => s.bat.runs, show: (s) => `${s.bat.runs}`, sub: (s) => `${s.bat.innings} inns · SR ${batStrikeRate(s.bat)}` },
    { key: 'hs', title: 'Highest score', value: (s) => s.bat.highest, show: (s) => `${s.bat.highest}${s.bat.highestNotOut ? '*' : ''}` },
    {
      key: 'avg',
      title: 'Best average (min 3 inns)',
      value: (s) => s.bat.runs / Math.max(1, s.bat.innings - s.bat.notOuts),
      show: (s) => (s.bat.runs / Math.max(1, s.bat.innings - s.bat.notOuts)).toFixed(2),
      eligible: (s) => s.bat.innings >= 3,
    },
    {
      key: 'sr',
      title: 'Best strike rate (min 30 balls)',
      value: (s) => (s.bat.runs * 100) / Math.max(1, s.bat.balls),
      show: (s) => batStrikeRate(s.bat),
      eligible: (s) => s.bat.balls >= 30,
    },
    { key: '6s', title: 'Most sixes', value: (s) => s.bat.sixes, show: (s) => `${s.bat.sixes}` },
    { key: '4s', title: 'Most fours', value: (s) => s.bat.fours, show: (s) => `${s.bat.fours}` },
    { key: '30s', title: 'Most 30+ scores', value: (s) => s.bat.thirties + s.bat.fifties, show: (s) => `${s.bat.thirties + s.bat.fifties}` },
  ],
  bowl: [
    { key: 'wkts', title: 'Most wickets', value: (s) => s.bowl.wickets, show: (s) => `${s.bowl.wickets}`, sub: (s) => `Econ ${bowlEconomy(s.bowl)}` },
    {
      key: 'best',
      title: 'Best figures',
      value: (s) => s.bowl.bestW * 1000 - s.bowl.bestR,
      show: (s) => `${s.bowl.bestW}/${s.bowl.bestR}`,
      eligible: (s) => s.bowl.innings > 0,
    },
    {
      key: 'econ',
      title: 'Best economy (min 3 overs)',
      value: (s) => s.bowl.runs / Math.max(1, s.bowl.balls),
      show: (s) => bowlEconomy(s.bowl),
      eligible: (s) => s.bowl.balls >= 18,
      asc: true,
    },
    { key: 'dots', title: 'Most dot balls', value: (s) => s.bowl.dots, show: (s) => `${s.bowl.dots}` },
    { key: 'maidens', title: 'Most maidens', value: (s) => s.bowl.maidens, show: (s) => `${s.bowl.maidens}` },
  ],
  other: [
    {
      key: 'mvp',
      title: 'MVP (total impact)',
      value: (s) => s.impact,
      show: (s) => s.impact.toFixed(1),
      sub: (s) => `${s.impactMatches} match${s.impactMatches === 1 ? '' : 'es'} · best ${s.bestImpact}`,
      eligible: (s) => s.impactMatches > 0,
    },
    {
      key: 'avgImpact',
      title: 'Avg impact (min 3 matches)',
      value: (s) => s.impact / Math.max(1, s.impactMatches),
      show: (s) => (s.impact / Math.max(1, s.impactMatches)).toFixed(1),
      eligible: (s) => s.impactMatches >= 3,
    },
    { key: 'motm', title: 'Player of the match awards', value: (s) => s.motm, show: (s) => `${s.motm}` },
    { key: 'bb', title: 'Best batter awards', value: (s) => s.bestBatter, show: (s) => `${s.bestBatter}` },
    { key: 'bbw', title: 'Best bowler awards', value: (s) => s.bestBowler, show: (s) => `${s.bestBowler}` },
    { key: 'fighter', title: '⚔️ Fighter of the match awards', value: (s) => s.fighter, show: (s) => `${s.fighter}` },
    { key: 'wins', title: 'Most wins', value: (s) => s.wins, show: (s) => `${s.wins}`, sub: (s) => `${s.matches} played` },
    { key: 'catches', title: 'Most catches', value: (s) => s.catches, show: (s) => `${s.catches}` },
    { key: 'ro', title: 'Most run outs + stumpings', value: (s) => s.runOuts + s.stumpings, show: (s) => `${s.runOuts + s.stumpings}` },
    { key: 'cage', title: '🙈 Out of cage hall of shame', value: (s) => s.outOfCage, show: (s) => `${s.outOfCage}` },
  ],
};

export default function Leaderboard() {
  const matches = useMatches() ?? [];
  const { nameOf, map } = usePlayerNames();
  const years = useMemo(() => [...new Set(matches.map((m) => m.date.slice(0, 4)))].sort().reverse(), [matches]);
  const [season, setSeason] = useState('all');
  const [cat, setCat] = useState<'bat' | 'bowl' | 'other'>('bat');
  const [boardKey, setBoardKey] = useState<string>('runs');
  const stats = useMemo(
    () => [...computeCareerStats(season === 'all' ? matches : matches.filter((m) => m.date.startsWith(season))).values()],
    [matches, season],
  );
  const board = BOARDS[cat].find((b) => b.key === boardKey) ?? BOARDS[cat][0];
  const rows = stats
    .filter((s) => !map.get(s.playerId)?.archived)
    .filter((s) => (board.eligible ? board.eligible(s) : board.value(s) > 0))
    .sort((a, b) => (board.asc ? board.value(a) - board.value(b) : board.value(b) - board.value(a)))
    .slice(0, 25);

  return (
    <div>
      <AppBar title="Leaderboard" back="/" />
      <div className="page">
        <div className="row">
          <select className="input" value={season} onChange={(e) => setSeason(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="all">All time</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y} season
              </option>
            ))}
          </select>
          <div style={{ flex: 1 }}>
            <Seg
              value={cat}
              onChange={(v) => {
                setCat(v);
                setBoardKey(BOARDS[v][0].key);
              }}
              options={[
                { value: 'bat', label: 'Batting' },
                { value: 'bowl', label: 'Bowling' },
                { value: 'other', label: 'Awards' },
              ]}
            />
          </div>
        </div>
        <div className="row wrap">
          {BOARDS[cat].map((b) => (
            <button key={b.key} className={`btn sm ${board.key === b.key ? 'primary' : ''}`} onClick={() => setBoardKey(b.key)}>
              {b.title}
            </button>
          ))}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>{board.title}</h2>
          </div>
          {rows.length === 0 && <div className="empty">Not enough data yet — finish some matches!</div>}
          {rows.map((s, i) => (
            <Link key={s.playerId} to={`/players/${s.playerId}`} className="list-item">
              <span className="bold" style={{ width: 22, color: i < 3 ? 'var(--gold)' : 'var(--muted)' }}>
                {i + 1}
              </span>
              <Avatar name={nameOf(s.playerId)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="bold">{nameOf(s.playerId)}</div>
                <div className="tiny muted">{board.sub ? board.sub(s) : `${s.matches} matches`}</div>
              </div>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{board.show(s)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
