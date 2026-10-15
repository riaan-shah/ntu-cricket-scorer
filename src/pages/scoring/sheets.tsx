import { useState } from 'react';
import { NewPlayerInline, PlayerPickList, type PickOption } from '../../components/PlayerPick';
import { OversPicker } from '../../components/OversPicker';
import { RulesEditor } from '../../components/RulesEditor';
import { askConfirm, Seg, Sheet, ToggleRow, toast } from '../../components/ui';
import {
  allowedOnFreeHit,
  oversText,
  type InningsState,
  type MatchState,
} from '../../engine/engine';
import { DISMISSAL_LABELS } from '../../engine/format';
import type { DismissalType, ExtraType, ID, Match, Player, ScoreEvent, TeamIdx } from '../../types';

export interface ScoringCtx {
  match: Match;
  state: MatchState;
  cur: InningsState;
  players: Player[];
  nameOf: (id: ID | null | undefined) => string;
  append: (ev: ScoreEvent) => void;
  mutate: (fn: (m: Match) => Match) => void;
  undo: () => void;
  /** Base fields for a ball event at the current state. */
  ballBase: () => { ts: number; strikerId: ID; nonStrikerId: ID | null; bowlerId: ID };
}

export function addToTeam(m: Match, pid: ID, side: TeamIdx | 'both'): Match {
  const teams = m.teams.map((t, i) => {
    const want = side === 'both' || side === i;
    return want && !t.playerIds.includes(pid) ? { ...t, playerIds: [...t.playerIds, pid] } : t;
  }) as Match['teams'];
  return { ...m, teams };
}

const appendTo = (m: Match, ev: ScoreEvent): Match => ({
  ...m,
  innings: m.innings.map((inn, i) => (i === m.innings.length - 1 ? { ...inn, events: [...inn.events, ev] } : inn)),
});

// ---------- Opening players ----------

export function StartSheet({ ctx }: { ctx: ScoringCtx }) {
  const { match, cur, nameOf, players } = ctx;
  const bat = match.teams[cur.battingTeam];
  const bowl = match.teams[cur.bowlingTeam];
  const [striker, setStriker] = useState<ID | null>(null);
  const [nonStriker, setNonStriker] = useState<ID | null>(null);
  const [bowler, setBowler] = useState<ID | null>(null);
  const [slot, setSlot] = useState<'s' | 'ns' | 'b'>('s');

  const pick = (id: ID) => {
    if (slot === 's') {
      setStriker(id);
      if (nonStriker === id) setNonStriker(null);
      setSlot(!nonStriker || nonStriker === id ? 'ns' : 'b');
    } else if (slot === 'ns') {
      setNonStriker(id);
      if (striker === id) setStriker(null);
      setSlot(!bowler ? 'b' : 's');
    } else {
      setBowler(id);
    }
  };

  const options: PickOption[] =
    slot === 'b'
      ? bowl.playerIds.filter((id) => id !== striker && id !== nonStriker).map((id) => ({ id }))
      : bat.playerIds
          .filter((id) => id !== bowler && id !== (slot === 's' ? nonStriker : striker))
          .map((id) => ({ id }));

  const canStart = !!striker && !!bowler && (!!nonStriker || bat.playerIds.length === 1);

  const SlotBtn = ({ k, label, value }: { k: 's' | 'ns' | 'b'; label: string; value: ID | null }) => (
    <button className={`choice ${slot === k ? 'on' : ''}`} onClick={() => setSlot(k)} style={{ textAlign: 'left' }}>
      <div className="tiny" style={{ opacity: 0.75 }}>
        {label}
      </div>
      <div>{value ? nameOf(value) : 'Select…'}</div>
    </button>
  );

  return (
    <Sheet open title={`${bat.name} innings · Openers`}>
      {cur.target !== null && (
        <div className="card card-pad small">
          Target <b>{cur.target}</b> from {match.rules.overs} overs
        </div>
      )}
      <div className="grid-3">
        <SlotBtn k="s" label="Striker" value={striker} />
        <SlotBtn k="ns" label="Non-striker" value={nonStriker} />
        <SlotBtn k="b" label="Bowler" value={bowler} />
      </div>
      <div className="section-title">
        {slot === 'b' ? `Opening bowler · ${bowl.name}` : `${slot === 's' ? 'Striker' : 'Non-striker'} · ${bat.name}`}
      </div>
      <PlayerPickList
        options={options}
        selected={slot === 's' ? striker : slot === 'ns' ? nonStriker : bowler}
        onPick={pick}
        nameOf={nameOf}
      />
      <NewPlayerInline
        players={players}
        label={`Add player to ${slot === 'b' ? bowl.name : bat.name}`}
        onAdd={(p) => {
          ctx.mutate((m) => addToTeam(m, p.id, slot === 'b' ? cur.bowlingTeam : cur.battingTeam));
          pick(p.id);
        }}
      />
      <button
        className="btn primary big block"
        disabled={!canStart}
        onClick={() =>
          ctx.append({ kind: 'start', ts: Date.now(), strikerId: striker!, nonStrikerId: nonStriker, bowlerId: bowler! })
        }
      >
        Start scoring
      </button>
      {ctx.state.innings.length > 1 && (
        <button className="btn ghost block" onClick={ctx.undo}>
          ↶ Back to innings break
        </button>
      )}
    </Sheet>
  );
}

// ---------- New batter ----------

export function BatterSheet({ ctx, onClose }: { ctx: ScoringCtx; onClose: () => void }) {
  const { match, cur, nameOf, players } = ctx;
  const bat = match.teams[cur.battingTeam];
  const onStrike = !cur.striker;
  const options: PickOption[] = cur.availableBatters.map((a) => ({
    id: a.playerId,
    sub:
      a.kind === 'retired'
        ? 'Retired hurt · returning'
        : a.kind === 'rebat'
          ? `Second turn (${cur.rebatsUsed + 1} of ${cur.rebatsAllowed} extra turn${cur.rebatsAllowed > 1 ? 's' : ''})`
          : undefined,
    badge: a.kind === 'rebat' ? <span className="badge gold">BAT AGAIN</span> : undefined,
  }));
  return (
    <Sheet open title={`New batter${onStrike ? ' (on strike)' : ''}`} onClose={onClose}>
      <PlayerPickList
        options={options}
        onPick={(id) => ctx.append({ kind: 'newBatter', ts: Date.now(), playerId: id })}
        nameOf={nameOf}
      />
      <NewPlayerInline
        players={players.filter((p) => !bat.playerIds.includes(p.id))}
        label={`Add a player to ${bat.name}`}
        onAdd={(p) =>
          ctx.mutate((m) => appendTo(addToTeam(m, p.id, cur.battingTeam), { kind: 'newBatter', ts: Date.now(), playerId: p.id }))
        }
      />
      <div className="grid-2">
        <button className="btn" onClick={ctx.undo}>
          ↶ Undo last ball
        </button>
        <button
          className="btn"
          onClick={() => {
            void askConfirm({ title: `End ${bat.name}'s innings now?`, confirmLabel: 'End innings' }).then(
              (ok) => ok && ctx.append({ kind: 'declare', ts: Date.now() }),
            );
          }}
        >
          End innings
        </button>
      </div>
    </Sheet>
  );
}

// ---------- Bowler ----------

export function BowlerSheet({
  ctx,
  mode,
  onClose,
}: {
  ctx: ScoringCtx;
  mode: 'new' | 'change';
  onClose: () => void;
}) {
  const { match, cur, nameOf, players } = ctx;
  const rules = match.rules;
  const bpo = rules.ballsPerOver;
  const bowl = match.teams[cur.bowlingTeam];
  const [override, setOverride] = useState(false);
  const atCrease = new Set([cur.striker?.playerId, cur.nonStriker?.playerId]);
  const figures = new Map(cur.bowlers.map((b) => [b.playerId, b]));
  let blocked = false;
  const options: PickOption[] = bowl.playerIds
    .filter((id) => !atCrease.has(id))
    .map((id) => {
      const f = figures.get(id);
      const reasons: string[] = [];
      if (mode === 'new' && rules.noConsecutiveOvers && id === cur.lastOverBowlerId) reasons.push('bowled last over');
      if (rules.maxOversPerBowler > 0 && (f?.balls ?? 0) >= rules.maxOversPerBowler * bpo) reasons.push('quota done');
      if (reasons.length) blocked = true;
      const isCurrent = mode === 'change' && id === cur.bowlerId;
      return {
        id,
        sub: [
          f ? `${oversText(f.balls, bpo)}-${f.maidens}-${f.runs}-${f.wickets}` : 'Yet to bowl',
          ...reasons,
        ].join(' · '),
        disabled: isCurrent || (reasons.length > 0 && !override),
      };
    });
  const overNo = Math.floor(cur.legalBalls / bpo) + 1;
  return (
    <Sheet
      open
      title={mode === 'new' ? `Bowler for over ${overNo}` : 'Change bowler (mid-over)'}
      onClose={onClose}
    >
      <PlayerPickList
        options={options}
        onPick={(id) => {
          ctx.append({ kind: 'newBowler', ts: Date.now(), playerId: id });
          if (mode === 'change') onClose();
        }}
        nameOf={nameOf}
      />
      {blocked && (
        <div className="card">
          <ToggleRow label="Allow anyway" hint="Override bowling restrictions" checked={override} onChange={setOverride} />
        </div>
      )}
      <NewPlayerInline
        players={players.filter((p) => !bowl.playerIds.includes(p.id))}
        label={`Add a player to ${bowl.name}`}
        onAdd={(p) => {
          ctx.mutate((m) => appendTo(addToTeam(m, p.id, cur.bowlingTeam), { kind: 'newBowler', ts: Date.now(), playerId: p.id }));
          if (mode === 'change') onClose();
        }}
      />
      {mode === 'new' && (
        <button className="btn block" onClick={ctx.undo}>
          ↶ Undo last ball
        </button>
      )}
    </Sheet>
  );
}

// ---------- Wicket ----------

const WICKET_TYPES: DismissalType[] = [
  'bowled',
  'caught',
  'lbw',
  'runOut',
  'stumped',
  'hitWicket',
  'outOfCage',
  'obstructing',
  'hitTwice',
];

export function WicketSheet({ ctx, onClose }: { ctx: ScoringCtx; onClose: () => void }) {
  const { match, cur, nameOf } = ctx;
  const rules = match.rules;
  const [type, setType] = useState<DismissalType | null>(null);
  const [outId, setOutId] = useState<ID>(cur.striker!.playerId);
  const [fielder, setFielder] = useState<ID | null>(null);
  const [runs, setRuns] = useState(0);
  const [delivery, setDelivery] = useState<'legal' | ExtraType>('legal');

  const types = WICKET_TYPES.filter((t) => t !== 'outOfCage' || rules.outOfCage);
  const needsFielder = type === 'caught' || type === 'runOut' || type === 'stumped';
  const choosesBatter = (type === 'runOut' || type === 'obstructing') && !!cur.nonStriker;
  const atCrease = new Set([cur.striker?.playerId, cur.nonStriker?.playerId]);
  const fielders = match.teams[cur.bowlingTeam].playerIds.filter((id) => !atCrease.has(id));
  const deliveryOptions: ('legal' | ExtraType)[] =
    type === 'runOut' || type === 'obstructing'
      ? ['legal', 'wd', 'nb', 'b', 'lb']
      : type === 'stumped' || type === 'hitWicket'
        ? ['legal', 'wd']
        : ['legal'];
  const effDelivery = deliveryOptions.includes(delivery) ? delivery : 'legal';

  const confirmOut = () => {
    if (!type) return;
    const extra = effDelivery === 'legal' ? undefined : effDelivery;
    ctx.append({
      kind: 'ball',
      ...ctx.ballBase(),
      runs: type === 'runOut' ? runs : 0,
      extra,
      nbRunsFrom: extra === 'nb' ? 'bat' : undefined,
      wicket: {
        type,
        playerOutId: choosesBatter ? outId : cur.striker!.playerId,
        fielderId: needsFielder && fielder ? fielder : undefined,
      },
    });
    if (navigator.vibrate) navigator.vibrate(120);
    onClose();
  };

  return (
    <Sheet open title="Wicket!" onClose={onClose}>
      {cur.freeHit && <div className="free-hit">FREE HIT — only run out{rules.outOfCageOnFreeHit ? ' / out of cage' : ''}</div>}
      <div className="choice-grid">
        {types.map((t) => (
          <button
            key={t}
            className={`choice danger ${type === t ? 'on' : ''}`}
            disabled={cur.freeHit && !allowedOnFreeHit(t, rules)}
            onClick={() => setType(t)}
          >
            {DISMISSAL_LABELS[t]}
          </button>
        ))}
      </div>

      {choosesBatter && (
        <>
          <div className="section-title">Who is out?</div>
          <Seg
            value={outId}
            onChange={setOutId}
            options={[cur.striker!, cur.nonStriker!].map((l) => ({
              value: l.playerId,
              label: `${nameOf(l.playerId)}${l === cur.striker ? ' (striker)' : ''}`,
            }))}
          />
        </>
      )}

      {type === 'runOut' && (
        <>
          <div className="section-title">Runs completed before the run out</div>
          <Seg
            value={String(runs)}
            onChange={(v) => setRuns(Number(v))}
            options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </>
      )}

      {type && deliveryOptions.length > 1 && (
        <>
          <div className="section-title">Delivery</div>
          <Seg
            value={effDelivery}
            onChange={setDelivery}
            options={deliveryOptions.map((d) => ({
              value: d,
              label: { legal: 'Legal', wd: 'Wide', nb: 'No ball', b: 'Bye', lb: 'Leg bye' }[d],
            }))}
          />
        </>
      )}

      {needsFielder && (
        <>
          <div className="section-title">
            {type === 'caught' ? 'Caught by' : type === 'stumped' ? 'Stumped by (keeper)' : 'Run out by (optional)'}
          </div>
          <PlayerPickList
            options={fielders.map((id) => ({
              id,
              sub: id === cur.bowlerId ? 'Bowler' : undefined,
            }))}
            selected={fielder}
            onPick={(id) => setFielder(fielder === id ? null : id)}
            nameOf={nameOf}
          />
        </>
      )}

      <button
        className="btn danger big block"
        disabled={!type || (type === 'caught' && !fielder)}
        onClick={confirmOut}
      >
        Confirm {type ? DISMISSAL_LABELS[type] : 'wicket'}
      </button>
    </Sheet>
  );
}

// ---------- Extras ----------

export function ExtrasSheet({
  ctx,
  kind,
  onClose,
}: {
  ctx: ScoringCtx;
  kind: ExtraType;
  onClose: () => void;
}) {
  const rules = ctx.match.rules;
  const [from, setFrom] = useState<'bat' | 'b' | 'lb'>('bat');
  const record = (runs: number, boundary = false) => {
    ctx.append({
      kind: 'ball',
      ...ctx.ballBase(),
      runs,
      extra: kind,
      boundary: kind === 'nb' && from === 'bat' ? boundary : undefined,
      nbRunsFrom: kind === 'nb' ? from : undefined,
    });
    onClose();
  };
  const title = { wd: 'Wide', nb: 'No ball', b: 'Byes', lb: 'Leg byes' }[kind];
  const choices =
    kind === 'wd' ? [0, 1, 2, 3, 4] : kind === 'nb' ? [0, 1, 2, 3, 4, 6] : [1, 2, 3, 4];
  return (
    <Sheet open title={title} onClose={onClose}>
      {kind === 'nb' && (
        <>
          <div className="section-title">Runs scored off</div>
          <Seg
            value={from}
            onChange={setFrom}
            options={[
              { value: 'bat', label: 'Bat' },
              { value: 'b', label: 'Byes' },
              { value: 'lb', label: 'Leg byes' },
            ]}
          />
        </>
      )}
      <div className="section-title">
        {kind === 'wd'
          ? `Extra runs taken (wide = ${rules.wideRuns})`
          : kind === 'nb'
            ? `Runs (no ball = ${rules.noBallRuns} + runs)`
            : 'Runs'}
      </div>
      <div className="choice-grid">
        {choices.map((n) => (
          <button key={n} className="choice" style={{ minHeight: 60, fontSize: 18 }} onClick={() => record(n, n === 4 || n === 6)}>
            {kind === 'wd' ? (n === 0 ? 'Wd' : `Wd + ${n}`) : kind === 'nb' ? (n === 0 ? 'Nb' : `Nb + ${n}`) : n}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- Retire ----------

export function RetireSheet({ ctx, onClose }: { ctx: ScoringCtx; onClose: () => void }) {
  const { cur, nameOf } = ctx;
  const crease = [cur.striker, cur.nonStriker].filter(Boolean).map((l) => l!.playerId);
  const [who, setWho] = useState<ID>(crease[0]);
  const [out, setOut] = useState(false);
  return (
    <Sheet open title="Retire batter" onClose={onClose}>
      <Seg value={who} onChange={setWho} options={crease.map((id) => ({ value: id, label: nameOf(id) }))} />
      <Seg
        value={out ? 'out' : 'hurt'}
        onChange={(v) => setOut(v === 'out')}
        options={[
          { value: 'hurt', label: 'Retired hurt (can return)' },
          { value: 'out', label: 'Retired out (wicket)' },
        ]}
      />
      <button
        className="btn primary big block"
        onClick={() => {
          ctx.append({ kind: 'retire', ts: Date.now(), playerId: who, out });
          onClose();
        }}
      >
        Retire {nameOf(who)}
      </button>
    </Sheet>
  );
}

// ---------- Add player mid-match ----------

export function AddPlayerSheet({ ctx, onClose }: { ctx: ScoringCtx; onClose: () => void }) {
  const { match, players, nameOf } = ctx;
  const [side, setSide] = useState<'0' | '1' | 'both'>('0');
  const target = side === 'both' ? 'both' : (Number(side) as TeamIdx);
  const inTeam = (id: ID) =>
    side === 'both'
      ? match.teams[0].playerIds.includes(id) && match.teams[1].playerIds.includes(id)
      : match.teams[Number(side)].playerIds.includes(id);
  const add = (id: ID) => {
    ctx.mutate((m) => addToTeam(m, id, target));
    toast(`${nameOf(id) || 'Player'} added to ${side === 'both' ? 'both teams' : match.teams[Number(side)].name}`);
    onClose();
  };
  return (
    <Sheet open title="Add player to match" onClose={onClose}>
      <Seg
        value={side}
        onChange={setSide}
        options={[
          { value: '0', label: match.teams[0].name },
          { value: '1', label: match.teams[1].name },
          { value: 'both', label: 'Both teams' },
        ]}
      />
      <NewPlayerInline
        players={players}
        onAdd={(p) => {
          ctx.mutate((m) => addToTeam(m, p.id, target));
          toast(`${p.name} added`);
          onClose();
        }}
      />
      <PlayerPickList
        options={players.filter((p) => !p.archived && !inTeam(p.id)).map((p) => ({ id: p.id }))}
        onPick={add}
        nameOf={nameOf}
        empty="Everyone in the club is already in this team"
      />
    </Sheet>
  );
}

// ---------- Match settings ----------

export function MatchSettingsSheet({ ctx, onClose }: { ctx: ScoringCtx; onClose: () => void }) {
  const { match } = ctx;
  const [rules, setRules] = useState(match.rules);
  const [names, setNames] = useState([match.teams[0].name, match.teams[1].name]);
  return (
    <Sheet open title="Match settings" onClose={onClose}>
      <div className="grid-2">
        {names.map((n, i) => (
          <label className="field" key={i}>
            <span>Team {i === 0 ? 'A' : 'B'}</span>
            <input
              className="input"
              value={n}
              onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </label>
        ))}
      </div>
      <RulesEditor rules={rules} onChange={setRules} lockFormat />

      <button
        className="btn primary big block"
        onClick={() => {
          ctx.mutate((m) => ({
            ...m,
            // Overs have their own sheet; keep whatever they are now.
            rules: { ...rules, overs: m.rules.overs },
            teams: m.teams.map((t, i) => ({ ...t, name: names[i].trim() || t.name })) as Match['teams'],
          }));
          toast('Match settings saved');
          onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}

// ---------- Change overs ----------

export function OversSheet({ ctx, onClose }: { ctx: ScoringCtx; onClose: () => void }) {
  const { match, state, cur } = ctx;
  const bpo = match.rules.ballsPerOver;
  const current = match.rules.overs;
  const [overs, setOvers] = useState(current);
  // Overs already bowled in the current innings (or the longest innings so far).
  const bowled = Math.max(...state.innings.map((i) => i.legalBalls), 0);
  const bowledOvers = Math.ceil(bowled / bpo);
  const diff = overs - current;
  const target = cur.target;
  return (
    <Sheet open title="Change overs" onClose={onClose}>
      <div className="card card-pad stack">
        <OversPicker value={overs} onChange={setOvers} />
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {[-1, 1, 2, 5].map((d) => (
            <button key={d} type="button" className="btn sm" disabled={overs + d < 1} onClick={() => setOvers(overs + d)}>
              {d > 0 ? `+${d}` : d} over{Math.abs(d) === 1 ? '' : 's'}
            </button>
          ))}
        </div>
      </div>
      <div className="small muted center">
        Currently {current} over{current === 1 ? '' : 's'} a side
        {diff !== 0 && (
          <>
            {' '}
            → <b style={{ color: 'var(--text)' }}>{overs}</b> ({diff > 0 ? `+${diff}` : diff})
          </>
        )}
        . Applies to both innings.
      </div>
      {overs < bowledOvers && (
        <div className="small" style={{ color: 'var(--accent)' }}>
          {bowledOvers} over{bowledOvers === 1 ? ' has' : 's have'} already been bowled — reducing below that ends the innings.
        </div>
      )}
      {target !== null && diff !== 0 && (
        <div className="small muted">The target stays at {target}; only the balls available change.</div>
      )}
      <button
        className="btn primary big block"
        disabled={diff === 0}
        onClick={() => {
          ctx.mutate((m) => ({ ...m, rules: { ...m.rules, overs } }));
          toast(`Now ${overs} over${overs === 1 ? '' : 's'} a side`);
          onClose();
        }}
      >
        {diff === 0 ? 'No change' : `Set to ${overs} overs`}
      </button>
    </Sheet>
  );
}