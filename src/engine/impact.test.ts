import { describe, expect, it } from 'vitest';
import type { BallEvent, Match } from '../types';
import { computeMatch, DEFAULT_RULES } from './engine';
import { clubPar, computeMvp, impactGrade, pickHeroes, pressureIndex, pressureLabel, type PlayerImpact } from './impact';

const chase = (runs: number, wickets: number, legalBalls: number) =>
  pressureIndex({ runs, wickets, legalBalls, maxBalls: 120, maxWickets: 10, target: 161, par: 1.33 });

describe('pressure index', () => {
  it('uses the published bands', () => {
    expect([0, 19, 20, 39, 40, 64, 65, 79, 80, 100].map(pressureLabel)).toEqual([
      'Calm', 'Calm', 'Light', 'Light', 'Moderate', 'Moderate', 'High', 'High', 'Extreme', 'Extreme',
    ]);
  });

  it('rises when a wicket falls and falls when boundaries are hit (blog example)', () => {
    const before = chase(126, 6, 105); // 35 needed from 15, 4 wickets left
    const afterBoundaries = chase(141, 6, 111); // 20 from 9
    const afterWicket = chase(141, 7, 112); // 20 from 8, 3 wickets left
    expect(before).toBeGreaterThanOrEqual(65);
    expect(afterWicket).toBeGreaterThan(afterBoundaries);
    expect(afterWicket).toBeGreaterThanOrEqual(80);
  });

  it('is calm when cruising and zero once the target is reached', () => {
    expect(chase(150, 1, 90)).toBeLessThan(20);
    expect(chase(161, 3, 100)).toBe(0);
  });

  it('a collapse batting first is more pressure than a flying start', () => {
    const base = { maxBalls: 36, maxWickets: 5, target: null, par: 1.3 };
    expect(pressureIndex({ ...base, runs: 8, wickets: 3, legalBalls: 12 })).toBeGreaterThan(
      pressureIndex({ ...base, runs: 30, wickets: 0, legalBalls: 12 }),
    );
  });

  it('grades impact on the published scale', () => {
    expect([12, 8, 6, 4, 2, 0.5].map(impactGrade)).toEqual([
      'Exceptional', 'Excellent', 'Very good', 'Good', 'Useful', 'Marginal',
    ]);
  });
});

function match(): Match {
  return {
    id: 'm',
    date: '2026-10-15',
    createdAt: 0,
    updatedAt: 0,
    teams: [
      { name: 'A', playerIds: ['a1', 'a2', 'a3', 'a4'] },
      { name: 'B', playerIds: ['b1', 'b2', 'b3', 'b4'] },
    ],
    rules: { ...DEFAULT_RULES, overs: 2 },
    innings: [],
    status: 'live',
  };
}

const ball = (s: string, ns: string, bw: string, runs: number, extra: Partial<BallEvent> = {}): BallEvent => ({
  kind: 'ball',
  ts: 0,
  strikerId: s,
  nonStrikerId: ns,
  bowlerId: bw,
  runs,
  boundary: runs === 4 || runs === 6,
  ...extra,
});

describe('impact score', () => {
  it('values the same runs more under pressure', () => {
    // a1 scores 12 off 3 in a calm first innings; b1 scores 12 off 3 in a tight chase.
    const m = match();
    m.innings.push({
      battingTeam: 0,
      events: [
        { kind: 'start', ts: 0, strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b4' },
        ball('a1', 'a2', 'b4', 4),
        ball('a1', 'a2', 'b4', 4),
        ball('a1', 'a2', 'b4', 4),
        ball('a1', 'a2', 'b4', 1),
        ball('a2', 'a1', 'b4', 1),
        ball('a1', 'a2', 'b4', 0),
        { kind: 'newBowler', ts: 0, playerId: 'b3' },
        ...[2, 2, 2, 2, 2, 2].map((r) => ball('a2', 'a1', 'b3', r)),
      ],
    });
    m.innings.push({
      battingTeam: 1,
      events: [
        { kind: 'start', ts: 0, strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'a4' },
        ...[1, 0, 0, 0, 0, 0].map((r, i) => ball(i === 0 ? 'b1' : 'b2', i === 0 ? 'b2' : 'b1', 'a4', r)),
        { kind: 'newBowler', ts: 0, playerId: 'a3' },
        ball('b2', 'b1', 'a3', 1),
        ball('b1', 'b2', 'a3', 4),
        ball('b1', 'b2', 'a3', 4),
        ball('b1', 'b2', 'a3', 4),
      ],
    });
    const state = computeMatch(m);
    const mvp = computeMvp(m, state);
    const a1 = mvp.players.find((p) => p.playerId === 'a1')!;
    const b1 = mvp.players.find((p) => p.playerId === 'b1')!;
    expect(b1.battingPressure!).toBeGreaterThan(a1.battingPressure!);
    expect(mvp.pressure[1].length).toBe(10);
    expect(mvp.pressure[1][9].pi).toBeGreaterThan(mvp.pressure[0][0].pi);
  });
});

describe('impact scale calibration', () => {
  it('30 off 15 in a 6-over game grades Very good to Excellent', () => {
    const m = match();
    m.rules.overs = 6;
    const events: BallEvent[] = [];
    for (let i = 0; i < 36; i++) {
      const bowler = Math.floor(i / 6) % 2 ? 'b2' : 'b1';
      events.push(i < 15 ? ball('a1', 'a2', bowler, 2) : ball('a2', 'a1', bowler, 1));
    }
    m.innings.push({
      battingTeam: 0,
      events: [{ kind: 'start', ts: 0, strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' }, ...events],
    });
    const a1 = computeMvp(m).players.find((p) => p.playerId === 'a1')!;
    expect(a1.total).toBeGreaterThanOrEqual(5);
    expect(a1.total).toBeLessThan(10);
  });
});

describe('heroes of the match', () => {
  const p = (playerId: string, batting: number, bowling: number): PlayerImpact => ({
    playerId,
    batting,
    bowling,
    fielding: 0,
    total: batting + bowling,
    battingPressure: null,
    bowlingPressure: null,
    pressureRuns: 0,
    ballsFaced: 0,
    summary: '',
  });
  const m = match();

  it('picks POTM from the winning side within the top 3, and a fighter from the losers', () => {
    const ranked = [p('b1', 9, 0), p('b2', 0, 7), p('a1', 6, 0), p('a2', 1, 3)];
    const h = pickHeroes(m, ranked, { winner: 0, text: '' });
    expect(h).toEqual({ potm: 'a1', bestBatter: 'b1', bestBowler: 'b2', fighter: 'b1' });
  });

  it('falls back to the MVP leader when no winner is in the top 3', () => {
    const ranked = [p('b1', 9, 0), p('b2', 0, 7), p('b3', 6, 0), p('a1', 1, 0)];
    expect(pickHeroes(m, ranked, { winner: 0, text: '' }).potm).toBe('b1');
    expect(pickHeroes(m, ranked, { winner: 0, text: '' }).fighter).toBe('b2');
  });

  it('only gives Fighter to a positive contribution', () => {
    const ranked = [p('a1', 9, 0), p('a2', 5, 0), p('b1', -3, 0)];
    expect(pickHeroes(m, ranked, { winner: 0, text: '' }).fighter).toBeUndefined();
  });

  it('has no fighter in a tie', () => {
    const ranked = [p('b1', 9, 0), p('a1', 5, 0)];
    expect(pickHeroes(m, ranked, { winner: null, text: 'Match tied' })).toMatchObject({ potm: 'b1', fighter: undefined });
  });
});

describe('wicket shock (Shah & Shah 2014)', () => {
  // Recreates the paper's example: chasing 158 in a T20, an early wicket, then 4, 6, 6.
  function t20Chase(): Match {
    const a = Array.from({ length: 11 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 11 }, (_, i) => `b${i}`);
    const first: BallEvent[] = [];
    for (let i = 0; i < 26; i++) first.push(ball('a0', 'a1', 'b10', 6));
    first.push(ball('a0', 'a1', 'b10', 1));
    const chase = [1, 0, 1, 0].map((r, i) => ball(i % 2 ? 'b1' : 'b0', i % 2 ? 'b0' : 'b1', 'a10', r));
    return {
      ...match(),
      teams: [
        { name: 'India', playerIds: a },
        { name: 'Pakistan', playerIds: b },
      ],
      rules: { ...DEFAULT_RULES, overs: 20, rebatWhenShort: false },
      innings: [
        {
          battingTeam: 0,
          events: [{ kind: 'start', ts: 0, strikerId: 'a0', nonStrikerId: 'a1', bowlerId: 'b10' }, ...first, { kind: 'declare', ts: 0 }],
        },
        {
          battingTeam: 1,
          events: [
            { kind: 'start', ts: 0, strikerId: 'b0', nonStrikerId: 'b1', bowlerId: 'a10' },
            ...chase,
            ball('b0', 'b1', 'a10', 0, { wicket: { type: 'bowled', playerOutId: 'b0' } }),
            { kind: 'newBatter', ts: 0, playerId: 'b2' },
            ...[2, 4, 6, 6, 0].map((r) => ball('b2', 'b1', 'a10', r)),
          ],
        },
      ],
    };
  }

  it('spikes on an early wicket and eases as runs repay it', () => {
    const m = t20Chase();
    const state = computeMatch(m);
    expect(state.innings[1].target).toBe(158);
    const pi = computeMvp(m, state).pressure[1].map((p) => p.pi);
    const beforeWicket = pi[4];
    const afterWicket = pi[5];
    const afterBigHits = pi[9]; // after 2, 4, 6, 6
    expect(afterWicket - beforeWicket).toBeGreaterThanOrEqual(5);
    expect(afterBigHits).toBeLessThan(afterWicket);
  });
});

describe('club par from history', () => {
  const completed = (id: string, venue: string, runs: number, date: string): Match => {
    const m = match();
    m.id = id;
    m.venue = venue;
    m.date = date;
    m.status = 'completed';
    m.rules = { ...DEFAULT_RULES, overs: 1 };
    const evs: BallEvent[] = [];
    for (let i = 0; i < 6; i++) evs.push(ball('a1', 'a2', 'b1', i < runs / 2 ? 2 : 0));
    m.innings = [{ battingTeam: 0, events: [{ kind: 'start', ts: 0, strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' }, ...evs] }];
    return m;
  };

  it('needs 3 earlier matches, prefers the same venue, and ignores later matches', () => {
    const now = { ...match(), venue: 'Cage', date: '2026-10-20' };
    const history = [completed('1', 'Cage', 12, '2026-10-01'), completed('2', 'Cage', 6, '2026-10-02')];
    expect(clubPar(history, now)).toBeUndefined();
    history.push(completed('3', 'Cage', 6, '2026-10-03'), completed('4', 'Field', 0, '2026-10-04'));
    expect(clubPar(history, now)).toBeCloseTo(24 / 18); // same-venue only
    history.push(completed('5', 'Cage', 12, '2026-10-30')); // after this match — ignored
    expect(clubPar(history, now)).toBeCloseTo(24 / 18);
  });
});