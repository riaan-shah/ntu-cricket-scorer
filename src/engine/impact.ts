/**
 * MVP 2.0 — Pressure Index & Impact Score, modelled on CricHeroes' MVP 2.0
 * (https://blog.cricheroes.com/mvp-2-0-pressure-index-impact-score/).
 *
 * CricHeroes publishes the factors and the scales but not the formulas, so the
 * maths below is our own model built from those same factors:
 *   Pressure Index (0-100, before every ball): runs needed (target, or a par score when
 *   batting first), balls left, wickets left, required vs par scoring pace, match phase,
 *   and format (par scales with the overs being played).
 *   Impact Score: every ball is valued in "runs above par" for the batter, bowler and
 *   fielder involved, multiplied by that ball's pressure, then normalised to the match size.
 */
import type { ID, Match, MatchResult, TeamIdx } from '../types';
import { computeMatch, isBowlerCredited, type InningsState, type MatchState } from './engine';

// ---------- Scales (as published by CricHeroes) ----------

export const PRESSURE_BANDS = [
  { min: 80, label: 'Extreme' },
  { min: 65, label: 'High' },
  { min: 40, label: 'Moderate' },
  { min: 20, label: 'Light' },
  { min: 0, label: 'Calm' },
] as const;

export function pressureLabel(pi: number): string {
  return PRESSURE_BANDS.find((b) => pi >= b.min)!.label;
}

export const IMPACT_GRADES = [
  { min: 10, label: 'Exceptional' },
  { min: 7.5, label: 'Excellent' },
  { min: 5, label: 'Very good' },
  { min: 3, label: 'Good' },
  { min: 1.5, label: 'Useful' },
  { min: -Infinity, label: 'Marginal' },
] as const;

export function impactGrade(score: number): string {
  return IMPACT_GRADES.find((g) => score >= g.min)!.label;
}

// ---------- Pressure Index ----------

/** Club default scoring rate (runs per ball) used until there's match history to learn from. */
export const DEFAULT_PAR = 1.3;
/** How many balls of evidence the prior par is worth when blending with the current match. */
const PAR_PRIOR_BALLS = 36;
/** Completed matches needed before the club's own history replaces the default par. */
const CLUB_PAR_MIN_MATCHES = 3;
/** Pressure of 65+ ("High" or "Extreme") counts as batting under pressure. */
export const HIGH_PRESSURE = 65;

/*
 * Wicket shock, after Shah & Shah, "Pressure Index in Cricket" (IOSR-JSPE 1(5), 2014): a wicket adds pressure that is
 * larger when many runs are still needed and many balls remain, and the batting side then "pays it off" with the runs
 * it scores afterwards. In their 2007 WT20 final example the first wicket adds ~0.29 to the required-rate ratio and
 * each run repays ~1/158 of the target; we express both relative to the target so they scale to short cage games.
 */
const SHOCK_PER_WICKET = 0.3;
const SHOCK_PAYOFF_PER_RUN = 1.6; // shock repaid per run = 1.6 / goal
const SHOCK_MAX = 0.8;

export interface PressureInput {
  runs: number;
  wickets: number;
  legalBalls: number;
  maxBalls: number;
  /** Wickets the side can lose before the innings ends. */
  maxWickets: number;
  /** Chase target, or null when batting first. */
  target: number | null;
  /** Par scoring rate (runs per ball) for batting first. */
  par: number;
  /** Unrepaid wicket shock (see above), in units of the difficulty ratio. */
  shock?: number;
}

export function pressureIndex(s: PressureInput): number {
  const ballsLeft = Math.max(0, s.maxBalls - s.legalBalls);
  const chasing = s.target !== null;
  const goal = chasing ? s.target! : s.par * s.maxBalls;
  const needed = goal - s.runs;
  if (chasing && needed <= 0) return 0;
  if (ballsLeft === 0) return chasing ? 100 : 0;

  // Fewer wickets in hand = less freedom to attack.
  const wLeft = Math.max(0, s.maxWickets - s.wickets);
  const resource = 0.45 + 0.55 * Math.sqrt(s.maxWickets > 0 ? wLeft / s.maxWickets : 0);
  // Match phase: 0 = first ball, 1 = last ball. Sides score faster at the death.
  const phase = s.legalBalls / s.maxBalls;
  const parRate = chasing ? Math.max(0.1, (s.target! - 1) / s.maxBalls) : s.par;
  const expected = ballsLeft * parRate * (1 + 0.3 * phase) * resource;

  // Difficulty: runs needed vs runs this side can expect to make (1 = exactly on par), plus any wicket shock.
  const difficulty = Math.max(0, needed) / Math.max(expected, 0.5) + (s.shock ?? 0);
  let pi = 1 / (1 + Math.exp(-1.8 * (difficulty - 1)));
  pi *= 0.75 + 0.25 * phase; // pressure builds as the innings goes on
  if (!chasing) pi *= 0.85; // setting a total carries less pressure than chasing one
  return Math.round(Math.min(100, Math.max(0, pi * 100)));
}

/** Par rate for the match: the prior (club history or default) blended with how this match is actually going. */
export function matchPar(state: MatchState, prior = DEFAULT_PAR): number {
  let runs = 0;
  let balls = 0;
  for (const inn of state.innings) {
    runs += inn.runs;
    balls += inn.legalBalls;
  }
  return (prior * PAR_PRIOR_BALLS + runs) / (PAR_PRIOR_BALLS + balls);
}

// Keyed by id + updatedAt: synced match lists arrive as fresh objects on every ball.
const firstInningsCache = new Map<string, { runs: number; balls: number } | null>();
function firstInnings(m: Match) {
  const key = `${m.id}:${m.updatedAt}`;
  if (!firstInningsCache.has(key)) {
    const first = computeMatch(m).innings[0];
    firstInningsCache.set(key, first && first.legalBalls > 0 ? { runs: first.runs, balls: first.legalBalls } : null);
  }
  return firstInningsCache.get(key)!;
}

/**
 * The club's real first-innings scoring rate (runs per ball) from completed matches played before match — the
 * paper's "average score batting first on that ground". Uses the same venue when it has enough matches.
 * undefined until the club has enough history.
 */
export function clubPar(matches: Match[], match?: Match): number | undefined {
  const earlier = matches.filter(
    (m) =>
      m.status === 'completed' &&
      m.id !== match?.id &&
      (!match || m.date < match.date || (m.date === match.date && m.createdAt < match.createdAt)),
  );
  const sameVenue = match?.venue ? earlier.filter((m) => m.venue === match.venue) : [];
  const pool = sameVenue.length >= CLUB_PAR_MIN_MATCHES ? sameVenue : earlier;
  if (pool.length < CLUB_PAR_MIN_MATCHES) return undefined;
  let runs = 0;
  let balls = 0;
  for (const m of pool) {
    const f = firstInnings(m);
    if (f) {
      runs += f.runs;
      balls += f.balls;
    }
  }
  return balls > 0 ? runs / balls : undefined;
}

function maxWicketsFor(match: Match, inn: InningsState) {
  return Math.max(1, inn.battingTurns - (match.rules.lastManStands ? 0 : 1));
}

/** Pressure before every delivery of an innings (with wicket shock), plus the pressure before the next ball. */
function inningsPressure(match: Match, inn: InningsState, par: number): { points: PressurePoint[]; next: number | null } {
  const maxWickets = maxWicketsFor(match, inn);
  const goal = Math.max(1, inn.target ?? par * inn.maxBalls);
  let runs = 0;
  let wickets = 0;
  let legal = 0;
  let shock = 0;
  const pi = (r: number, w: number, l: number) =>
    pressureIndex({ runs: r, wickets: w, legalBalls: l, maxBalls: inn.maxBalls, maxWickets, target: inn.target, par, shock });

  const points: PressurePoint[] = [];
  for (const b of inn.balls) {
    points.push({ ball: legal, pi: pi(runs, wickets, legal), eventIndex: b.eventIndex });
    // Runs scored repay earlier wicket shock; a wicket on this ball then adds new shock.
    shock = Math.max(0, shock - ((b.scoreAfter.runs - runs) * SHOCK_PAYOFF_PER_RUN) / goal);
    runs = b.scoreAfter.runs;
    wickets = b.scoreAfter.wickets;
    legal = b.legalBallsAfter;
    if (b.event.wicket) {
      const runsLeft = Math.max(0, goal - runs) / goal;
      const ballsLeft = Math.max(0, inn.maxBalls - legal) / inn.maxBalls;
      shock = Math.min(SHOCK_MAX, shock + SHOCK_PER_WICKET * runsLeft * ballsLeft);
    }
  }
  const next = inn.started && !inn.complete ? pi(inn.runs, inn.wickets, inn.legalBalls) : null;
  return { points, next };
}

/** Pressure on the batting side right now (before the next ball). */
export function currentPressure(match: Match, state: MatchState, clubParRate?: number): number | null {
  const inn = state.current;
  if (!inn || !inn.started || inn.complete) return null;
  return inningsPressure(match, inn, matchPar(state, clubParRate)).next;
}
// ---------- Impact Score ----------

export interface PlayerImpact {
  playerId: ID;
  batting: number;
  bowling: number;
  fielding: number;
  total: number;
  /** Average pressure of the balls this player faced. */
  battingPressure: number | null;
  /** Average pressure of the balls this player bowled. */
  bowlingPressure: number | null;
  /** Runs off the bat scored at High/Extreme pressure (PI 65+) — the paper's "pressure runs". */
  pressureRuns: number;
  ballsFaced: number;
  summary: string;
}

export interface PressurePoint {
  /** Legal balls bowled before this delivery. */
  ball: number;
  pi: number;
  eventIndex: number;
}

export interface Heroes {
  potm?: ID;
  bestBatter?: ID;
  bestBowler?: ID;
  fighter?: ID;
}

export interface MatchMvp {
  players: PlayerImpact[];
  /** Pressure before every delivery, per innings. */
  pressure: PressurePoint[][];
  /** Pressure keyed by `${inningsIndex}:${eventIndex}` for commentary. */
  pressureByBall: Map<string, number>;
  heroes: Heroes;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
/** A dropped catch costs this share of a wicket's value (a take earns the catcher 0.25 on top of the bowler's credit). */
const DROP_SHARE = 0.3;

export function computeMvp(
  match: Match,
  state: MatchState = computeMatch(match),
  opts: { clubPar?: number } = {},
): MatchMvp {
  const rules = match.rules;
  const par = matchPar(state, opts.clubPar);
  const maxBalls = rules.overs * rules.ballsPerOver;
  // One Impact point = 1/20th of a par innings, so the scale means the same in a 3-over cage game and a T20.
  // Calibrated so a 30 off 15 or 2/10 from 2 overs in a 6-over game grades about 'Excellent'.
  const unit = Math.max(1, par * maxBalls) / 20;

  const acc = new Map<
    ID,
    { bat: number; bowl: number; field: number; batPi: number[]; bowlPi: number[]; pressureRuns: number }
  >();
  const get = (id: ID) => {
    let a = acc.get(id);
    if (!a) {
      a = { bat: 0, bowl: 0, field: 0, batPi: [], bowlPi: [], pressureRuns: 0 };
      acc.set(id, a);
    }
    return a;
  };

  const pressure: PressurePoint[][] = [];
  const pressureByBall = new Map<string, number>();

  for (const inn of state.innings) {
    const { points } = inningsPressure(match, inn, par);
    pressure.push(points);
    const maxWickets = maxWicketsFor(match, inn);
    const parRate = inn.target !== null ? Math.max(0.1, (inn.target - 1) / inn.maxBalls) : par;
    // A wicket is worth a share of the innings' par runs; fewer batters = each wicket matters more.
    const wicketValue = (0.9 * parRate * inn.maxBalls) / maxWickets;
    const setRuns = Math.max(8, parRate * inn.maxBalls * 0.15);

    let partnership = 0;
    const batterRuns = new Map<ID, number>();

    inn.balls.forEach((b, i) => {
      const ev = b.event;
      const pi = points[i].pi;
      pressureByBall.set(`${inn.index}:${b.eventIndex}`, pi);
      const mult = 0.6 + 0.9 * (pi / 100);

      const isWd = ev.extra === 'wd';
      const isNb = ev.extra === 'nb';
      const penalty = isWd ? rules.wideRuns : isNb ? rules.noBallRuns : 0;
      const batRuns = !ev.extra || (isNb && (ev.nbRunsFrom ?? 'bat') === 'bat') ? ev.runs : 0;
      const conceded = isWd ? penalty + ev.runs : isNb ? penalty + batRuns : ev.extra ? 0 : ev.runs;

      // Batting: runs that matter, boundaries, dot balls.
      if (!isWd) {
        let v = batRuns - 0.5 * parRate;
        if (ev.boundary && batRuns === 4) v += 0.5;
        if (ev.boundary && batRuns === 6) v += 1;
        const s = get(ev.strikerId);
        s.bat += v * mult;
        s.batPi.push(pi);
        if (pi >= HIGH_PRESSURE) s.pressureRuns += batRuns;
        batterRuns.set(ev.strikerId, (batterRuns.get(ev.strikerId) ?? 0) + batRuns);
      }

      // Bowling: economy vs par; extras cost a run without using up a ball.
      const bw = get(ev.bowlerId);
      bw.bowl += ((b.legal ? parRate : 0) - conceded) * mult;
      bw.bowlPi.push(pi);

      if (ev.wicket) {
        const outId = ev.wicket.playerOutId;
        // Quality of batter dismissed + partnership broken.
        const quality = 1 + 0.5 * Math.min(1, (batterRuns.get(outId) ?? 0) / setRuns);
        const pship = 0.3 * Math.min(1, (partnership + b.totalRuns) / setRuns);
        const wv = wicketValue * mult;
        if (isBowlerCredited(ev.wicket.type, rules)) bw.bowl += wv * (quality + pship);
        get(outId).bat -= 0.5 * wv;
        const f = ev.wicket.fielderId;
        if (f) {
          if (ev.wicket.type === 'caught' || ev.wicket.type === 'stumped') get(f).field += 0.25 * wv * quality;
          else if (ev.wicket.type === 'runOut') get(f).field += 0.8 * wv * (quality + pship);
        }
        partnership = 0;
      } else {
        partnership += b.totalRuns;
      }

      // Fielding the scorer recorded: a dropped catch costs a share of a wicket, runs saved count run-for-run.
      if (ev.drop) get(ev.drop).field -= DROP_SHARE * wicketValue * mult;
      if (ev.save && ev.save.runs > 0) get(ev.save.by).field += ev.save.runs * mult;
    });
  }

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const summaries = buildSummaries(state, rules.ballsPerOver);
  const players: PlayerImpact[] = [...acc.entries()]
    .map(([playerId, a]) => {
      const batting = round1(a.bat / unit);
      const bowling = round1(a.bowl / unit);
      const fielding = round1(a.field / unit);
      return {
        playerId,
        batting,
        bowling,
        fielding,
        total: round1(batting + bowling + fielding),
        battingPressure: avg(a.batPi),
        bowlingPressure: avg(a.bowlPi),
        pressureRuns: a.pressureRuns,
        ballsFaced: a.batPi.length,
        summary: summaries.get(playerId) ?? '',
      };
    })
    .sort((x, y) => y.total - x.total);

  const result = match.result ?? state.result;
  return { players, pressure, pressureByBall, heroes: pickHeroes(match, players, result) };
}

/**
 * Heroes of the Match, per CricHeroes MVP 2.0:
 *  - Player of the Match: highest-ranked winning-team player in the top 3 MVPs, else the MVP leader.
 *  - Best Batter / Best Bowler: highest batting / bowling impact.
 *  - Fighter of the Match: highest-ranked losing-team player in the top 3 who isn't Player of the Match.
 */
export function pickHeroes(match: Match, players: PlayerImpact[], result: MatchResult | null | undefined): Heroes {
  if (players.length === 0) return {};
  const winner = result ? result.winner : null;
  const inTeam = (id: ID, t: TeamIdx) => match.teams[t].playerIds.includes(id);
  const top3 = players.slice(0, 3);
  const potm =
    (winner !== null ? top3.find((p) => inTeam(p.playerId, winner))?.playerId : undefined) ?? players[0].playerId;
  const best = (key: 'batting' | 'bowling') =>
    [...players].sort((a, b) => b[key] - a[key]).find((p) => p[key] > 0)?.playerId;
  let fighter: ID | undefined;
  if (winner !== null) {
    const loser = (1 - winner) as TeamIdx;
    // A fighter has to have actually made a positive contribution.
    fighter = top3.find(
      (p) => p.total > 0 && inTeam(p.playerId, loser) && !inTeam(p.playerId, winner) && p.playerId !== potm,
    )?.playerId;
  }
  return { potm, bestBatter: best('batting'), bestBowler: best('bowling'), fighter };
}

function buildSummaries(state: MatchState, bpo: number): Map<ID, string> {
  const parts = new Map<ID, string[]>();
  const push = (id: ID, s: string) => parts.set(id, [...(parts.get(id) ?? []), s]);
  for (const inn of state.innings) {
    for (const b of inn.batters) push(b.playerId, `${b.runs}${b.status === 'out' ? '' : '*'}(${b.balls})`);
    for (const bw of inn.bowlers)
      if (bw.balls > 0 || bw.runs > 0)
        push(bw.playerId, `${bw.wickets}/${bw.runs} (${Math.floor(bw.balls / bpo)}.${bw.balls % bpo})`);
    for (const b of inn.batters) {
      const d = b.dismissal;
      if (!d?.fielderId) continue;
      if (d.type === 'caught') push(d.fielderId, d.fielderId === d.bowlerId ? 'c&b' : '1 ct');
      if (d.type === 'stumped') push(d.fielderId, '1 st');
      if (d.type === 'runOut') push(d.fielderId, '1 run out');
    }
  }
  return new Map([...parts].map(([id, p]) => [id, p.join(' · ')]));
}
