import type { ID, Match, ShotZone } from '../types';
import { computeMatch, isBowlerCredited, type InningsState } from './engine';

export interface HeadToHead {
  /** Balls the batter faced from the bowler (wides excluded). */
  balls: number;
  runs: number;
  dismissals: number;
  fours: number;
  sixes: number;
  dots: number;
  matches: number;
}

const counted = (matches: Match[]) => matches.filter((m) => m.status === 'completed' && !m.deletedAt);

/** Every ball `batterId` faced from `bowlerId` in completed matches (super overs excluded). */
export function headToHead(matches: Match[], batterId: ID, bowlerId: ID): HeadToHead {
  const h: HeadToHead = { balls: 0, runs: 0, dismissals: 0, fours: 0, sixes: 0, dots: 0, matches: 0 };
  for (const m of counted(matches)) {
    let met = false;
    for (const inn of computeMatch(m).innings) {
      if (inn.superOver) continue;
      for (const b of inn.balls) {
        const ev = b.event;
        if (ev.strikerId !== batterId || ev.bowlerId !== bowlerId) continue;
        met = true;
        const isWd = ev.extra === 'wd';
        const batRuns = !ev.extra || (ev.extra === 'nb' && (ev.nbRunsFrom ?? 'bat') === 'bat') ? ev.runs : 0;
        if (!isWd) h.balls++;
        h.runs += batRuns;
        if (!isWd && batRuns === 0) h.dots++;
        if (ev.boundary && batRuns === 4) h.fours++;
        if (ev.boundary && batRuns === 6) h.sixes++;
        if (ev.wicket && ev.wicket.playerOutId === batterId && isBowlerCredited(ev.wicket.type, m.rules)) h.dismissals++;
      }
    }
    if (met) h.matches++;
  }
  return h;
}

export type ZoneStats = Record<ShotZone, { runs: number; shots: number; boundaries: number }>;

/** Runs off the bat by cage zone for a batter (only shots where the scorer recorded a zone). */
export function shotZones(matches: Match[], batterId: ID): { zones: ZoneStats; tagged: number; runs: number } {
  const zones: ZoneStats = {
    straight: { runs: 0, shots: 0, boundaries: 0 },
    off: { runs: 0, shots: 0, boundaries: 0 },
    leg: { runs: 0, shots: 0, boundaries: 0 },
    behind: { runs: 0, shots: 0, boundaries: 0 },
  };
  let tagged = 0;
  let runs = 0;
  for (const m of counted(matches)) {
    for (const inn of m.innings) {
      for (const ev of inn.events) {
        if (ev.kind !== 'ball' || ev.strikerId !== batterId || !ev.zone) continue;
        const batRuns = !ev.extra || (ev.extra === 'nb' && (ev.nbRunsFrom ?? 'bat') === 'bat') ? ev.runs : 0;
        if (batRuns <= 0) continue;
        const z = zones[ev.zone];
        z.runs += batRuns;
        z.shots++;
        if (ev.boundary) z.boundaries++;
        tagged++;
        runs += batRuns;
      }
    }
  }
  return { zones, tagged, runs };
}

// ---------- Phases (early / middle / death) ----------

export type Phase = 'early' | 'middle' | 'death';
export const PHASES: Phase[] = ['early', 'middle', 'death'];
export const PHASE_LABELS: Record<Phase, string> = { early: 'Early', middle: 'Middle', death: 'Death' };

/**
 * Phases by over, scaled to the format: roughly the first 30% of overs are "early" (like a powerplay), the last 30%
 * "death", the rest "middle". 6 overs → 1–2 / 3–4 / 5–6; 2 overs → early / death; 1 over → all early.
 */
export function phaseOvers(overs: number): { early: number; death: number } {
  if (overs <= 1) return { early: 1, death: 0 };
  return { early: Math.max(1, Math.round(overs * 0.3)), death: Math.max(1, Math.round(overs * 0.3)) };
}

export function phaseOf(legalBallsBefore: number, maxBalls: number, bpo: number): Phase {
  const overs = Math.max(1, Math.ceil(maxBalls / bpo));
  const over = Math.floor(legalBallsBefore / bpo);
  const { early, death } = phaseOvers(overs);
  if (over < early) return 'early';
  if (death > 0 && over >= overs - death) return 'death';
  return 'middle';
}

export function phaseRangeLabel(phase: Phase, overs: number): string {
  const { early, death } = phaseOvers(overs);
  const range = (a: number, b: number) => (a === b ? `ov ${a}` : `ov ${a}–${b}`);
  if (phase === 'early') return range(1, Math.min(early, overs));
  if (phase === 'death') return death > 0 ? range(overs - death + 1, overs) : '';
  return early + 1 <= overs - death ? range(early + 1, overs - death) : '';
}

export interface PhaseLine {
  runs: number;
  balls: number;
  wickets: number;
}
const emptyPhases = (): Record<Phase, PhaseLine> => ({
  early: { runs: 0, balls: 0, wickets: 0 },
  middle: { runs: 0, balls: 0, wickets: 0 },
  death: { runs: 0, balls: 0, wickets: 0 },
});

/** A team innings split into phases (runs include extras; balls are legal balls). */
export function inningsPhases(inn: InningsState, bpo: number): Record<Phase, PhaseLine> {
  const out = emptyPhases();
  let before = 0;
  for (const b of inn.balls) {
    const ph = out[phaseOf(before, inn.maxBalls, bpo)];
    ph.runs += b.totalRuns;
    if (b.legal) ph.balls++;
    if (b.event.wicket) ph.wickets++;
    before = b.legalBallsAfter;
  }
  return out;
}

/** A player's career strike rate (batting) and economy (bowling) by phase. Super overs excluded. */
export function playerPhases(matches: Match[], playerId: ID): { bat: Record<Phase, PhaseLine>; bowl: Record<Phase, PhaseLine> } {
  const bat = emptyPhases();
  const bowl = emptyPhases();
  for (const m of counted(matches)) {
    const bpo = m.rules.ballsPerOver;
    for (const inn of computeMatch(m).innings) {
      if (inn.superOver) continue;
      let before = 0;
      for (const b of inn.balls) {
        const ev = b.event;
        const phase = phaseOf(before, inn.maxBalls, bpo);
        before = b.legalBallsAfter;
        const isWd = ev.extra === 'wd';
        const isNb = ev.extra === 'nb';
        const batRuns = !ev.extra || (isNb && (ev.nbRunsFrom ?? 'bat') === 'bat') ? ev.runs : 0;
        if (ev.strikerId === playerId) {
          bat[phase].runs += batRuns;
          if (!isWd) bat[phase].balls++;
          if (ev.wicket?.playerOutId === playerId) bat[phase].wickets++;
        }
        if (ev.bowlerId === playerId) {
          const penalty = isWd ? m.rules.wideRuns : isNb ? m.rules.noBallRuns : 0;
          bowl[phase].runs += isWd ? penalty + ev.runs : isNb ? penalty + batRuns : ev.extra ? 0 : ev.runs;
          if (b.legal) bowl[phase].balls++;
          if (ev.wicket && isBowlerCredited(ev.wicket.type, m.rules)) bowl[phase].wickets++;
        }
      }
    }
  }
  return { bat, bowl };
}

// ---------- Partnerships across matches ----------

export interface PairRecord {
  ids: [ID, ID];
  runs: number;
  balls: number;
  innings: number;
  best: number;
  /** 30+ stands. */
  big: number;
}

/** Which pairs score most together (career, super overs excluded). */
export function pairRecords(matches: Match[]): PairRecord[] {
  const pairs = new Map<string, PairRecord>();
  for (const m of counted(matches)) {
    for (const inn of computeMatch(m).innings) {
      if (inn.superOver) continue;
      for (const p of inn.partnerships) {
        if (p.batterIds.length !== 2 || p.batterIds[0] === p.batterIds[1]) continue;
        const ids = [...p.batterIds].sort() as [ID, ID];
        const key = ids.join('|');
        const r = pairs.get(key) ?? { ids, runs: 0, balls: 0, innings: 0, best: 0, big: 0 };
        r.runs += p.runs;
        r.balls += p.balls;
        r.innings++;
        r.best = Math.max(r.best, p.runs);
        if (p.runs >= 30) r.big++;
        pairs.set(key, r);
      }
    }
  }
  return [...pairs.values()].sort((a, b) => b.runs - a.runs || b.best - a.best);
}