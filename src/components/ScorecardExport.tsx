import { forwardRef, useMemo } from 'react';
import { economy, oversText, runRate, strikeRate, type InningsState, type MatchState } from '../engine/engine';
import { dismissalText, type NameOf } from '../engine/format';
import { computeMvp, impactGrade } from '../engine/impact';
import type { Match } from '../types';

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function topBatters(inn: InningsState, n = 2) {
  return [...inn.batters].filter((b) => b.balls > 0 || b.runs > 0).sort((a, b) => b.runs - a.runs || a.balls - b.balls).slice(0, n);
}
export function topBowlers(inn: InningsState, n = 2) {
  return [...inn.bowlers]
    .filter((b) => b.balls > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs / a.balls - b.runs / b.balls)
    .slice(0, n);
}

/** A classic cricket scorecard. Self-contained colours so it exports/prints identically in dark mode. */
export const ScorecardExport = forwardRef<
  HTMLDivElement,
  { match: Match; state: MatchState; nameOf: NameOf; clubName: string; clubPar?: number }
>(function ScorecardExport({ match, state, nameOf, clubName, clubPar }, ref) {
  const bpo = match.rules.ballsPerOver;
  const result = match.result ?? state.result;
  const mvp = useMemo(() => computeMvp(match, state, { clubPar }), [match, state, clubPar]);
  const potm = match.motmId ?? (result ? mvp.heroes.potm : undefined);
  const impact = new Map(mvp.players.map((p) => [p.playerId, p]));
  const heroes = result
    ? [
        { cls: 'potm', t: '🏅 Player of the match', id: potm, v: (id: string) => impact.get(id)?.total },
        { cls: '', t: '🏏 Best batter', id: mvp.heroes.bestBatter, v: (id: string) => impact.get(id)?.batting },
        { cls: '', t: '🎯 Best bowler', id: mvp.heroes.bestBowler, v: (id: string) => impact.get(id)?.bowling },
        {
          cls: '',
          t: '⚔️ Fighter of the match',
          id: mvp.heroes.fighter !== potm ? mvp.heroes.fighter : undefined,
          v: (id: string) => impact.get(id)?.total,
        },
      ].filter((h) => h.id)
    : [];
  return (
    <div className="sheet-export" ref={ref}>
      <div className="sx-head">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ background: '#fff', borderRadius: 12, padding: 3, flex: 'none', display: 'grid' }}>
            <img src="./logo-192.png" width={58} height={58} alt="" />
          </span>
          <div>
            <div className="club">{clubName}</div>
            <div className="title">
              {match.teams[0].name} v {match.teams[1].name}
            </div>
          </div>
        </div>
        <div className="sub">
          {match.title ? `${match.title} · ` : ''}
          {formatDate(match.date)}
          {match.venue ? ` · ${match.venue}` : ''} · {match.rules.overs} overs a side
        </div>
        {match.toss && (
          <div className="sub">
            Toss: {match.teams[match.toss.winner].name}, elected to {match.toss.decision} first
          </div>
        )}
        <div className="sx-scores">
          {state.innings.map((inn) => (
            <div key={inn.index}>
              <div className="n">{match.teams[inn.battingTeam].name}</div>
              <div className="s">
                {inn.runs}/{inn.wickets} <small>({oversText(inn.legalBalls, bpo)} ov)</small>
              </div>
            </div>
          ))}
        </div>
      </div>
      {result && (
        <div className="sx-result">
          <span>🏆 {result.text}</span>
          {potm && <span>⭐ POTM: {nameOf(potm)}</span>}
        </div>
      )}

      <div className="sx-body">
        {state.innings.map((inn) => (
          <InningsCard key={inn.index} match={match} inn={inn} nameOf={nameOf} />
        ))}

        {state.innings.length > 0 && (
          <div className="sx-highlights">
            {state.innings.map((inn) => (
              <div className="sx-card" key={inn.index}>
                <h4>{match.teams[inn.battingTeam].name} innings · top performers</h4>
                {topBatters(inn).map((b) => (
                  <div className="line" key={b.key}>
                    <span>🏏 {nameOf(b.playerId)}</span>
                    <b>
                      {b.runs}
                      {b.status === 'out' ? '' : '*'} ({b.balls})
                    </b>
                  </div>
                ))}
                {topBowlers(inn).map((b) => (
                  <div className="line" key={b.playerId}>
                    <span>🎯 {nameOf(b.playerId)}</span>
                    <b>
                      {b.wickets}/{b.runs} ({oversText(b.balls, bpo)})
                    </b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {heroes.length > 0 && (
          <div className="sx-heroes">
            {heroes.map((h) => (
              <div key={h.t} className={`sx-hero ${h.cls}`}>
                <div className="t">{h.t}</div>
                <div className="n">{nameOf(h.id!)}</div>
                <div className="s">Impact {h.v(h.id!)}</div>
              </div>
            ))}
          </div>
        )}

        {mvp.players.length > 0 && (
          <div className="sx-card">
            <h4>MVP · Impact score (pressure-weighted)</h4>
            {mvp.players.slice(0, 5).map((p, i) => (
              <div className="line" key={p.playerId}>
                <span>
                  {i + 1}. <b>{nameOf(p.playerId)}</b> <span style={{ color: '#778' }}>· {p.summary}</span>
                </span>
                <b>
                  {p.total} <span style={{ color: '#778', fontWeight: 500 }}>{impactGrade(p.total)}</span>
                </b>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sx-foot">Scored with NTU Cricket Scorer</div>
    </div>
  );
});

function InningsCard({ match, inn, nameOf }: { match: Match; inn: InningsState; nameOf: NameOf }) {
  const bpo = match.rules.ballsPerOver;
  const team = match.teams[inn.battingTeam];
  const batted = new Set(inn.batters.map((b) => b.playerId));
  const dnb = team.playerIds.filter((id) => !batted.has(id));
  const e = inn.extras;
  return (
    <div className="sx-innings">
      <div className="sx-inn-title">
        <span>
          {team.name} · {inn.index === 0 ? '1st' : '2nd'} innings
        </span>
        <span>
          {inn.runs}/{inn.wickets} ({oversText(inn.legalBalls, bpo)} ov)
        </span>
      </div>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Batter</th>
            <th>R</th>
            <th>B</th>
            <th>4s</th>
            <th>6s</th>
            <th>SR</th>
          </tr>
        </thead>
        <tbody>
          {inn.batters.map((b) => (
            <tr key={b.key}>
              <td>
                <div className="nm">
                  {nameOf(b.playerId)}
                  {b.stint > 1 ? ' (2nd turn)' : ''}
                </div>
                <div className="dm">{dismissalText(b, nameOf)}</div>
              </td>
              <td className="nm">{b.runs}</td>
              <td>{b.balls}</td>
              <td>{b.fours}</td>
              <td>{b.sixes}</td>
              <td>{strikeRate(b.runs, b.balls)}</td>
            </tr>
          ))}
          <tr>
            <td>
              Extras{' '}
              <span className="dm">
                (wd {e.wd}, nb {e.nb}, b {e.b}, lb {e.lb})
              </span>
            </td>
            <td className="nm">{e.total}</td>
            <td colSpan={4}></td>
          </tr>
          <tr className="tot">
            <td>
              Total{' '}
              <span className="dm">
                ({inn.wickets} wkts, {oversText(inn.legalBalls, bpo)} ov, RR {runRate(inn.runs, inn.legalBalls, bpo)})
              </span>
            </td>
            <td>{inn.runs}</td>
            <td colSpan={4}></td>
          </tr>
        </tbody>
      </table>
      {dnb.length > 0 && (
        <div className="sx-fow">
          <b>Did not bat:</b> {dnb.map((id) => nameOf(id)).join(', ')}
        </div>
      )}
      {inn.fow.length > 0 && (
        <div className="sx-fow">
          <b>Fall of wickets:</b>{' '}
          {inn.fow
            .map((f) => `${f.runs}-${f.wicketNo} (${nameOf(f.playerId)}, ${oversText(f.legalBalls, bpo)} ov)`)
            .join(', ')}
        </div>
      )}
      <table className="sx-table" style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th>Bowler</th>
            <th>O</th>
            <th>M</th>
            <th>R</th>
            <th>W</th>
            <th>Econ</th>
            <th>Wd</th>
            <th>Nb</th>
          </tr>
        </thead>
        <tbody>
          {inn.bowlers.map((b) => (
            <tr key={b.playerId}>
              <td className="nm">{nameOf(b.playerId)}</td>
              <td>{oversText(b.balls, bpo)}</td>
              <td>{b.maidens}</td>
              <td>{b.runs}</td>
              <td className="nm">{b.wickets}</td>
              <td>{economy(b.runs, b.balls, bpo)}</td>
              <td>{b.wides}</td>
              <td>{b.noBalls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
