export type ID = string;
export type TeamIdx = 0 | 1;

export type PlayerRole = 'Batter' | 'Bowler' | 'All-rounder' | 'Wicket-keeper';

export interface Player {
  id: ID;
  name: string;
  nickname?: string;
  role?: PlayerRole;
  battingStyle?: 'Right-hand bat' | 'Left-hand bat';
  bowlingStyle?: string;
  /** Removed from the roster but kept so old scorecards still show the name. */
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type DismissalType =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'runOut'
  | 'stumped'
  | 'hitWicket'
  | 'outOfCage'
  | 'retiredOut'
  | 'obstructing'
  | 'hitTwice';

export type ExtraType = 'wd' | 'nb' | 'b' | 'lb';

/** Cage shot zones, relative to the batter (off/leg flip for left-handers when drawn). */
export type ShotZone = 'straight' | 'off' | 'leg' | 'behind';

export interface MatchRules {
  /** Overs per innings. Can be increased (or reduced) mid-match. */
  overs: number;
  ballsPerOver: number;
  /** Club rule: ball leaving the cage = batter out. */
  outOfCage: boolean;
  outOfCageBowlerCredit: boolean;
  outOfCageOnFreeHit: boolean;
  wideRuns: number;
  noBallRuns: number;
  wideReball: boolean;
  noBallReball: boolean;
  freeHit: boolean;
  /** Last remaining batter may continue alone. */
  lastManStands: boolean;
  /** Club rule: the short-handed team gets one extra batting turn per missing player (a dismissed batter bats again). */
  rebatWhenShort: boolean;
  /** 0 = unlimited */
  maxOversPerBowler: number;
  noConsecutiveOvers: boolean;
  /** Ask where each scoring shot went (cage shot zones). */
  shotZones?: boolean;
}

export interface Team {
  name: string;
  playerIds: ID[];
  captainId?: ID;
  keeperId?: ID;
}

interface EventBase {
  ts: number;
}

export interface StartEvent extends EventBase {
  kind: 'start';
  strikerId: ID;
  nonStrikerId: ID | null;
  bowlerId: ID;
}

export interface BallEvent extends EventBase {
  kind: 'ball';
  strikerId: ID;
  nonStrikerId: ID | null;
  bowlerId: ID;
  /** Runs hit/run on this delivery, excluding the automatic wide/no-ball penalty. */
  runs: number;
  /** True when `runs` was a 4/6 boundary (counts towards 4s/6s). */
  boundary?: boolean;
  extra?: ExtraType;
  /** On a no-ball: were the `runs` off the bat, byes or leg byes? */
  nbRunsFrom?: 'bat' | 'b' | 'lb';
  wicket?: {
    type: DismissalType;
    playerOutId: ID;
    fielderId?: ID;
  };
  /** Where a scoring shot went. */
  zone?: ShotZone;
  /** Fielder who dropped a catch on this ball. */
  drop?: ID;
  /** Runs a fielder stopped on this ball (dive, boundary save…). */
  save?: { by: ID; runs: number };
}

export interface NewBatterEvent extends EventBase {
  kind: 'newBatter';
  playerId: ID;
}

export interface NewBowlerEvent extends EventBase {
  kind: 'newBowler';
  playerId: ID;
}

export interface RetireEvent extends EventBase {
  kind: 'retire';
  playerId: ID;
  /** true = retired out (counts as a wicket), false = retired hurt (may return). */
  out: boolean;
}

export interface SwapEvent extends EventBase {
  kind: 'swap';
}

export interface DeclareEvent extends EventBase {
  kind: 'declare';
}

export type ScoreEvent =
  | StartEvent
  | BallEvent
  | NewBatterEvent
  | NewBowlerEvent
  | RetireEvent
  | SwapEvent
  | DeclareEvent;

export interface Innings {
  battingTeam: TeamIdx;
  events: ScoreEvent[];
  /** Tie-breaker: one over, two wickets. Innings 3+ are always super overs. */
  superOver?: boolean;
}

export interface MatchResult {
  winner: TeamIdx | null;
  text: string;
  /** Decided (or still tied) in a super over. */
  superOver?: boolean;
}

/** Who is currently scoring a live match (cloud mode), so two phones don't overwrite each other. */
export interface ScorerLock {
  email: string;
  name: string;
  /** Per-browser id: the same person on two phones is still two scorers. */
  device: string;
  /** Last time the holder saved (ms). */
  at: number;
}

export type MatchStatus = 'live' | 'completed' | 'abandoned';

export interface Match {
  id: ID;
  title?: string;
  venue?: string;
  /** yyyy-mm-dd */
  date: string;
  createdAt: number;
  updatedAt: number;
  teams: [Team, Team];
  rules: MatchRules;
  toss?: { winner: TeamIdx; decision: 'bat' | 'bowl' };
  innings: Innings[];
  status: MatchStatus;
  result?: MatchResult;
  motmId?: ID;
  /** Set when the match is in the bin (restorable for 30 days). */
  deletedAt?: number;
  /**
   * Rain rule: set when overs change after the first innings is complete. overs1 = overs team 1 batted,
   * 2 = batting resources left to team 2 (same units as esources()); the chase target is revised from these.
   */
  rain?: { overs1: number; r2: number };
  scorer?: ScorerLock;
}

export interface ClubSettings {
  clubName: string;
  defaultVenue: string;
  /** Footer line on the shareable match-summary image. */
  exportTagline: string;
  defaultRules: MatchRules;
}
