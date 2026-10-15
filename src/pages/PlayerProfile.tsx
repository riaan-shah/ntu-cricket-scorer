import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PlayerPickList } from '../components/PlayerPick';
import { AppBar, askConfirm, Avatar, Seg, Sheet, toast } from '../components/ui';
import { mergePlayers, playersWithHistory, restorePlayer, savePlayer, useMatches, usePlayerNames } from '../db';
import { RemoveConfirm } from './Players';
import {
  batAverage,
  batStrikeRate,
  bowlAverage,
  bowlEconomy,
  bowlStrikeRate,
  computeCareerStats,
} from '../engine/stats';
import { impactGrade, pressureLabel } from '../engine/impact';
import { useAuth } from '../data/auth';
import { FormChart } from '../components/FormChart';
import { ShotChart } from '../components/ShotChart';
import { shotZones } from '../engine/insights';
import { battingForm, bowlingForm } from './Compare';
import type { Player, PlayerRole } from '../types';

const ROLES: PlayerRole[] = ['Batter', 'Bowler', 'All-rounder', 'Wicket-keeper'];

export function PlayerForm({
  initial,
  existing,
  onSave,
}: {
  initial?: Player;
  existing: Player[];
  onSave: (p: Partial<Player>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<PlayerRole | undefined>(initial?.role);
  const [bat, setBat] = useState(initial?.battingStyle);
  const [bowl, setBowl] = useState(initial?.bowlingStyle ?? '');
  const dupe = existing.find((p) => p.id !== initial?.id && p.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || dupe) return;
        onSave({ name: name.trim(), role, battingStyle: bat, bowlingStyle: bowl.trim() || undefined });
      }}
    >
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      {dupe && <div className="small" style={{ color: 'var(--accent)' }}>A player called “{dupe.name}” already exists.</div>}
      <div className="field">
        <span>Role</span>
        <div className="choice-grid">
          {ROLES.map((r) => (
            <button type="button" key={r} className={`choice ${role === r ? 'on' : ''}`} onClick={() => setRole(role === r ? undefined : r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Batting</span>
        <Seg
          value={bat ?? ('' as never)}
          onChange={(v) => setBat(v)}
          options={[
            { value: 'Right-hand bat', label: 'Right-hand' },
            { value: 'Left-hand bat', label: 'Left-hand' },
          ]}
        />
      </div>
      <label className="field">
        <span>Bowling style</span>
        <input
          className="input"
          placeholder="e.g. Right-arm medium, Off spin"
          value={bowl}
          onChange={(e) => setBowl(e.target.value)}
        />
      </label>
      <button className="btn primary big block" type="submit" disabled={!name.trim() || !!dupe}>
        Save
      </button>
    </form>
  );
}

export default function PlayerProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const { players, map, nameOf } = usePlayerNames();
  const matches = useMatches() ?? [];
  const stats = useMemo(() => computeCareerStats(matches), [matches]);
  const zones = useMemo(() => shotZones(matches, id ?? ''), [matches, id]);
  const [tab, setTab] = useState<'bat' | 'bowl' | 'field'>('bat');
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { canScore } = useAuth();
  const player = id ? map.get(id) : undefined;
  if (!player) return <AppBar title="Player" back="/players" />;
  const s = stats.get(player.id);
  const b = s?.bat;
  const w = s?.bowl;

  const grid = (items: [string, string | number][]) => (
    <div className="stat-grid">
      {items.map(([l, v]) => (
        <div className="stat" key={l}>
          <div className="v">{v}</div>
          <div className="l">{l}</div>
        </div>
      ))}
    </div>
  );

  const remove = () => setRemoving(true);


  return (
    <div>
      <AppBar
        title={player.name}
        back="/players"
        right={
          canScore ? (
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit">
              ✏️
            </button>
          ) : undefined
        }
      />
      <div className="score-hero" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <Avatar name={player.name} size="lg" />
        <div style={{ fontSize: 22, fontWeight: 800 }}>{player.name}</div>
        <div className="meta" style={{ justifyContent: 'center' }}>
          {player.role && <span>{player.role}</span>}
          {player.battingStyle && <span>{player.battingStyle}</span>}
          {player.bowlingStyle && <span>{player.bowlingStyle}</span>}
        </div>
      </div>
      <div className="page">
        {player.archived && (
          <div className="card card-pad row">
            <div style={{ flex: 1 }} className="small">
              <b>Removed player.</b> Hidden from the roster and leaderboards; kept so old scorecards show the name.
            </div>
            {canScore && (
              <button
                className="btn sm"
                onClick={async () => {
                  await restorePlayer(player);
                  toast('Restored to the roster');
                }}
              >
                Restore
              </button>
            )}
          </div>
        )}
        <div className="card">
          {grid([
            ['Matches', s?.matches ?? 0],
            ['Won', s?.wins ?? 0],
            ['Lost', s?.losses ?? 0],
            ['POTM', s?.motm ?? 0],
          ])}
        </div>

        {s && s.impactMatches > 0 && (
          <div className="card">
            <div className="card-head">
              <h2>MVP 2.0</h2>
              <span className="tiny muted">pressure-weighted impact</span>
            </div>
            {grid([
              ['Total impact', s.impact.toFixed(1)],
              ['Avg / match', (s.impact / s.impactMatches).toFixed(1)],
              ['Best', s.bestImpact],
              ['Avg grade', impactGrade(s.impact / s.impactMatches)],
              ['Best batter', s.bestBatter],
              ['Best bowler', s.bestBowler],
              ['Fighter', s.fighter],
              ['POTM', s.motm],
              ['Pressure runs', s.pressureRuns],
              ['Avg pressure faced', s.avgPressureFaced ?? '-'],
              ['Pressure', s.avgPressureFaced !== null ? pressureLabel(s.avgPressureFaced) : '-'],
              ['% runs under pressure', s.bat.runs ? `${Math.round((s.pressureRuns * 100) / s.bat.runs)}%` : '-'],
            ])}
          </div>
        )}

        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'bat', label: 'Batting' },
            { value: 'bowl', label: 'Bowling' },
            { value: 'field', label: 'Fielding' },
          ]}
        />

        {tab === 'bat' && b && (
          <div className="card">
            {grid([
              ['Innings', b.innings],
              ['Runs', b.runs],
              ['Highest', `${b.highest}${b.highestNotOut ? '*' : ''}`],
              ['Average', batAverage(b)],
              ['Strike rate', batStrikeRate(b)],
              ['Not outs', b.notOuts],
              ['4s', b.fours],
              ['6s', b.sixes],
              ['30s', b.thirties],
              ['50s', b.fifties],
              ['Ducks', b.ducks],
              ['Balls', b.balls],
            ])}
          </div>
        )}
        {tab === 'bowl' && w && (
          <div className="card">
            {grid([
              ['Innings', w.innings],
              ['Overs', `${Math.floor(w.balls / 6)}.${w.balls % 6}`],
              ['Wickets', w.wickets],
              ['Best', w.innings ? `${w.bestW}/${w.bestR}` : '-'],
              ['Economy', bowlEconomy(w)],
              ['Average', bowlAverage(w)],
              ['Strike rate', bowlStrikeRate(w)],
              ['Maidens', w.maidens],
              ['Dots', w.dots],
              ['Wides', w.wides],
              ['No balls', w.noBalls],
              ['3+ wkts', w.threeW + w.fiveW],
            ])}
          </div>
        )}
        {tab === 'field' && s && (
          <div className="card">
            {grid([
              ['Catches', s.catches],
              ['Run outs', s.runOuts],
              ['Stumpings', s.stumpings],
              ['Out of cage', s.outOfCage],
              ['Runs saved', s.runsSaved],
              ['Catches dropped', s.drops],
              ['Net fielding', s.catches + s.runOuts + s.stumpings - s.drops],
              ['Dismissals', s.catches + s.runOuts + s.stumpings],
            ])}
          </div>
        )}
        {!s && <div className="card empty">No completed matches yet.</div>}

        {s && s.performances.length > 0 && (
          <>
            <div className="card">
              <div className="card-head">
                <h2>Batting form · last 10</h2>
                <Link to={`/compare?a=${player.id}`} className="link-btn">
                  Compare →
                </Link>
              </div>
              <FormChart points={battingForm(s)} unit="runs" />
            </div>
            {bowlingForm(s).length > 0 && (
              <div className="card">
                <div className="card-head">
                  <h2>Bowling form · wickets</h2>
                </div>
                <FormChart points={bowlingForm(s)} unit="wickets" color="var(--series-2)" />
              </div>
            )}
          </>
        )}

        {zones.tagged > 0 && (
          <div className="card">
            <div className="card-head">
              <h2>Shot chart</h2>
              <span className="tiny muted">
                {zones.tagged} shots · {zones.runs} runs
              </span>
            </div>
            <div className="card-pad">
              <ShotChart zones={zones.zones} leftHanded={player.battingStyle === 'Left-hand bat'} />
              <div className="tiny muted center" style={{ marginTop: 6 }}>
                Bowler's end at the top. Runs from shots the scorer tagged with a zone.
              </div>
            </div>
          </div>
        )}

        {s && s.performances.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h2>Recent matches</h2>
            </div>
            {s.performances.slice(0, 15).map((p) => (
              <Link key={p.matchId} to={`/match/${p.matchId}`} className="list-item">
                <span
                  className="badge"
                  style={{
                    background: p.result === 'W' ? 'var(--good)' : p.result === 'L' ? 'var(--accent)' : undefined,
                    color: p.result === 'W' || p.result === 'L' ? '#fff' : undefined,
                  }}
                >
                  {p.result}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small bold">vs {p.opponent}</div>
                  <div className="tiny muted">{p.date}</div>
                </div>
                <div className="small" style={{ textAlign: 'right' }}>
                  {p.bat.map((x, i) => (
                    <div key={i}>
                      🏏 {x.runs}
                      {x.out ? '' : '*'} ({x.balls})
                    </div>
                  ))}
                  {p.bowl.map((x, i) => (
                    <div key={i}>
                      🎯 {x.wickets}/{x.runs}
                    </div>
                  ))}
                </div>
                {p.impact !== null && (
                  <span className="badge" title="Impact score">
                    {p.impact}
                  </span>
                )}
                {p.motm && <span title="Player of the match">🏅</span>}
              </Link>
            ))}
          </div>
        )}

        {canScore && (
        <div className="row wrap">
          <button className="btn sm" onClick={() => setMerging(true)}>
            Merge duplicate…
          </button>
          {!player.archived && (
            <button className="btn sm danger" onClick={remove}>
              Remove
            </button>
          )}
        </div>
        )}
      </div>

      {editing && (
        <Sheet open title="Edit player" onClose={() => setEditing(false)}>
          <PlayerForm
            initial={player}
            existing={players}
            onSave={async (data) => {
              await savePlayer({ ...player, ...data });
              setEditing(false);
              toast('Saved');
            }}
          />
        </Sheet>
      )}
      {removing && (
        <RemoveConfirm
          players={[player]}
          history={playersWithHistory(matches)}
          onCancel={() => setRemoving(false)}
          onDone={() => nav('/players', { replace: true })}
        />
      )}
      {merging && (
        <Sheet open title={`Merge ${player.name} into…`} onClose={() => setMerging(false)}>
          <div className="small muted">
            All of {player.name}'s matches and stats move to the player you pick, and this profile is removed. Use this
            when the same person was added twice.
          </div>
          <PlayerPickList
            options={players.filter((p) => p.id !== player.id && !p.archived).map((p) => ({ id: p.id }))}
            nameOf={nameOf}
            onPick={async (into) => {
              const ok = await askConfirm({
                title: `Merge ${player.name} into ${nameOf(into)}?`,
                message: `All of ${player.name}'s matches and stats move to ${nameOf(into)}. This can't be undone.`,
                confirmLabel: 'Merge',
                danger: true,
              });
              if (!ok) return;
              await mergePlayers(player.id, into);
              toast('Players merged');
              nav(`/players/${into}`, { replace: true });
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
