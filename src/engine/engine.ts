import type {
  BallEvent,
  DismissalType,
  ID,
  Match,
  MatchResult,
  MatchRules,
  ScoreEvent,
  TeamIdx,
} from '../types';

export const DEFAULT_RULES: MatchRules = {
  overs: 6,
  ballsPerOver: 6,
  outOfCage: true,
  outOfCageBowlerCredit: true,
  outOfCageOnFreeHit: false,
  wideRuns: 1,
  noBallRuns: 1,
  wideReball: true,
  noBallReball: true,
  freeHit: true,
  lastManStands: false,
  rebatWhenShort: true,
  maxOversPerBowler: 0,
  noConsecutiveOvers: true,
  shotZones: true,
};

export const SUPER_OVER_WICKETS = 2;

export interface Dismissal {
  type: DismissalType;
  bowlerId?: ID;
  fielderId?: ID;
  /** Does the bowler get credit for this wicket? */
  bowlerCredit: boolean;
}

export interface BatterLine {
  /** Unique per batting stint: a batter who bats twice gets two lines. */
  key: string;
  playerId: ID;
  stint: number;
  order: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  status: 'batting' | 'out' | 'retired';
  dismissal?: Dismissal;
}

export interface BowlerLine {
  playerId: ID;
  order: number;
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
  dots: number;
  wides: number;
  noBalls: number;
  fours: number;
  sixes: number;
}

export type BallTone = 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra';

export interface BallView {
  eventIndex: number;
  event: BallEvent;
  overNo: number;
  /** Legal balls bowled in the innings after this delivery. */
  legalBallsAfter: number;
  legal: boolean;
  label: string;
  tone: BallTone;
  totalRuns: number;
  scoreAfter: { runs: number; wickets: number };
  wasFreeHit: boolean;
}

export interface OverView {
  overNo: number;
  bowlerId: ID;
  balls: BallView[];
  runs: number;
  wickets: number;
  complete: boolean;
}

export interface FallOfWicket {
  wicketNo: number;
  runs: number;
  playerId: ID;
  legalBalls: number;
}

export interface Partnership {
  batterIds: ID[];
  runs: number;
  balls: number;
  ongoing: boolean;
}

export interface AvailableBatter {
  playerId: ID;
  kind: 'new' | 'retired' | 'rebat';
}

export type CompleteReason = 'overs' | 'allout' | 'target' | 'declared';

export interface InningsState {
  index: number;
  superOver: boolean;
  battingTeam: TeamIdx;
  bowlingTeam: TeamIdx;
  started: boolean;
  runs: number;
  wickets: number;
  legalBalls: number;
  maxBalls: number;
  extras: { wd: number; nb: number; b: number; lb: number; total: number };
  batters: BatterLine[];
  bowlers: BowlerLine[];
  striker: BatterLine | null;
  nonStriker: BatterLine | null;
  bowlerId: ID | null;
  lastOverBowlerId: ID | null;
  balls: BallView[];
  overs: OverView[];
  fow: FallOfWicket[];
  partnerships: Partnership[];
  freeHit: boolean;
  target: number | null;
  complete: boolean;
  completeReason?: CompleteReason;
  needs: null | 'start' | 'batter' | 'bowler';
  availableBatters: AvailableBatter[];
  rebatsAllowed: number;
  rebatsUsed: number;
  /** Batting turns the side has (squad + extra turns). */
  battingTurns: number;
  wicketsInHand: number;
}

export function isBowlerCredited(type: DismissalType, rules: MatchRules): boolean {
  switch (type) {
    case 'bowled':
    case 'caught':
    case 'lbw':
    case 'stumped':
    case 'hitWicket':
      return true;
    case 'outOfCage':
      return rules.outOfCageBowlerCredit;
    default:
      return false;
  }
}

/** Dismissals allowed on a free hit. */
export function allowedOnFreeHit(type: DismissalType, rules: MatchRules): boolean {
  if (type === 'outOfCage') return rules.outOfCageOnFreeHit;
  return type === 'runOut' || type === 'obstructing' || type === 'hitTwice' || type === 'retiredOut';
}

export function ballLabel(ev: BallEvent, rules: MatchRules): { label: string; tone: BallTone } {
  if (ev.wicket) {
    return { label: ev.runs > 0 ? `${ev.runs}+W` : 'W', tone: 'wicket' };
  }
  switch (ev.extra) {
    case 'wd':
      return { label: ev.runs > 0 ? `${rules.wideRuns + ev.runs}Wd` : 'Wd', tone: 'extra' };
    case 'nb': {
      const from = ev.nbRunsFrom ?? 'bat';
      const suffix = from === 'bat' ? '' : from === 'b' ? 'B' : 'LB';
      return { label: ev.runs > 0 ? `Nb+${ev.runs}${suffix}` : 'Nb', tone: 'extra' };
    }
    case 'b':
      return { label: `${ev.runs}B`, tone: 'extra' };
    case 'lb':
      return { label: `${ev.runs}LB`, tone: 'extra' };
  }
  if (ev.boundary && ev.runs === 6) return { label: '6', tone: 'six' };
  if (ev.boundary && ev.runs === 4) return { label: '4', tone: 'four' };
  return { label: String(ev.runs), tone: ev.runs === 0 ? 'dot' : 'run' };
}

export function replayInnings(match: Match, index: number, target: number | null): InningsState {
  const inn = match.innings[index];
  const rules = match.rules;
  const bpo = rules.ballsPerOver;
  const battingTeam = inn.battingTeam;
  const bowlingTeam = (1 - battingTeam) as TeamIdx;
  const squad = match.teams[battingTeam].playerIds;
  const opposition = match.teams[bowlingTeam].playerIds;
  // Super over: one over, two wickets, no extra batting turns, no last man standing.
  const superOver = !!inn.superOver || index >= 2;
  const lastManStands = rules.lastManStands && !superOver;
  const rebatsAllowed = rules.rebatWhenShort && !superOver ? Math.max(0, opposition.length - squad.length) : 0;

  const batters: BatterLine[] = [];
  const latest = new Map<ID, BatterLine>();
  const bowlerMap = new Map<ID, BowlerLine>();
  let rebatsUsed = 0;

  let striker: BatterLine | null = null;
  let nonStriker: BatterLine | null = null;
  let bowlerId: ID | null = null;
  let lastOverBowlerId: ID | null = null;
  let started = false;
  let declared = false;
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  let freeHit = false;
  const extras = { wd: 0, nb: 0, b: 0, lb: 0, total: 0 };
  const balls: BallView[] = [];
  const overs: OverView[] = [];
  const fow: FallOfWicket[] = [];
  const partnerships: Partnership[] = [];
  // Declared via cast so TS doesn't narrow it to null (it's reassigned inside closures).
  let partnership = null as Partnership | null;
  let overConceded = 0;
  let overBowlers = new Set<ID>();

  const enterBatter = (pid: ID): BatterLine => {
    const existing = latest.get(pid);
    if (existing && existing.status !== 'out') {
      existing.status = 'batting';
      return existing;
    }
    if (existing) rebatsUsed++;
    const line: BatterLine = {
      key: `${pid}#${existing ? existing.stint + 1 : 1}`,
      playerId: pid,
      stint: existing ? existing.stint + 1 : 1,
      order: batters.length + 1,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      dots: 0,
      status: 'batting',
    };
    batters.push(line);
    latest.set(pid, line);
    return line;
  };
  const lineFor = (pid: ID): BatterLine => {
    const l = latest.get(pid);
    return l && l.status === 'batting' ? l : enterBatter(pid);
  };
  const bowler = (pid: ID): BowlerLine => {
    let b = bowlerMap.get(pid);
    if (!b) {
      b = {
        playerId: pid,
        order: bowlerMap.size + 1,
        balls: 0,
        runs: 0,
        wickets: 0,
        maidens: 0,
        dots: 0,
        wides: 0,
        noBalls: 0,
        fours: 0,
        sixes: 0,
      };
      bowlerMap.set(pid, b);
    }
    return b;
  };
  const startPartnershipIfNeeded = () => {
    if (!partnership && (striker || nonStriker)) {
      partnership = {
        batterIds: [striker, nonStriker].filter(Boolean).map((l) => l!.playerId),
        runs: 0,
        balls: 0,
        ongoing: true,
      };
      partnerships.push(partnership);
    } else if (partnership && partnership.batterIds.length < 2) {
      // Lone batter joined by a newcomer: continue as a fresh pair.
      const ids = [striker, nonStriker].filter(Boolean).map((l) => l!.playerId);
      if (ids.length === 2) {
        partnership.ongoing = false;
        partnership = { batterIds: ids, runs: 0, balls: 0, ongoing: true };
        partnerships.push(partnership);
      }
    }
  };
  const endPartnership = () => {
    if (partnership) partnership.ongoing = false;
    partnership = null;
  };
  const removeFromCrease = (line: BatterLine) => {
    if (striker === line) striker = null;
    else if (nonStriker === line) nonStriker = null;
  };
  const swap = () => {
    const t = striker;
    striker = nonStriker;
    nonStriker = t;
  };

  for (let eventIndex = 0; eventIndex < inn.events.length; eventIndex++) {
    const ev: ScoreEvent = inn.events[eventIndex];
    switch (ev.kind) {
      case 'start': {
        started = true;
        striker = enterBatter(ev.strikerId);
        nonStriker = ev.nonStrikerId ? enterBatter(ev.nonStrikerId) : null;
        bowlerId = ev.bowlerId;
        bowler(ev.bowlerId);
        startPartnershipIfNeeded();
        break;
      }
      case 'ball': {
        // Event positions are authoritative (self-heals lone-batter and manual swaps).
        striker = lineFor(ev.strikerId);
        nonStriker = ev.nonStrikerId ? lineFor(ev.nonStrikerId) : null;
        bowlerId = ev.bowlerId;
        startPartnershipIfNeeded();
        const bw = bowler(ev.bowlerId);
        const isWd = ev.extra === 'wd';
        const isNb = ev.extra === 'nb';
        const legal = !(isWd && rules.wideReball) && !(isNb && rules.noBallReball);
        const penalty = isWd ? rules.wideRuns : isNb ? rules.noBallRuns : 0;
        const total = penalty + ev.runs;
        const nbFrom = ev.nbRunsFrom ?? 'bat';
        const batRuns = !ev.extra || (isNb && nbFrom === 'bat') ? ev.runs : 0;

        if (isWd) extras.wd += total;
        else if (isNb) {
          extras.nb += penalty;
          if (nbFrom === 'b') extras.b += ev.runs;
          if (nbFrom === 'lb') extras.lb += ev.runs;
        } else if (ev.extra === 'b') extras.b += ev.runs;
        else if (ev.extra === 'lb') extras.lb += ev.runs;
        extras.total = extras.wd + extras.nb + extras.b + extras.lb;

        const conceded = isWd ? total : isNb ? penalty + batRuns : ev.extra ? 0 : ev.runs;

        const s = striker;
        s.runs += batRuns;
        if (!isWd) {
          s.balls++;
          if (batRuns === 0) s.dots++;
        }
        if (ev.boundary && batRuns === 4) {
          s.fours++;
          bw.fours++;
        }
        if (ev.boundary && batRuns === 6) {
          s.sixes++;
          bw.sixes++;
        }
        bw.runs += conceded;
        if (legal) bw.balls++;
        if (isWd) bw.wides++;
        if (isNb) bw.noBalls++;
        if (legal && conceded === 0) bw.dots++;
        runs += total;

        const wasFreeHit = freeHit;
        let outLine: BatterLine | null = null;
        if (ev.wicket) {
          outLine = latest.get(ev.wicket.playerOutId) ?? null;
          const credit = isBowlerCredited(ev.wicket.type, rules);
          if (outLine) {
            outLine.status = 'out';
            outLine.dismissal = {
              type: ev.wicket.type,
              bowlerId: ev.bowlerId,
              fielderId: ev.wicket.fielderId,
              bowlerCredit: credit,
            };
          }
          wickets++;
          if (credit) bw.wickets++;
        }

        if (ev.runs % 2 === 1) swap();
        if (outLine) removeFromCrease(outLine);
        if (legal) legalBalls++;

        if (partnership) {
          partnership.runs += total;
          if (legal) partnership.balls++;
        }
        if (ev.wicket) {
          fow.push({ wicketNo: wickets, runs, playerId: ev.wicket.playerOutId, legalBalls });
          endPartnership();
        }

        // Over bookkeeping
        let over = overs[overs.length - 1];
        if (!over || over.complete) {
          over = {
            overNo: Math.floor((legalBalls - (legal ? 1 : 0)) / bpo),
            bowlerId: ev.bowlerId,
            balls: [],
            runs: 0,
            wickets: 0,
            complete: false,
          };
          overs.push(over);
          overConceded = 0;
          overBowlers = new Set();
        }
        overBowlers.add(ev.bowlerId);
        overConceded += conceded;
        const { label, tone } = ballLabel(ev, rules);
        const view: BallView = {
          eventIndex,
          event: ev,
          overNo: over.overNo,
          legalBallsAfter: legalBalls,
          legal,
          label,
          tone,
          totalRuns: total,
          scoreAfter: { runs, wickets },
          wasFreeHit,
        };
        over.balls.push(view);
        balls.push(view);
        over.runs += total;
        if (ev.wicket) over.wickets++;

        if (legal && legalBalls % bpo === 0) {
          over.complete = true;
          if (overBowlers.size === 1 && overConceded === 0) bw.maidens++;
          swap();
          lastOverBowlerId = ev.bowlerId;
          bowlerId = null;
        }

        if (isNb && rules.freeHit) freeHit = true;
        else if (legal) freeHit = false;
        break;
      }
      case 'newBatter': {
        const line = enterBatter(ev.playerId);
        if (!striker) striker = line;
        else if (!nonStriker) nonStriker = line;
        startPartnershipIfNeeded();
        break;
      }
      case 'newBowler': {
        bowlerId = ev.playerId;
        bowler(ev.playerId);
        break;
      }
      case 'retire': {
        const line = latest.get(ev.playerId);
        if (!line) break;
        if (ev.out) {
          line.status = 'out';
          line.dismissal = { type: 'retiredOut', bowlerCredit: false };
          wickets++;
          fow.push({ wicketNo: wickets, runs, playerId: ev.playerId, legalBalls });
        } else {
          line.status = 'retired';
        }
        removeFromCrease(line);
        endPartnership();
        break;
      }
      case 'swap':
        swap();
        break;
      case 'declare':
        declared = true;
        break;
    }
  }

  // Who can still come in?
  const atCrease = new Set([striker, nonStriker].filter(Boolean).map((l) => (l as BatterLine).playerId));
  const fresh: AvailableBatter[] = [];
  const retired: AvailableBatter[] = [];
  const rebat: AvailableBatter[] = [];
  for (const pid of squad) {
    if (atCrease.has(pid)) continue;
    const line = latest.get(pid);
    if (!line) fresh.push({ playerId: pid, kind: 'new' });
    else if (line.status === 'retired') retired.push({ playerId: pid, kind: 'retired' });
    else if (line.status === 'out' && line.stint === 1 && rebatsUsed < rebatsAllowed)
      rebat.push({ playerId: pid, kind: 'rebat' });
  }
  // A second turn is only offered once everyone has had a first one.
  const availableBatters = [...fresh, ...retired, ...(fresh.length === 0 ? rebat : [])];

  let allOut = false;
  if (started) {
    const crease = [striker, nonStriker].filter(Boolean) as BatterLine[];
    if (crease.length === 0 && availableBatters.length === 0) allOut = true;
    else if (crease.length === 1 && availableBatters.length === 0) {
      if (lastManStands) {
        striker = crease[0];
        nonStriker = null;
      } else allOut = true;
    }
  }

  if (started && superOver && wickets >= SUPER_OVER_WICKETS) allOut = true;

  const maxBalls = superOver ? bpo : rules.overs * bpo;
  let completeReason: CompleteReason | undefined;
  if (declared) completeReason = 'declared';
  else if (target !== null && runs >= target) completeReason = 'target';
  else if (allOut) completeReason = 'allout';
  else if (started && legalBalls >= maxBalls) completeReason = 'overs';
  const complete = completeReason !== undefined;

  let needs: InningsState['needs'] = null;
  if (!complete) {
    const creaseCount = [striker, nonStriker].filter(Boolean).length;
    if (!started) needs = 'start';
    else if (creaseCount < 2 && availableBatters.length > 0) needs = 'batter';
    else if (!bowlerId) needs = 'bowler';
  }

  const battingTurns = superOver ? Math.min(squad.length, SUPER_OVER_WICKETS + 1) : squad.length + rebatsAllowed;
  const wicketsInHand = Math.max(0, battingTurns - (lastManStands ? 0 : 1) - wickets);

  return {
    index,
    superOver,
    battingTeam,
    bowlingTeam,
    started,
    runs,
    wickets,
    legalBalls,
    maxBalls,
    extras,
    batters,
    bowlers: [...bowlerMap.values()].filter((b) => b.balls > 0 || b.runs > 0 || b.playerId === bowlerId),
    striker,
    nonStriker,
    bowlerId,
    lastOverBowlerId,
    balls,
    overs,
    fow,
    partnerships,
    freeHit,
    target,
    complete,
    completeReason,
    needs,
    availableBatters,
    rebatsAllowed,
    rebatsUsed,
    battingTurns,
    wicketsInHand,
  };
}

export type MatchPhase = 'innings' | 'break' | 'result';

export interface MatchState {
  innings: InningsState[];
  current: InningsState | null;
  phase: MatchPhase;
  result: MatchResult | null;
}

export function computeMatch(match: Match): MatchState {
  const innings: InningsState[] = [];
  match.innings.forEach((_, i) => {
    // Innings come in pairs (main match, then any super overs): the second of each pair chases the first.
    const target = i % 2 === 1 ? innings[i - 1].runs + 1 : null;
    innings.push(replayInnings(match, i, target));
  });
  const current = innings[innings.length - 1] ?? null;
  let phase: MatchPhase = 'innings';
  let result: MatchResult | null = null;
  if (current?.complete) {
    if (innings.length % 2 === 1) phase = 'break';
    else {
      phase = 'result';
      result = computeResult(match, innings);
    }
  }
  return { innings, current, phase, result };
}

export function computeResult(match: Match, innings: InningsState[]): MatchResult {
  const main = pairResult(match, innings[0], innings[1]);
  // Super overs only matter if the main match is tied (an edited ball can un-tie it).
  if (innings.length < 4 || main.winner !== null) return main;
  // Decided by the latest completed super over.
  const so = pairResult(match, innings[innings.length - 2], innings[innings.length - 1]);
  const n = innings.length / 2 - 1;
  const label = n > 1 ? `Super Over ${n}` : 'Super Over';
  if (so.winner === null) return { winner: null, text: `Match tied · ${label} tied`, superOver: true };
  return { winner: so.winner, text: `Match tied · ${match.teams[so.winner].name} won the ${label}`, superOver: true };
}

function pairResult(match: Match, a: InningsState, b: InningsState): MatchResult {
  const nameA = match.teams[a.battingTeam].name;
  const nameB = match.teams[b.battingTeam].name;
  if (b.runs > a.runs) {
    const ballsLeft = Math.max(0, b.maxBalls - b.legalBalls);
    const w = b.wicketsInHand;
    const ballsText = `${ballsLeft} ball${ballsLeft === 1 ? '' : 's'} left`;
    return {
      winner: b.battingTeam,
      text:
        w > 0
          ? `${nameB} won by ${w} wicket${w === 1 ? '' : 's'} (${ballsText})`
          : `${nameB} won (${ballsText})`,
    };
  }
  if (a.runs > b.runs) {
    const d = a.runs - b.runs;
    return { winner: a.battingTeam, text: `${nameA} won by ${d} run${d === 1 ? '' : 's'}` };
  }
  return { winner: null, text: 'Match tied' };
}

/** Starts a super over after a tie: the side that batted second in the tied pair bats first (ICC playing conditions). */
export function startSuperOver(match: Match): Match {
  const last = match.innings[match.innings.length - 1];
  return { ...match, innings: [...match.innings, { battingTeam: last.battingTeam, events: [], superOver: true }] };
}

export function inningsLabel(index: number): string {
  if (index < 2) return index === 0 ? '1st innings' : '2nd innings';
  const n = Math.floor(index / 2);
  return `Super Over${n > 1 ? ' ' + n : ''}`;
}
/** Removes the last ball (and any batter/bowler selections made after it). */
export function undoLast(match: Match): Match {
  const innings = match.innings.map((i) => ({ ...i, events: [...i.events] }));
  const last = innings[innings.length - 1];
  if (!last) return match;
  if (last.events.length === 0) {
    if (innings.length > 1) innings.pop();
    return { ...match, innings };
  }
  while (last.events.length > 0) {
    const ev = last.events.pop()!;
    if (ev.kind !== 'newBatter' && ev.kind !== 'newBowler') break;
  }
  return { ...match, innings };
}

export function oversText(balls: number, bpo: number): string {
  const o = Math.floor(balls / bpo);
  const b = balls % bpo;
  return b === 0 ? `${o}` : `${o}.${b}`;
}

export function oversTextFull(balls: number, bpo: number): string {
  return `${Math.floor(balls / bpo)}.${balls % bpo}`;
}

export function strikeRate(runs: number, balls: number): string {
  return balls === 0 ? '-' : ((runs * 100) / balls).toFixed(1);
}

export function economy(runs: number, balls: number, bpo: number): string {
  return balls === 0 ? '-' : ((runs * bpo) / balls).toFixed(2);
}

export function runRate(runs: number, balls: number, bpo: number): string {
  return balls === 0 ? '0.00' : ((runs * bpo) / balls).toFixed(2);
}

/**
 * Replaces (or deletes, with `null`) one recorded ball. Later balls keep exactly who was on strike, so nothing
 * else shifts. If an edit changes a finished match's outcome the stored result is refreshed; if the match is no
 * longer decided it goes back to live.
 */
export function editBall(match: Match, inningsIndex: number, eventIndex: number, next: BallEvent | null): Match {
  const innings = match.innings.map((inn, i) => {
    if (i !== inningsIndex) return inn;
    const events = [...inn.events];
    if (next) events[eventIndex] = next;
    else events.splice(eventIndex, 1);
    return { ...inn, events };
  });
  const edited: Match = { ...match, innings };
  if (match.status !== 'completed') return edited;
  const st = computeMatch(edited);
  if (st.phase === 'result' && st.result) return { ...edited, result: st.result };
  return { ...edited, status: 'live', result: undefined };
}