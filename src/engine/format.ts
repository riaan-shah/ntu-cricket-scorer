import type { DismissalType, ID, Match, TeamIdx } from '../types';
import type { BallView, BatterLine } from './engine';

export type NameOf = (id: ID | undefined | null) => string;

export const DISMISSAL_LABELS: Record<DismissalType, string> = {
  bowled: 'Bowled',
  caught: 'Caught',
  lbw: 'LBW',
  runOut: 'Run out',
  stumped: 'Stumped',
  hitWicket: 'Hit wicket',
  outOfCage: 'Out of cage',
  retiredOut: 'Retired out',
  obstructing: 'Obstructing field',
  hitTwice: 'Hit ball twice',
};

export function dismissalText(line: BatterLine, nameOf: NameOf, live = false): string {
  if (line.status === 'batting') return live ? 'batting' : 'not out';
  if (line.status === 'retired') return 'retired hurt';
  const d = line.dismissal;
  if (!d) return 'out';
  const bowler = nameOf(d.bowlerId);
  const fielder = nameOf(d.fielderId);
  switch (d.type) {
    case 'bowled':
      return `b ${bowler}`;
    case 'caught':
      return d.fielderId && d.fielderId === d.bowlerId ? `c & b ${bowler}` : `c ${d.fielderId ? fielder : 'sub'} b ${bowler}`;
    case 'lbw':
      return `lbw b ${bowler}`;
    case 'stumped':
      return `st ${d.fielderId ? fielder : 'wk'} b ${bowler}`;
    case 'hitWicket':
      return `hit wicket b ${bowler}`;
    case 'runOut':
      return d.fielderId ? `run out (${fielder})` : 'run out';
    case 'outOfCage':
      return d.bowlerCredit ? `out of cage b ${bowler}` : 'out of cage';
    case 'retiredOut':
      return 'retired out';
    case 'obstructing':
      return 'obstructing the field';
    case 'hitTwice':
      return 'hit the ball twice';
  }
}

/** "3.4" style ball number for commentary. */
export function ballNumber(bv: BallView, bpo: number): string {
  if (bv.legal) {
    const b = bv.legalBallsAfter;
    const over = Math.floor((b - 1) / bpo);
    return `${over}.${((b - 1) % bpo) + 1}`;
  }
  return `${bv.overNo}.${(bv.legalBallsAfter % bpo) + 1}`;
}

export function commentary(bv: BallView, nameOf: NameOf): string {
  const ev = bv.event;
  const who = `${nameOf(ev.bowlerId)} to ${nameOf(ev.strikerId)}`;
  const parts: string[] = [];
  if (ev.extra === 'wd') parts.push(ev.runs ? `wide + ${ev.runs} run${ev.runs > 1 ? 's' : ''}` : 'wide');
  else if (ev.extra === 'nb') {
    const from = ev.nbRunsFrom ?? 'bat';
    parts.push('no ball');
    if (ev.runs) parts.push(from === 'bat' ? `${ev.runs} off the bat` : `${ev.runs} ${from === 'b' ? 'bye' : 'leg bye'}${ev.runs > 1 ? 's' : ''}`);
  } else if (ev.extra === 'b' || ev.extra === 'lb')
    parts.push(`${ev.runs} ${ev.extra === 'b' ? 'bye' : 'leg bye'}${ev.runs > 1 ? 's' : ''}`);
  else if (ev.boundary && ev.runs === 6) parts.push('SIX!');
  else if (ev.boundary && ev.runs === 4) parts.push('FOUR!');
  else parts.push(ev.runs === 0 ? 'no run' : `${ev.runs} run${ev.runs > 1 ? 's' : ''}`);

  if (ev.wicket) {
    const out = nameOf(ev.wicket.playerOutId);
    const how = DISMISSAL_LABELS[ev.wicket.type].toUpperCase();
    const by = ev.wicket.fielderId ? ` (${nameOf(ev.wicket.fielderId)})` : '';
    parts.push(`OUT! ${out} ${how}${by}`);
  }
  if (bv.wasFreeHit) parts.push('(free hit)');
  return `${who}, ${parts.join(', ')}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** " (c)" after a team's captain, as on a printed scorecard. */
export function captainMark(match: Match, team: TeamIdx, playerId: ID): string {
  return match.teams[team].captainId === playerId ? ' (c)' : '';
}
