import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppBar, Avatar, Sheet, toast } from '../components/ui';
import { createPlayer, playersWithHistory, removePlayers, restorePlayer, useMatches, usePlayers } from '../db';
import { useAuth } from '../data/auth';
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
  const { canScore } = useAuth();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const history = useMemo(() => playersWithHistory(matches), [matches]);
  const matchQ = (p: Player) => p.name.toLowerCase().includes(q.trim().toLowerCase());
  const list = players.filter((p) => !p.archived && matchQ(p));
  const removed = players.filter((p) => p.archived && matchQ(p));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const allVisibleSelected = list.length > 0 && list.every((p) => selected.has(p.id));

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Player', 'Matches', 'Won', 'POTM', 'Inns', 'Runs', 'Balls', 'HS', 'Avg', 'SR', '4s', '6s', '30s', '50s', 'Ducks',
        'Overs', 'Wkts', 'Runs conceded', 'Econ', 'Best', 'Catches', 'Run outs', 'Stumpings', 'Out of cage', 'Total impact', 'Avg impact', 'Best batter', 'Best bowler', 'Fighter', 'Pressure runs', 'Avg pressure faced'],
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
        s.impactMatches ? (s.impact / s.impactMatches).toFixed(1) : '-', s.bestBatter, s.bestBowler, s.fighter, s.pressureRuns, s.avgPressureFaced ?? '-',
      ]);
    }
    downloadText(toCsv(rows), `ntu-cricket-player-stats-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  };

  return (
    <div>
      <AppBar
        title={selecting ? `${selected.size} selected` : 'Players'}
        back={selecting ? exitSelect : '/'}
        right={
          selecting ? (
            <button className="icon-btn" onClick={exitSelect}>
              Done
            </button>
          ) : (
            <>
              {canScore && list.length > 0 && (
                <button className="icon-btn" onClick={() => setSelecting(true)}>
                  Select
                </button>
              )}
              <button className="icon-btn" onClick={exportCsv} title="Export stats CSV">
                ⬇
              </button>
            </>
          )
        }
      />
      <div className="page" style={selecting ? { paddingBottom: 96 } : undefined}>
        <div className="row">
          <input className="input" placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} />
          {canScore && !selecting && (
            <button className="btn primary" onClick={() => setAdding(true)}>
              ＋ Add
            </button>
          )}
        </div>
        {selecting && (
          <div className="row">
            <button
              className="btn sm"
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  list.forEach((p) => (allVisibleSelected ? next.delete(p.id) : next.add(p.id)));
                  return next;
                })
              }
            >
              {allVisibleSelected ? 'Clear selection' : `Select all${q ? ' shown' : ''} (${list.length})`}
            </button>
            <span className="small muted">Tap players to select them</span>
          </div>
        )}
        <div className="card">
          {list.length === 0 && <div className="empty">No players yet. Add your club members!</div>}
          {list.map((p) => {
            const s = stats.get(p.id);
            const body = (
              <>
                {selecting && (
                  <span className={`check ${selected.has(p.id) ? 'on' : ''}`} aria-hidden>
                    {selected.has(p.id) ? '✓' : ''}
                  </span>
                )}
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
              </>
            );
            return selecting ? (
              <button
                key={p.id}
                className={`list-item ${selected.has(p.id) ? 'selected' : ''}`}
                onClick={() => toggle(p.id)}
                aria-pressed={selected.has(p.id)}
              >
                {body}
              </button>
            ) : (
              <Link key={p.id} to={`/players/${p.id}`} className="list-item">
                {body}
              </Link>
            );
          })}
        </div>

        {canScore && !selecting && players.some((p) => p.archived) && (
          <div className="card">
            <button className="list-item" onClick={() => setShowRemoved(!showRemoved)}>
              <div style={{ flex: 1 }} className="small bold">
                {showRemoved ? '▾' : '▸'} Removed players ({players.filter((p) => p.archived).length})
              </div>
            </button>
            {showRemoved &&
              removed.map((p) => (
                <div key={p.id} className="list-item" style={{ cursor: 'default' }}>
                  <Avatar name={p.name} />
                  <Link to={`/players/${p.id}`} style={{ flex: 1 }} className="bold">
                    {p.name}
                  </Link>
                  <button
                    className="btn sm"
                    onClick={async () => {
                      await restorePlayer(p);
                      toast(`${p.name} is back on the roster`);
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {selecting && (
        <div className="bulk-bar">
          <span className="bold">{selected.size} selected</span>
          <button className="btn danger" disabled={selected.size === 0} onClick={() => setConfirming(true)}>
            Remove{selected.size ? ` ${selected.size}` : ''}
          </button>
        </div>
      )}

      {confirming && (
        <RemoveConfirm
          players={players.filter((p) => selected.has(p.id))}
          history={history}
          onCancel={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false);
            exitSelect();
          }}
        />
      )}

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

/** Warning before removing players: spells out who gets deleted vs. archived. */
export function RemoveConfirm({
  players,
  history,
  onCancel,
  onDone,
}: {
  players: Player[];
  history: Set<string>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const archived = players.filter((p) => history.has(p.id));
  const deleted = players.filter((p) => !history.has(p.id));
  const names = (ps: Player[]) => ps.map((p) => p.name).join(', ');
  return (
    <Sheet open title={`Remove ${players.length} player${players.length === 1 ? '' : 's'}?`} onClose={busy ? undefined : onCancel}>
      {deleted.length > 0 && (
        <div className="card card-pad stack">
          <div className="bold" style={{ color: 'var(--accent)' }}>
            🗑 Deleted permanently ({deleted.length})
          </div>
          <div className="small">{names(deleted)}</div>
          <div className="tiny muted">They haven't played any matches, so nothing else is affected. This can't be undone.</div>
        </div>
      )}
      {archived.length > 0 && (
        <div className="card card-pad stack">
          <div className="bold">📦 Removed from the roster ({archived.length})</div>
          <div className="small">{names(archived)}</div>
          <div className="tiny muted">
            They've played matches, so their names stay on old scorecards. They'll be hidden from the player list, team
            pickers and leaderboards. You can restore them from “Removed players”.
          </div>
        </div>
      )}
      <div className="grid-2">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await removePlayers(players.map((p) => p.id));
              toast(
                [res.deleted && `${res.deleted} deleted`, res.archived && `${res.archived} removed from roster`]
                  .filter(Boolean)
                  .join(' · '),
              );
              onDone();
            } catch (e) {
              toast(`Couldn't remove: ${(e as Error).message}`);
              setBusy(false);
            }
          }}
        >
          {busy ? 'Removing…' : `Remove ${players.length}`}
        </button>
      </div>
    </Sheet>
  );
}