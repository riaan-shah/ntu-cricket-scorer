import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppBar, Avatar, Sheet, toast } from '../components/ui';
import { createPlayer, useMatches, usePlayers } from '../db';
import { batAverage, batStrikeRate, bowlEconomy, computeCareerStats } from '../engine/stats';
import { downloadText, toCsv } from '../export';
import type { Player } from '../types';
import { PlayerForm } from './PlayerProfile';

export default function Players() {
  const players = usePlayers();
  const matches = useMatches() ?? [];
  const stats = useMemo(() => computeCareerStats(matches), [matches]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const list = players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Player', 'Matches', 'Won', 'POTM', 'Inns', 'Runs', 'Balls', 'HS', 'Avg', 'SR', '4s', '6s', '30s', '50s', 'Ducks',
        'Overs', 'Wkts', 'Runs conceded', 'Econ', 'Best', 'Catches', 'Run outs', 'Stumpings', 'Out of cage', 'Total impact', 'Avg impact', 'Best batter', 'Best bowler', 'Fighter'],
    ];
    for (const p of players) {
      const s = stats.get(p.id);
      if (!s) {
        rows.push([p.name, 0]);
        continue;
      }
      rows.push([
        p.name, s.matches, s.wins, s.motm, s.bat.innings, s.bat.runs, s.bat.balls,
        `${s.bat.highest}${s.bat.highestNotOut ? '*' : ''}`, batAverage(s.bat), batStrikeRate(s.bat),
        s.bat.fours, s.bat.sixes, s.bat.thirties, s.bat.fifties, s.bat.ducks,
        `${Math.floor(s.bowl.balls / 6)}.${s.bowl.balls % 6}`, s.bowl.wickets, s.bowl.runs, bowlEconomy(s.bowl),
        s.bowl.innings ? `${s.bowl.bestW}/${s.bowl.bestR}` : '-', s.catches, s.runOuts, s.stumpings, s.outOfCage, s.impact,
        s.impactMatches ? (s.impact / s.impactMatches).toFixed(1) : '-', s.bestBatter, s.bestBowler, s.fighter,
      ]);
    }
    downloadText(toCsv(rows), `ntu-cricket-player-stats-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  };

  return (
    <div>
      <AppBar
        title="Players"
        back="/"
        right={
          <button className="icon-btn" onClick={exportCsv} title="Export stats CSV">
            ⬇
          </button>
        }
      />
      <div className="page">
        <div className="row">
          <input className="input" placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={() => setAdding(true)}>
            ＋ Add
          </button>
        </div>
        <div className="card">
          {list.length === 0 && <div className="empty">No players yet. Add your club members!</div>}
          {list.map((p) => {
            const s = stats.get(p.id);
            return (
              <Link key={p.id} to={`/players/${p.id}`} className="list-item">
                <Avatar name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bold">{p.name}</div>
                  <div className="tiny muted">
                    {p.role ?? 'Player'} · {s?.matches ?? 0} matches
                  </div>
                </div>
                <div className="small" style={{ textAlign: 'right' }}>
                  <div>
                    <b>{s?.bat.runs ?? 0}</b> <span className="muted">runs</span>
                  </div>
                  <div>
                    <b>{s?.bowl.wickets ?? 0}</b> <span className="muted">wkts</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      {adding && (
        <Sheet open title="Add player" onClose={() => setAdding(false)}>
          <PlayerForm
            existing={players}
            onSave={async (data: Partial<Player>) => {
              const p = await createPlayer(data.name!, data);
              toast(`${p.name} added`);
              setAdding(false);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
