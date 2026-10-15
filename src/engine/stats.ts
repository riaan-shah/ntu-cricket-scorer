import type { ID, Match } from '../types';
import { computeMatch, type InningsState } from './engine';
import { clubPar, computeMvp } from './impact';

// ---------- Career stats ----------

export interface BattingCareer {
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  highest: number;
  highestNotOut: boolean;
  thirties: number;
  fifties: number;
  ducks: number;
}

export interface BowlingCareer {
  innings: number;
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
  dots: number;
  wides: number;
  noBalls: number;
  bestW: number;
  bestR: number;
  threeW: number;
  fiveW: number;
}

export interface MatchPerformance {
  matchId: ID;
  date: string;
  opponent: string;
  bat: { runs: number; balls: number; out: boolean }[];
  bowl: { wickets: number; runs: number; balls: number }[];
  result: 'W' | 'L' | 'T' | '-';
  motm: boolean;
  impact: number | null;
}

export interface CareerStats {
  playerId: ID;
  matches: number;
  wins: number;
  losses: number;
  motm: number;
  bestBatter: number;
  bestBowler: number;
  fighter: number;
  /** Sum of MVP 2.0 Impact Scores. */
  impact: number;
  /** Matches with an Impact Score (i.e. took part in play). */
  impactMatches: number;
  bestImpact: number;
  /** Runs off the bat at High/Extreme pressure (PI 65+). */
  pressureRuns: number;
  /** Average Pressure Index of every ball faced (null if none). */
  avgPressureFaced: number | null;
  /** Internal running totals for avgPressureFaced. */
  pressureFacedSum: number;
  pressureFacedBalls: number;
  bat: BattingCareer;
  bowl: BowlingCareer;
  catches: number;
  stumpings: number;
  runOuts: number;
  outOfCage: number;
  performances: MatchPerformance[];
}

function emptyStats(playerId: ID): CareerStats {
  return {
    playerId,
    matches: 0,
    wins: 0,
    losses: 0,
    motm: 0,
    bestBatter: 0,
    bestBowler: 0,
    fighter: 0,
    impact: 0,
    impactMatches: 0,
    bestImpact: 0,
    pressureRuns: 0,
    avgPressureFaced: null,
    pressureFacedSum: 0,
    pressureFacedBalls: 0,
    bat: {
      innings: 0,
      notOuts: 0,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      highest: 0,
      highestNotOut: false,
      thirties: 0,
      fifties: 0,
      ducks: 0,
    },
    bowl: {
      innings: 0,
      balls: 0,
      runs: 0,
      wickets: 0,
      maidens: 0,
      dots: 0,
      wides: 0,
      noBalls: 0,
      bestW: 0,
      bestR: 0,
      threeW: 0,
      fiveW: 0,
    },
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    outOfCage: 0,
    performances: [],
  };
}

export function computeCareerStats(matches: Match[]): Map<ID, CareerStats> {
  const stats = new Map<ID, CareerStats>();
  const get = (id: ID) => {
    let s = stats.get(id);
    if (!s) {
      s = emptyStats(id);
      stats.set(id, s);
    }
    return s;
  };

  const counted = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date.localeCompare(b.date)));

  for (const m of counted) {
    const state = computeMatch(m);
    // Par for each match = the club's history going into that match, so old MVPs don't shift later.
    const mvp = computeMvp(m, state, { clubPar: clubPar(matches, m) });
    const impactOf = new Map(mvp.players.map((p) => [p.playerId, p.total]));
    for (const p of mvp.players) {
      const s = get(p.playerId);
      s.pressureRuns += p.pressureRuns;
      if (p.battingPressure !== null && p.ballsFaced > 0) {
        s.pressureFacedSum += p.battingPressure * p.ballsFaced;
        s.pressureFacedBalls += p.ballsFaced;
        s.avgPressureFaced = Math.round(s.pressureFacedSum / s.pressureFacedBalls);
      }
    }
    const motmId = m.motmId ?? mvp.heroes.potm;
    const perf = new Map<ID, MatchPerformance>();
    const [teamA, teamB] = m.teams;
    const everyone = new Set([...teamA.playerIds, ...teamB.playerIds]);
    for (const pid of everyone) {
      const inA = teamA.playerIds.includes(pid);
      const inB = teamB.playerIds.includes(pid);
      const s = get(pid);
      s.matches++;
      let result: MatchPerformance['result'] = '-';
      // Players who turned out for both sides don't get a W/L.
      if (inA !== inB && m.result) {
        const mine = inA ? 0 : 1;
        if (m.result.winner === null) result = 'T';
        else if (m.result.winner === mine) {
          result = 'W';
          s.wins++;
        } else {
          result = 'L';
          s.losses++;
        }
      }
      if (motmId === pid) s.motm++;
      if (mvp.heroes.bestBatter === pid) s.bestBatter++;
      if (mvp.heroes.bestBowler === pid) s.bestBowler++;
      if (mvp.heroes.fighter === pid && motmId !== pid) s.fighter++;
      const impact = impactOf.get(pid) ?? null;
      if (impact !== null) {
        s.impact = Math.round((s.impact + impact) * 10) / 10;
        s.impactMatches++;
        s.bestImpact = s.impactMatches === 1 ? impact : Math.max(s.bestImpact, impact);
      }
      perf.set(pid, {
        matchId: m.id,
        date: m.date,
        opponent: inA && inB ? `${teamA.name} v ${teamB.name}` : inA ? teamB.name : teamA.name,
        bat: [],
        bowl: [],
        result,
        motm: motmId === pid,
        impact,
      });
    }
    // Super-over runs and wickets don't count towards career records (as in ICC statistics).
    for (const inn of state.innings) if (!inn.superOver) addInnings(inn, get, perf);
    for (const [pid, p] of perf) get(pid).performances.push(p);
  }
  for (const s of stats.values()) s.performances.reverse();
  return stats;
}

function addInnings(
  inn: InningsState,
  get: (id: ID) => CareerStats,
  perf: Map<ID, MatchPerformance>,
) {
  for (const b of inn.batters) {
    const s = get(b.playerId).bat;
    const out = b.status === 'out';
    s.innings++;
    if (!out) s.notOuts++;
    s.runs += b.runs;
    s.balls += b.balls;
    s.fours += b.fours;
    s.sixes += b.sixes;
    if (b.runs > s.highest || (b.runs === s.highest && !out)) {
      s.highest = b.runs;
      s.highestNotOut = !out;
    }
    if (b.runs >= 50) s.fifties++;
    else if (b.runs >= 30) s.thirties++;
    if (out && b.runs === 0) s.ducks++;
    if (b.dismissal?.type === 'outOfCage') get(b.playerId).outOfCage++;
    perf.get(b.playerId)?.bat.push({ runs: b.runs, balls: b.balls, out });

    const d = b.dismissal;
    if (d?.fielderId) {
      const f = get(d.fielderId);
      if (d.type === 'caught') f.catches++;
      if (d.type === 'stumped') f.stumpings++;
      if (d.type === 'runOut') f.runOuts++;
    }
  }
  for (const bw of inn.bowlers) {
    if (bw.balls === 0 && bw.runs === 0) continue;
    const s = get(bw.playerId).bowl;
    s.innings++;
    s.balls += bw.balls;
    s.runs += bw.runs;
    s.wickets += bw.wickets;
    s.maidens += bw.maidens;
    s.dots += bw.dots;
    s.wides += bw.wides;
    s.noBalls += bw.noBalls;
    if (s.innings === 1 || bw.wickets > s.bestW || (bw.wickets === s.bestW && bw.runs < s.bestR)) {
      s.bestW = bw.wickets;
      s.bestR = bw.runs;
    }
    if (bw.wickets >= 5) s.fiveW++;
    else if (bw.wickets >= 3) s.threeW++;
    perf.get(bw.playerId)?.bowl.push({ wickets: bw.wickets, runs: bw.runs, balls: bw.balls });
  }
}

export const batAverage = (b: BattingCareer) =>
  b.innings - b.notOuts > 0 ? (b.runs / (b.innings - b.notOuts)).toFixed(2) : b.runs > 0 ? '∞' : '-';
export const batStrikeRate = (b: BattingCareer) => (b.balls ? ((b.runs * 100) / b.balls).toFixed(1) : '-');
export const bowlAverage = (b: BowlingCareer) => (b.wickets ? (b.runs / b.wickets).toFixed(2) : '-');
export const bowlEconomy = (b: BowlingCareer, bpo = 6) => (b.balls ? ((b.runs * bpo) / b.balls).toFixed(2) : '-');
export const bowlStrikeRate = (b: BowlingCareer) => (b.wickets ? (b.balls / b.wickets).toFixed(1) : '-');
