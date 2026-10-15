import { forwardRef, useMemo } from 'react';
import { oversText, oversTextFull, type InningsState, type MatchState } from '../engine/engine';
import type { NameOf } from '../engine/format';
import { computeMvp } from '../engine/impact';
import type { ID, Match } from '../types';
import { topBowlers } from './ScorecardExport';

/** Innings colours: first innings gold, second innings blue (as in the club's match-summary graphic). */
const INNINGS_COLORS = ['#e8b84a', '#8f9ff5'];

function teamAbbr(name: string) {
  const clean = name.trim();
  if (clean.length <= 4) return clean.toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : clean.slice(0, 3)).slice(0, 3).toUpperCase();
}

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Shareable "Match Summary" graphic. Fixed 960px wide, self-contained colours. */
export const SummaryCard = forwardRef<
  HTMLDivElement,
  { match: Match; state: MatchState; nameOf: NameOf; clubName: string; tagline: string; clubPar?: number }
>(function SummaryCard({ match, state, nameOf, clubName, tagline, clubPar }, ref) {
  const mvp = useMemo(() => computeMvp(match, state, { clubPar }), [match, state, clubPar]);
  const result = match.result ?? state.result;
  const motm = result ? (match.motmId ?? mvp.heroes.potm) : undefined;

  return (
    <div className="sm-card" ref={ref}>
      <div className="sm-header">
        <div>
          <div className="sm-kicker">{clubName}</div>
          <div className="sm-title">Match summary</div>
          <div className="sm-sub">
            {match.teams[0].name} v {match.teams[1].name} · {formatDate(match.date)}
            {match.venue ? ` · ${match.venue}` : ''}
          </div>
        </div>
        <span className="sm-logo">
          <img src="./logo-192.png" width={64} height={64} alt="" />
        </span>
      </div>

      <div className={`sm-grid ${motm ? '' : 'no-motm'}`}>
        <div className="sm-left">
          {state.innings.map((inn, i) => (
            <InningsBlock key={inn.index} match={match} inn={inn} color={INNINGS_COLORS[i]} nameOf={nameOf} />
          ))}
          <div className={`sm-result ${result ? (result.winner === null ? 'tie' : '') : 'live'}`}>
            {result ? <ResultText text={result.text} /> : 'Match in progress'}
          </div>
        </div>

        {motm && <MotmPanel match={match} state={state} motm={motm} nameOf={nameOf} />}
      </div>

      <div className="sm-foot">{tagline}</div>
    </div>
  );
});

function InningsBlock({ match, inn, color, nameOf }: { match: Match; inn: InningsState; color: string; nameOf: NameOf }) {
  const bpo = match.rules.ballsPerOver;
  const team = match.teams[inn.battingTeam];
  const overs =
    inn.target === null
      ? `${oversTextFull(inn.legalBalls, bpo)} overs`
      : `${oversTextFull(inn.legalBalls, bpo)} / ${oversTextFull(inn.maxBalls, bpo)} overs · target ${inn.target}`;
  const bats = mergedTopBatters(inn, 3);
  const bowls = topBowlers(inn, 3);
  return (
    <div className="sm-inn" style={{ borderLeftColor: color }}>
      <div className="sm-inn-head">
        <span className={`sm-badge ${inn.index === 0 ? 'gold' : 'blue'}`}>{teamAbbr(team.name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sm-team">{team.name}</div>
          <div className="sm-overs">{overs}</div>
        </div>
        <div className="sm-score" style={{ color }}>
          {inn.runs}/{inn.wickets}
        </div>
      </div>
      <div className="sm-cols">
        <div className="sm-col">
          {bats.map((b) => (
            <div className="sm-row" key={b.playerId}>
              <span className="sm-name">{nameOf(b.playerId)}</span>
              <span>
                <b style={{ color }}>{b.runs}</b> <span className="sm-muted">({b.balls})</span>
                {b.notOut ? '*' : ''}
              </span>
            </div>
          ))}
          {bats.length === 0 && <div className="sm-muted">Yet to bat</div>}
        </div>
        <div className="sm-col">
          {bowls.map((b) => (
            <div className="sm-row" key={b.playerId}>
              <span className="sm-name">{nameOf(b.playerId)}</span>
              <b style={{ color }}>
                {b.wickets}/{b.runs}
              </b>
            </div>
          ))}
          {bowls.length === 0 && <div className="sm-muted">—</div>}
        </div>
      </div>
    </div>
  );
}

function MotmPanel({
  match,
  state,
  motm,
  nameOf,
}: {
  match: Match;
  state: MatchState;
  motm: ID;
  nameOf: NameOf;
}) {
  const bpo = match.rules.ballsPerOver;
  const name = nameOf(motm);
  const teams = match.teams.filter((t) => t.playerIds.includes(motm));
  const teamName = teams.length === 1 ? teams[0].name : '';

  let batRuns = 0;
  let batBalls = 0;
  let batted = false;
  let notOut = false;
  let fours = 0;
  let sixes = 0;
  const bowl: string[] = [];
  let catches = 0;
  let runOuts = 0;
  let stumpings = 0;
  for (const inn of state.innings) {
    for (const b of inn.batters) {
      if (b.playerId !== motm) continue;
      batted = true;
      batRuns += b.runs;
      batBalls += b.balls;
      fours += b.fours;
      sixes += b.sixes;
      notOut = b.status !== 'out';
    }
    for (const bw of inn.bowlers)
      if (bw.playerId === motm && (bw.balls > 0 || bw.runs > 0))
        bowl.push(`${bw.wickets}/${bw.runs} (${oversText(bw.balls, bpo)})`);
    for (const b of inn.batters) {
      const d = b.dismissal;
      if (d?.fielderId !== motm) continue;
      if (d.type === 'caught') catches++;
      if (d.type === 'runOut') runOuts++;
      if (d.type === 'stumped') stumpings++;
    }
  }
  const field = [
    catches && `${catches} catch${catches > 1 ? 'es' : ''}`,
    runOuts && `${runOuts} run out${runOuts > 1 ? 's' : ''}`,
    stumpings && `${stumpings} stumping${stumpings > 1 ? 's' : ''}`,
  ].filter(Boolean) as string[];
  const bat = batted ? `${batRuns}${notOut ? '*' : ''} (${batBalls})` : '';
  const boundaries = [fours && `${fours}×4`, sixes && `${sixes}×6`].filter(Boolean).join(' · ');
  const headline = [teamName, bat || bowl[0]].filter(Boolean).join(' · ');

  const rows: [string, string][] = [];
  if (bat) rows.push(['Batting', bat + (boundaries ? `  ·  ${boundaries}` : '')]);
  if (bowl.length) rows.push(['Bowling', bowl.join(' & ')]);
  if (field.length) rows.push(['Fielding', field.join(', ')]);

  return (
    <div className="sm-right">
      <div className="sm-motm-label">Man of the match</div>
      <div className="sm-motm-box">
        <div className="sm-medal">
          <span>
            {name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]!.toUpperCase())
              .join('')}
          </span>
        </div>
        <div className="sm-stats">
          {rows.map(([k, v]) => (
            <div key={k} className="sm-stat">
              <div className="k">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="sm-motm-name">{name}</div>
      {headline && <div className="sm-motm-line">{headline}</div>}
    </div>
  );
}

/** "X won by 2 wickets (5 balls left)" -> big main line, smaller bracket so it fits on one line. */
function ResultText({ text }: { text: string }) {
  const i = text.indexOf(' (');
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)} <span className="sm-result-extra">{text.slice(i + 1)}</span>
    </>
  );
}
/** Top batters with a player's batting turns combined (a short side's batter may bat twice). */
function mergedTopBatters(inn: InningsState, n: number) {
  const byPlayer = new Map<ID, { playerId: ID; runs: number; balls: number; notOut: boolean }>();
  for (const b of inn.batters) {
    const cur = byPlayer.get(b.playerId) ?? { playerId: b.playerId, runs: 0, balls: 0, notOut: false };
    cur.runs += b.runs;
    cur.balls += b.balls;
    cur.notOut = b.status !== 'out'; // latest turn decides
    byPlayer.set(b.playerId, cur);
  }
  return [...byPlayer.values()]
    .filter((b) => b.balls > 0 || b.runs > 0)
    .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
    .slice(0, n);
}