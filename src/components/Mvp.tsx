import { Link } from 'react-router-dom';
import { impactGrade, pressureLabel, type Heroes, type PlayerImpact } from '../engine/impact';
import type { ID } from '../types';
import { Avatar } from './ui';

/** Pressure 0-100 as a single-hue badge: deeper red = more pressure. */
export function PressureBadge({ pi, prefix = 'Pressure' }: { pi: number; prefix?: string }) {
  return (
    <span
      className="pressure-badge"
      style={{
        background: `color-mix(in srgb, var(--accent) ${15 + Math.round(pi * 0.85)}%, var(--pressure-base))`,
        color: pi >= 50 ? '#fff' : 'var(--text)',
      }}
      title={`Pressure Index ${pi} (${pressureLabel(pi)})`}
    >
      {prefix} {pi} · {pressureLabel(pi)}
    </span>
  );
}

const HERO_META: { key: keyof Heroes; title: string; icon: string }[] = [
  { key: 'potm', title: 'Player of the Match', icon: '🏅' },
  { key: 'bestBatter', title: 'Best Batter', icon: '🏏' },
  { key: 'bestBowler', title: 'Best Bowler', icon: '🎯' },
  { key: 'fighter', title: 'Fighter of the Match', icon: '⚔️' },
];

export function HeroesCard({
  heroes,
  players,
  nameOf,
  onChangePotm,
}: {
  heroes: Heroes;
  players: PlayerImpact[];
  nameOf: (id: ID) => string;
  onChangePotm?: () => void;
}) {
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const value = (key: keyof Heroes, id: ID) => {
    const p = byId.get(id);
    if (!p) return '';
    return key === 'bestBatter' ? p.batting : key === 'bestBowler' ? p.bowling : p.total;
  };
  return (
    <div className="card">
      <div className="card-head">
        <h2>Heroes of the match</h2>
        {onChangePotm && (
          <button className="link-btn" onClick={onChangePotm}>
            Change POTM
          </button>
        )}
      </div>
      <div className="heroes-grid">
        {HERO_META.map(({ key, title, icon }) => {
          const id = heroes[key];
          return (
            <div key={key} className="hero-tile">
              <div className="tiny muted bold">
                {icon} {title.toUpperCase()}
              </div>
              {id ? (
                <Link to={`/players/${id}`} className="row" style={{ gap: 8 }}>
                  <Avatar name={nameOf(id)} />
                  <div style={{ minWidth: 0 }}>
                    <div className="bold">{nameOf(id)}</div>
                    <div className="tiny muted">Impact {value(key, id)}</div>
                  </div>
                </Link>
              ) : (
                <div className="small muted">{key === 'fighter' ? 'No losing-side player in the top 3' : '—'}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MvpTable({
  players,
  nameOf,
  selected,
  onSelect,
  limit,
}: {
  players: PlayerImpact[];
  nameOf: (id: ID) => string;
  selected?: ID;
  onSelect?: (id: ID) => void;
  limit?: number;
}) {
  const rows = limit ? players.slice(0, limit) : players;
  return (
    <div>
      {rows.map((p, i) => {
        const body = (
          <>
            <span className="bold" style={{ width: 18, color: i < 3 ? 'var(--gold)' : 'var(--muted)' }}>
              {i + 1}
            </span>
            <Avatar name={nameOf(p.playerId)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="bold">{nameOf(p.playerId)}</div>
              <div className="tiny muted">{p.summary}</div>
              <div className="tiny muted">
                Bat {p.batting} · Bowl {p.bowling} · Field {p.fielding}
                {p.battingPressure !== null && ` · faced avg pressure ${p.battingPressure}`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{p.total}</div>
              <div className="tiny muted">{impactGrade(p.total)}</div>
            </div>
            {selected === p.playerId && <span style={{ color: 'var(--brand-2)', fontWeight: 800 }}>✓</span>}
          </>
        );
        return onSelect ? (
          <button
            key={p.playerId}
            className={`list-item ${selected === p.playerId ? 'selected' : ''}`}
            onClick={() => onSelect(p.playerId)}
          >
            {body}
          </button>
        ) : (
          <Link key={p.playerId} to={`/players/${p.playerId}`} className="list-item">
            {body}
          </Link>
        );
      })}
    </div>
  );
}
