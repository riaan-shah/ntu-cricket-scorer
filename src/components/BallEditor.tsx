import { useState } from 'react';
import { computeMatch, editBall } from '../engine/engine';
import { ballNumber, DISMISSAL_LABELS } from '../engine/format';
import type { BallEvent, DismissalType, ExtraType, ID, Match } from '../types';
import { askConfirm, Seg, Sheet, Switch } from './ui';

type Delivery = 'legal' | ExtraType;

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

/**
 * Edit one recorded ball: runs, extras, boundary, who faced / bowled it, and dismissal details.
 * Adding or removing a wicket isn't offered — that changes who batted next, so it needs an undo back to that ball.
 */
export function BallEditSheet({
  match,
  inningsIndex,
  eventIndex,
  nameOf,
  onSave,
  onClose,
}: {
  match: Match;
  inningsIndex: number;
  eventIndex: number;
  nameOf: (id: ID) => string;
  onSave: (next: Match) => void;
  onClose: () => void;
}) {
  const inn = match.innings[inningsIndex];
  const original = inn.events[eventIndex] as BallEvent;
  const state = computeMatch(match).innings[inningsIndex];
  const view = state.balls.find((b) => b.eventIndex === eventIndex);
  const bowlingTeam = match.teams[1 - inn.battingTeam];

  const [bowlerId, setBowlerId] = useState(original.bowlerId);
  const [swapped, setSwapped] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>(original.extra ?? 'legal');
  const [runs, setRuns] = useState(original.runs);
  const [boundary, setBoundary] = useState(!!original.boundary);
  const [nbFrom, setNbFrom] = useState<'bat' | 'b' | 'lb'>(original.nbRunsFrom ?? 'bat');
  const [wType, setWType] = useState<DismissalType | undefined>(original.wicket?.type);
  const [outId, setOutId] = useState<ID | undefined>(original.wicket?.playerOutId);
  const [fielderId, setFielderId] = useState<ID | undefined>(original.wicket?.fielderId);

  const striker = swapped && original.nonStrikerId ? original.nonStrikerId : original.strikerId;
  const nonStriker = swapped && original.nonStrikerId ? original.strikerId : original.nonStrikerId;
  const runsOffBat = delivery === 'legal' || (delivery === 'nb' && nbFrom === 'bat');
  const canBeBoundary = runsOffBat && (runs === 4 || runs === 6);

  const build = (): BallEvent => {
    const ev: BallEvent = {
      kind: 'ball',
      ts: original.ts,
      strikerId: striker,
      nonStrikerId: nonStriker,
      bowlerId,
      runs,
      boundary: canBeBoundary ? boundary : undefined,
      extra: delivery === 'legal' ? undefined : delivery,
      nbRunsFrom: delivery === 'nb' ? nbFrom : undefined,
    };
    if (original.wicket && wType) {
      const crease = [striker, nonStriker].filter(Boolean) as ID[];
      ev.wicket = {
        type: wType,
        // Only run outs / obstructing can dismiss the non-striker.
        playerOutId:
          wType === 'runOut' || wType === 'obstructing' ? (outId && crease.includes(outId) ? outId : striker) : striker,
        fielderId: wType === 'caught' || wType === 'runOut' || wType === 'stumped' ? fielderId : undefined,
      };
    }
    return ev;
  };

  const save = () => {
    onSave(editBall(match, inningsIndex, eventIndex, build()));
    onClose();
  };
  const remove = async () => {
    const ok = await askConfirm({
      title: 'Delete this ball?',
      message: 'It will be removed from the scorecard and every total recalculated.',
      confirmLabel: 'Delete ball',
      danger: true,
    });
    if (!ok) return;
    onSave(editBall(match, inningsIndex, eventIndex, null));
    onClose();
  };

  const runChoices = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <Sheet
      open
      title={`Edit ball ${view ? ballNumber(view, match.rules.ballsPerOver) : ''}`}
      onClose={onClose}
    >
      <label className="field">
        <span>Bowler</span>
        <select className="input" value={bowlerId} onChange={(e) => setBowlerId(e.target.value)}>
          {[...new Set([original.bowlerId, ...bowlingTeam.playerIds])].map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      </label>

      {original.nonStrikerId && (
        <div className="field">
          <span>Batter on strike</span>
          <Seg
            value={swapped ? 'b' : 'a'}
            onChange={(v) => setSwapped(v === 'b')}
            options={[
              { value: 'a', label: nameOf(original.strikerId) },
              { value: 'b', label: nameOf(original.nonStrikerId) },
            ]}
          />
        </div>
      )}

      <div className="field">
        <span>Delivery</span>
        <Seg
          value={delivery}
          onChange={setDelivery}
          options={[
            { value: 'legal', label: 'Legal' },
            { value: 'wd', label: 'Wide' },
            { value: 'nb', label: 'No ball' },
            { value: 'b', label: 'Bye' },
            { value: 'lb', label: 'Leg bye' },
          ]}
        />
      </div>

      {delivery === 'nb' && (
        <div className="field">
          <span>No-ball runs came off</span>
          <Seg
            value={nbFrom}
            onChange={setNbFrom}
            options={[
              { value: 'bat', label: 'Bat' },
              { value: 'b', label: 'Byes' },
              { value: 'lb', label: 'Leg byes' },
            ]}
          />
        </div>
      )}

      <div className="field">
        <span>
          {delivery === 'wd'
            ? `Runs taken on the wide (plus ${match.rules.wideRuns} for the wide)`
            : delivery === 'nb'
              ? `Runs (plus ${match.rules.noBallRuns} for the no ball)`
              : delivery === 'legal'
                ? 'Runs off the bat'
                : 'Runs'}
        </span>
        <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
          {runChoices.map((n) => (
            <button
              key={n}
              type="button"
              className={`choice ${runs === n ? 'on' : ''}`}
              onClick={() => {
                setRuns(n);
                setBoundary(n === 4 || n === 6);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {canBeBoundary && (
        <div className="card">
          <div className="toggle-row">
            <div className="text">
              <div>Boundary</div>
              <div className="small muted">Counts as a {runs} in the batter's 4s/6s</div>
            </div>
            <Switch checked={boundary} onChange={setBoundary} />
          </div>
        </div>
      )}

      {original.wicket ? (
        <>
          <div className="section-title">Wicket</div>
          <div className="choice-grid">
            {WICKET_TYPES.filter((t) => t !== 'outOfCage' || match.rules.outOfCage).map((t) => (
              <button key={t} type="button" className={`choice danger ${wType === t ? 'on' : ''}`} onClick={() => setWType(t)}>
                {DISMISSAL_LABELS[t]}
              </button>
            ))}
          </div>
          {(wType === 'runOut' || wType === 'obstructing') && nonStriker && (
            <Seg
              value={outId === nonStriker ? 'ns' : 's'}
              onChange={(v) => setOutId(v === 'ns' ? nonStriker : striker)}
              options={[
                { value: 's', label: `${nameOf(striker)} out` },
                { value: 'ns', label: `${nameOf(nonStriker)} out` },
              ]}
            />
          )}
          {(wType === 'caught' || wType === 'runOut' || wType === 'stumped') && (
            <label className="field">
              <span>{wType === 'caught' ? 'Caught by' : wType === 'stumped' ? 'Stumped by' : 'Run out by'}</span>
              <select className="input" value={fielderId ?? ''} onChange={(e) => setFielderId(e.target.value || undefined)}>
                <option value="">—</option>
                {bowlingTeam.playerIds.map((id) => (
                  <option key={id} value={id}>
                    {nameOf(id)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <div className="tiny muted">
          To add a wicket on this ball, undo back to it — a wicket changes who batted next.
        </div>
      )}

      <button className="btn primary big block" onClick={save} disabled={wType === 'caught' && !fielderId}>
        Save changes
      </button>
      {!original.wicket && (
        <button className="btn ghost block" style={{ color: 'var(--accent)' }} onClick={remove}>
          🗑 Delete this ball
        </button>
      )}
      {match.status === 'completed' && (
        <div className="tiny muted center">
          The result updates automatically. Check Player of the Match afterwards if the change was big.
        </div>
      )}
    </Sheet>
  );
}
