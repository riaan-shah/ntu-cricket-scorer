import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { computeMatch, oversText } from '../engine/engine';
import type { Match } from '../types';

export function MatchCard({ match, nameOf }: { match: Match; nameOf: (id: string | undefined) => string }) {
  const state = useMemo(() => computeMatch(match), [match]);
  const bpo = match.rules.ballsPerOver;
  const scoreFor = (team: 0 | 1) => state.innings.find((i) => i.battingTeam === team);
  const result = match.result ?? state.result;
  const href = match.status === 'live' ? `/match/${match.id}/score` : `/match/${match.id}`;
  return (
    <Link to={href} className="match-card">
      <div className="row">
        {match.status === 'live' && <span className="badge live">● LIVE</span>}
        {match.status === 'abandoned' && <span className="badge">ABANDONED</span>}
        <span className="tiny muted">
          {match.date}
          {match.venue ? ` · ${match.venue}` : ''} · {match.rules.overs} ov
          {match.title ? ` · ${match.title}` : ''}
        </span>
      </div>
      <div className="teams">
        {([0, 1] as const).map((t) => {
          const inn = scoreFor(t);
          return (
            <div className="team-line" key={t}>
              <span>{match.teams[t].name}</span>
              <span>
                {inn ? (
                  <>
                    {inn.runs}/{inn.wickets} <span className="muted small">({oversText(inn.legalBalls, bpo)})</span>
                  </>
                ) : (
                  <span className="muted small">yet to bat</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {result ? (
        <div className="result">
          {result.text}
          {match.motmId && <span className="muted small"> · POTM {nameOf(match.motmId)}</span>}
        </div>
      ) : (
        match.status === 'live' && (
          <div className="result" style={{ color: 'var(--accent)' }}>
            {state.phase === 'break' ? 'Innings break' : 'In progress'} — tap to resume
          </div>
        )
      )}
    </Link>
  );
}
