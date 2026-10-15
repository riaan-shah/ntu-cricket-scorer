import type { ID, Match, ShotZone } from '../types';
import { computeMatch, isBowlerCredited } from './engine';

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
