import { describe, expect, it } from 'vitest';
import type { BallEvent, Match, MatchRules, ScoreEvent } from '../types';
import { computeMatch, DEFAULT_RULES, undoLast } from './engine';
import { computeMvp } from './impact';
import { computeCareerStats } from './stats';

function makeMatch(a: string[], b: string[], rules: Partial<MatchRules> = {}): Match {
  return {
    id: 'm1',
    date: '2026-10-15',
    createdAt: 0,
    updatedAt: 0,
    teams: [
      { name: 'Alpha', playerIds: a },
      { name: 'Bravo', playerIds: b },
    ],
    rules: { ...DEFAULT_RULES, ...rules },
    innings: [{ battingTeam: 0, events: [] }],
    status: 'live',
  };
}

/** Tiny scorer that mirrors what the UI does: reads current state, appends an event. */
function scorer(match: Match) {
  const cur = () => computeMatch(match).current!;
  const push = (ev: ScoreEvent) => {
    match.innings[match.innings.length - 1].events.push(ev);
  };
  const ball = (extra: Partial<BallEvent> = {}) => {
    const s = cur();
    push({
      kind: 'ball',
      ts: 0,
      strikerId: s.striker!.playerId,
      nonStrikerId: s.nonStriker?.playerId ?? null,
      bowlerId: s.bowlerId!,
      runs: 0,
      ...extra,
    });
  };
  return {
    cur,
    start: (s: string, ns: string | null, bw: string) =>
      push({ kind: 'start', ts: 0, strikerId: s, nonStrikerId: ns, bowlerId: bw }),
    runs: (n: number) => ball({ runs: n, boundary: n === 4 || n === 6 }),
    ball,
    out: (type: NonNullable<BallEvent['wicket']>['type'] = 'bowled', extra: Partial<BallEvent> = {}) =>
      ball({ wicket: { type, playerOutId: cur().striker!.playerId }, ...extra }),
    batter: (id: string) => push({ kind: 'newBatter', ts: 0, playerId: id }),
    bowler: (id: string) => push({ kind: 'newBowler', ts: 0, playerId: id }),
    nextInnings: () => match.innings.push({ battingTeam: 1, events: [] }),
  };
}

describe('basic scoring', () => {
  it('rotates strike on odd runs and at end of over', () => {
    const m = makeMatch(['a1', 'a2', 'a3'], ['b1', 'b2', 'b3']);
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.runs(1);
    expect(s.cur().striker!.playerId).toBe('a2');
    s.runs(4);
    s.runs(0);
    s.runs(2);
    s.runs(6);
    expect(s.cur().striker!.playerId).toBe('a2');
    s.runs(0); // 6th ball -> over ends, ends swap
    const st = s.cur();
    expect(st.legalBalls).toBe(6);
    expect(st.striker!.playerId).toBe('a1');
    expect(st.needs).toBe('bowler');
    expect(st.runs).toBe(13);
    const a2 = st.batters.find((b) => b.playerId === 'a2')!;
    expect(a2).toMatchObject({ runs: 12, balls: 5, fours: 1, sixes: 1 });
    expect(st.bowlers[0]).toMatchObject({ balls: 6, runs: 13, maidens: 0 });
  });

  it('handles wides, no balls and byes', () => {
    const m = makeMatch(['a1', 'a2'], ['b1', 'b2']);
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.ball({ extra: 'wd' });
    s.ball({ extra: 'wd', runs: 1 }); // wide + 1 run -> strike swaps
    expect(s.cur().striker!.playerId).toBe('a2');
    s.ball({ extra: 'nb', runs: 4, boundary: true }); // 1 + 4 off the bat
    s.ball({ extra: 'lb', runs: 2 });
    const st = s.cur();
    expect(st.runs).toBe(1 + 2 + 5 + 2);
    expect(st.legalBalls).toBe(1);
    expect(st.extras).toEqual({ wd: 3, nb: 1, b: 0, lb: 2, total: 6 });
    expect(st.bowlers[0]).toMatchObject({ runs: 8, wides: 2, noBalls: 1, balls: 1 });
    const a2 = st.batters.find((b) => b.playerId === 'a2')!;
    expect(a2).toMatchObject({ runs: 4, balls: 2, fours: 1 });
    expect(st.freeHit).toBe(false); // leg bye was the free hit, now consumed
  });

  it('counts maidens', () => {
    const m = makeMatch(['a1', 'a2'], ['b1', 'b2'], { ballsPerOver: 3 });
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.runs(0);
    s.ball({ extra: 'b', runs: 1 });
    s.runs(0);
    expect(s.cur().bowlers[0].maidens).toBe(1);
  });
});

describe('club rules', () => {
  it('out of cage is a wicket credited to the bowler', () => {
    const m = makeMatch(['a1', 'a2', 'a3'], ['b1', 'b2']);
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.out('outOfCage');
    const st = s.cur();
    expect(st.wickets).toBe(1);
    expect(st.bowlers[0].wickets).toBe(1);
    expect(st.needs).toBe('batter');
    expect(st.batters[0].dismissal?.type).toBe('outOfCage');
  });

  it('short team gets an extra batting turn and is not all out early', () => {
    // Alpha has 2, Bravo has 3 -> Alpha gets one rebat
    const m = makeMatch(['a1', 'a2'], ['b1', 'b2', 'b3']);
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    expect(s.cur().rebatsAllowed).toBe(1);
    s.out();
    let st = s.cur();
    expect(st.complete).toBe(false);
    expect(st.availableBatters).toEqual([{ playerId: 'a1', kind: 'rebat' }]);
    s.batter('a1');
    st = s.cur();
    expect(st.batters.map((b) => b.key)).toEqual(['a1#1', 'a2#1', 'a1#2']);
    s.runs(3);
    s.out();
    st = s.cur();
    expect(st.complete).toBe(true);
    expect(st.completeReason).toBe('allout');
    expect(st.batters[2]).toMatchObject({ runs: 3, stint: 2 });
  });

  it('last man stands lets the final batter continue alone', () => {
    const m = makeMatch(['a1', 'a2'], ['b1', 'b2'], { lastManStands: true });
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.out();
    let st = s.cur();
    expect(st.complete).toBe(false);
    expect(st.striker!.playerId).toBe('a2');
    expect(st.nonStriker).toBeNull();
    s.runs(1); // no one to swap with
    expect(s.cur().striker!.playerId).toBe('a2');
    s.out();
    st = s.cur();
    expect(st.completeReason).toBe('allout');
  });

  it('adding a player mid-innings re-opens batting', () => {
    const m = makeMatch(['a1', 'a2'], ['b1', 'b2'], { rebatWhenShort: false });
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.out();
    expect(s.cur().completeReason).toBe('allout');
    m.teams[0].playerIds.push('a3');
    const st = s.cur();
    expect(st.complete).toBe(false);
    expect(st.needs).toBe('batter');
  });

  it('a player can play for both teams', () => {
    const m = makeMatch(['a1', 'a2', 'x'], ['b1', 'b2', 'x']);
    const s = scorer(m);
    s.start('x', 'a1', 'b1');
    s.runs(4);
    const st = s.cur();
    expect(st.batters[0]).toMatchObject({ playerId: 'x', runs: 4 });
    expect(st.rebatsAllowed).toBe(0);
  });

  it('increasing overs re-opens a finished innings', () => {
    const m = makeMatch(['a1', 'a2'], ['b1', 'b2'], { overs: 1, ballsPerOver: 2 });
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.runs(1);
    s.runs(1);
    expect(s.cur().completeReason).toBe('overs');
    m.rules.overs = 2;
    expect(s.cur().complete).toBe(false);
    expect(s.cur().needs).toBe('bowler');
  });

  it('free hit blocks nothing but is tracked', () => {
    const m = makeMatch(['a1', 'a2'], ['b1', 'b2']);
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.ball({ extra: 'nb' });
    expect(s.cur().freeHit).toBe(true);
    s.ball({ extra: 'wd' });
    expect(s.cur().freeHit).toBe(true);
    s.runs(0);
    expect(s.cur().freeHit).toBe(false);
  });
});

describe('match flow', () => {
  function playChase(chaserRuns: number) {
    const m = makeMatch(['a1', 'a2', 'a3'], ['b1', 'b2', 'b3'], { overs: 1 });
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.runs(4);
    s.runs(4);
    s.out('caught', { wicket: { type: 'caught', playerOutId: 'a1', fielderId: 'b2' } });
    s.batter('a3');
    s.runs(0);
    s.runs(0);
    s.runs(1); // 6th ball: innings over at 9/1
    expect(computeMatch(m).phase).toBe('break');
    s.nextInnings();
    s.start('b1', 'b2', 'a1');
    for (const r of [4, 4, 0, chaserRuns]) s.runs(r);
    return { m, s };
  }

  it('chasing side wins by wickets once target reached', () => {
    const { m } = playChase(2);
    const st = computeMatch(m);
    expect(st.innings[1].target).toBe(10);
    expect(st.phase).toBe('result');
    expect(st.result).toEqual({ winner: 1, text: 'Bravo won by 2 wickets (2 balls left)' });
  });

  it('defending side wins by runs', () => {
    const { m, s } = playChase(0);
    s.runs(0);
    s.runs(0);
    const st = computeMatch(m);
    expect(st.result).toEqual({ winner: 0, text: 'Alpha won by 1 run' });
  });

  it('undo removes the last ball and trailing selections', () => {
    const m = makeMatch(['a1', 'a2', 'a3'], ['b1', 'b2']);
    const s = scorer(m);
    s.start('a1', 'a2', 'b1');
    s.out();
    s.batter('a3');
    const undone = undoLast(m);
    const st = computeMatch(undone).current!;
    expect(st.wickets).toBe(0);
    expect(st.legalBalls).toBe(0);
    expect(st.striker!.playerId).toBe('a1');
  });

  it('career stats and MOTM aggregate across matches', () => {
    const { m } = playChase(2);
    m.status = 'completed';
    m.result = computeMatch(m).result!;
    m.motmId = computeMvp(m).heroes.potm;
    const stats = computeCareerStats([m]);
    const b2 = stats.get('b2')!;
    expect(b2.catches).toBe(1);
    expect(b2.wins).toBe(1);
    expect(stats.get('a1')!.bat).toMatchObject({ innings: 1, runs: 8, fours: 2 });
    expect(stats.get('a1')!.bowl).toMatchObject({ balls: 4, runs: 10 });
    expect(stats.get('b1')!.bowl.wickets).toBe(1);
  });
});
