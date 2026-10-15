import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MatchCard } from '../components/MatchCard';
import { Avatar } from '../components/ui';
import { useMatches, usePlayerNames, useSettings } from '../db';
import { computeCareerStats } from '../engine/stats';

export default function Home() {
  const settings = useSettings();
  const matches = useMatches() ?? [];
  const { nameOf, players } = usePlayerNames();
  const live = matches.filter((m) => m.status === 'live');
  const recent = matches.filter((m) => m.status !== 'live').slice(0, 3);
  const leaders = useMemo(() => {
    const stats = [...computeCareerStats(matches).values()];
    const top = (title: string, f: (s: (typeof stats)[number]) => number, unit: (v: number) => string) => {
      const best = [...stats].sort((a, b) => f(b) - f(a))[0];
      return best && f(best) > 0 ? [{ title, id: best.playerId, value: unit(f(best)) }] : [];
    };
    return [
      ...top('Most runs', (s) => s.bat.runs, (v) => `${v} run${v === 1 ? '' : 's'}`),
      ...top('Most wickets', (s) => s.bowl.wickets, (v) => `${v} wkt${v === 1 ? '' : 's'}`),
      ...top('Top MVP', (s) => s.impact, (v) => `${v.toFixed(1)} impact`),
    ];
  }, [matches]);

  return (
    <div>
      <div className="hero">
        <div className="row">
          <span className="logo-badge">
            <img src="./logo-192.png" width={64} height={64} alt="NTU Cricket Club logo" />
          </span>
          <div>
            <h1>{settings.clubName}</h1>
            <p>Match scoring · player stats · scorecards</p>
          </div>
        </div>
      </div>
      <div className="page">
        <Link to="/match/new" className="btn primary big block">
          ＋ Start a new match
        </Link>

        {live.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h2>Live now</h2>
            </div>
            {live.map((m) => (
              <MatchCard key={m.id} match={m} nameOf={nameOf} />
            ))}
          </div>
        )}

        <div className="tile-grid">
          <Link to="/matches" className="tile">
            <span className="ico">📅</span>Matches
          </Link>
          <Link to="/players" className="tile">
            <span className="ico">👥</span>Players
            <span className="tiny muted">{players.length}</span>
          </Link>
          <Link to="/leaderboard" className="tile">
            <span className="ico">🏆</span>Leaderboard
          </Link>
          <Link to="/settings" className="tile">
            <span className="ico">⚙️</span>Settings
          </Link>
        </div>

        {leaders.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h2>Club leaders</h2>
              <Link to="/leaderboard" className="link-btn">
                All →
              </Link>
            </div>
            {leaders.map((l) => (
              <Link key={l.title} to={`/players/${l.id}`} className="list-item">
                <Avatar name={nameOf(l.id)} />
                <div style={{ flex: 1 }}>
                  <div className="tiny muted bold">{l.title.toUpperCase()}</div>
                  <div className="bold">{nameOf(l.id)}</div>
                </div>
                <span className="badge brand">{l.value}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Recent results</h2>
            <Link to="/matches" className="link-btn">
              All →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="empty">No completed matches yet. Start one above!</div>
          ) : (
            recent.map((m) => <MatchCard key={m.id} match={m} nameOf={nameOf} />)
          )}
        </div>
      </div>
    </div>
  );
}
