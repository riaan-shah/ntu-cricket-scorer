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
}

export interface MatchResult {
  winner: TeamIdx | null;
  text: string;
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
}

export interface ClubSettings {
  clubName: string;
  defaultVenue: string;
  /** Footer line on the shareable match-summary image. */
  exportTagline: string;
  defaultRules: MatchRules;
}
