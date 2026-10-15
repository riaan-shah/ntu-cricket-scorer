import type { MatchRules } from '../types';
import { StepperRow, ToggleRow } from './ui';

export function RulesEditor({
  rules,
  onChange,
  lockFormat,
}: {
  rules: MatchRules;
  onChange: (r: MatchRules) => void;
  /** Balls-per-over can't change once a match has started. */
  lockFormat?: boolean;
}) {
  const set = <K extends keyof MatchRules>(k: K, v: MatchRules[K]) => onChange({ ...rules, [k]: v });
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>Format</h2>
        </div>
        <StepperRow
          label="Overs per innings"
          hint="You can increase this mid-match"
          value={rules.overs}
          min={1}
          max={50}
          onChange={(v) => set('overs', v)}
        />
        {!lockFormat && (
          <StepperRow
            label="Balls per over"
            value={rules.ballsPerOver}
            min={1}
            max={10}
            onChange={(v) => set('ballsPerOver', v)}
          />
        )}
        <StepperRow
          label="Max overs per bowler"
          hint={rules.maxOversPerBowler === 0 ? 'No limit' : undefined}
          value={rules.maxOversPerBowler}
          min={0}
          max={50}
          onChange={(v) => set('maxOversPerBowler', v)}
        />
        <ToggleRow
          label="No consecutive overs"
          hint="Same bowler can't bowl back-to-back (can be overridden)"
          checked={rules.noConsecutiveOvers}
          onChange={(v) => set('noConsecutiveOvers', v)}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Club rules</h2>
        </div>
        <ToggleRow
          label="Ball out of the cage = OUT"
          hint="Adds a one-tap “Out of cage” button"
          checked={rules.outOfCage}
          onChange={(v) => set('outOfCage', v)}
        />
        {rules.outOfCage && (
          <>
            <ToggleRow
              label="Out of cage counts as bowler's wicket"
              checked={rules.outOfCageBowlerCredit}
              onChange={(v) => set('outOfCageBowlerCredit', v)}
            />
            <ToggleRow
              label="Out of cage applies on a free hit"
              checked={rules.outOfCageOnFreeHit}
              onChange={(v) => set('outOfCageOnFreeHit', v)}
            />
          </>
        )}
        <ToggleRow
          label="Short team bats again"
          hint="If a side has fewer players, dismissed batters can take the extra turns"
          checked={rules.rebatWhenShort}
          onChange={(v) => set('rebatWhenShort', v)}
        />
        <ToggleRow
          label="Last man stands"
          hint="Final batter can carry on without a partner"
          checked={rules.lastManStands}
          onChange={(v) => set('lastManStands', v)}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Extras</h2>
        </div>
        <StepperRow label="Wide runs" value={rules.wideRuns} min={0} max={5} onChange={(v) => set('wideRuns', v)} />
        <ToggleRow label="Wide is re-bowled" checked={rules.wideReball} onChange={(v) => set('wideReball', v)} />
        <StepperRow
          label="No-ball runs"
          value={rules.noBallRuns}
          min={0}
          max={5}
          onChange={(v) => set('noBallRuns', v)}
        />
        <ToggleRow
          label="No-ball is re-bowled"
          checked={rules.noBallReball}
          onChange={(v) => set('noBallReball', v)}
        />
        <ToggleRow label="Free hit after no-ball" checked={rules.freeHit} onChange={(v) => set('freeHit', v)} />
      </div>
    </div>
  );
}
