import type { ID, Match } from '../types';
import { computeMatch } from './engine';

export interface InningsRecord {
  matchId: ID;
  date: string;
  team: string;
  opponent: string;
  runs: number;
  wickets: number;
  balls: number;
  bpo: number;
}

export interface PlayerRecord {
  matchId: ID;
  date: string;
  playerId: ID;
  opponent: string;
  /** Batting: runs; bowling: wickets. */
  primary: number;
  /** Batting: balls; bowling: runs conceded. */
  secondary: number;
  notOut?: boolean;
  balls?: number;
  bpo: number;
}

export interface WinRecord {
  matchId: ID;
  date: string;
  winner: string;
  loser: string;
  margin: number;
  ballsLeft?: number;
}

export interface PartnershipRecord {
  matchId: ID;
  date: string;
  batterIds: ID[];
  team: string;
  runs: number;
  balls: number;
}

export interface CountRecord {
  id: string;
  label?: string;
  count: number;
  matchId?: ID;
  date?: string;
}

export interface ClubRecords {
  matches: number;
  highestTotals: InningsRecord[];
  lowestTotals: InningsRecord[];
  highestScores: PlayerRecord[];
  bestFigures: PlayerRecord[];
  biggestWinsByRuns: WinRecord[];
  biggestWinsByWickets: WinRecord[];
  bestPartnerships: PartnershipRecord[];
  mostSixesInnings: PlayerRecord[];
  outOfCageCareer: CountRecord[];
  outOfCageInnings: CountRecord[];
}

const TOP = 5;

/** Club records from completed matches (bin excluded by the caller). Super overs are left out, as in ICC records. */
export function computeRecords(matches: Match[]): ClubRecords {
  const done = matches.filter((m) => m.status === 'completed' && !m.deletedAt);
  const totals: InningsRecord[] = [];
  const completeTotals: InningsRecord[] = [];
  const scores: PlayerRecord[] = [];
  const figures: PlayerRecord[] = [];
  const sixes: PlayerRecord[] = [];
  const winsRuns: WinRecord[] = [];
  const winsWkts: WinRecord[] = [];
  const pships: PartnershipRecord[] = [];
  const cageByPlayer = new Map<ID, number>();
  const cageInnings: CountRecord[] = [];

  for (const m of done) {
    const st = computeMatch(m);
    const bpo = m.rules.ballsPerOver;
    const main = st.innings.filter((i) => !i.superOver);
    for (const inn of main) {
      const team = m.teams[inn.battingTeam].name;
      const opponent = m.teams[inn.bowlingTeam].name;
      const base = { matchId: m.id, date: m.date };
      const rec = { ...base, team, opponent, runs: inn.runs, wickets: inn.wickets, balls: inn.legalBalls, bpo };
      totals.push(rec);
      // "Lowest" only counts innings that ran their course (all out or overs up), not a quick successful chase.
      if (inn.completeReason === 'allout' || inn.completeReason === 'overs') completeTotals.push(rec);

      for (const b of inn.batters) {
        if (b.balls === 0 && b.runs === 0) continue;
        scores.push({ ...base, playerId: b.playerId, opponent, primary: b.runs, secondary: b.balls, notOut: b.status !== 'out', bpo });
        if (b.sixes > 0) sixes.push({ ...base, playerId: b.playerId, opponent, primary: b.sixes, secondary: b.runs, bpo });
      }
      for (const bw of inn.bowlers) {
        if (bw.balls === 0) continue;
        figures.push({ ...base, playerId: bw.playerId, opponent: team, primary: bw.wickets, secondary: bw.runs, balls: bw.balls, bpo });
      }
      for (const p of inn.partnerships) {
        if (p.batterIds.length === 2 && p.runs > 0) pships.push({ ...base, batterIds: p.batterIds, team, runs: p.runs, balls: p.balls });
      }
      let cage = 0;
      for (const b of inn.batters) {
        if (b.dismissal?.type !== 'outOfCage') continue;
        cage++;
        cageByPlayer.set(b.playerId, (cageByPlayer.get(b.playerId) ?? 0) + 1);
      }
      if (cage > 0) cageInnings.push({ id: `${m.id}:${inn.index}`, label: `${team} v ${opponent}`, count: cage, matchId: m.id, date: m.date });
    }

    // Margins come from the main match only (a super-over win has no margin).
    const [a, b] = main;
    if (a && b && m.result?.winner !== null && m.result?.winner !== undefined && !m.result.superOver) {
      const winnerName = m.teams[m.result.winner].name;
      const loserName = m.teams[1 - m.result.winner].name;
      if (m.result.winner === a.battingTeam) {
        winsRuns.push({ matchId: m.id, date: m.date, winner: winnerName, loser: loserName, margin: a.runs - b.runs });
      } else {
        winsWkts.push({
          matchId: m.id,
          date: m.date,
          winner: winnerName,
          loser: loserName,
          margin: b.wicketsInHand,
          ballsLeft: Math.max(0, b.maxBalls - b.legalBalls),
        });
      }
    }
  }

  return {
    matches: done.length,
    highestTotals: totals.sort((x, y) => y.runs - x.runs || x.wickets - y.wickets).slice(0, TOP),
    lowestTotals: completeTotals.sort((x, y) => x.runs - y.runs || y.wickets - x.wickets).slice(0, TOP),
    highestScores: scores.sort((x, y) => y.primary - x.primary || x.secondary - y.secondary).slice(0, TOP),
    bestFigures: figures
      .filter((f) => f.primary > 0)
      .sort((x, y) => y.primary - x.primary || x.secondary - y.secondary)
      .slice(0, TOP),
    biggestWinsByRuns: winsRuns.sort((x, y) => y.margin - x.margin).slice(0, TOP),
    biggestWinsByWickets: winsWkts.sort((x, y) => y.margin - x.margin || (y.ballsLeft ?? 0) - (x.ballsLeft ?? 0)).slice(0, TOP),
    bestPartnerships: pships.sort((x, y) => y.runs - x.runs || x.balls - y.balls).slice(0, TOP),
    mostSixesInnings: sixes.sort((x, y) => y.primary - x.primary || y.secondary - x.secondary).slice(0, TOP),
    outOfCageCareer: [...cageByPlayer]
      .map(([id, count]) => ({ id, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, TOP),
    outOfCageInnings: cageInnings.sort((x, y) => y.count - x.count).slice(0, TOP),
  };
}
