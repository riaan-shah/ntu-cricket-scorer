import { describe, expect, it } from 'vitest';
import type { BallEvent, Match, ScoreEvent } from '../types';
import { DEFAULT_RULES } from './engine';
import { computeMvp } from './impact';
import { headToHead, inningsPhases, pairRecords, phaseOf, phaseRangeLabel, shotZones } from './insights';
import { winProbability } from './impact';
import { computeMatch } from './engine';
import { computeRecords } from './records';
import { decodeFields, previewHtml, previewText, type FsValue } from '../share/livePreview';

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

/** A completed 1-over match: Alpha 13/1, Bravo 9/2 — Alpha win by 4 runs. */
function played(id = 'm1', date = '2026-10-01'): Match {
  const first: ScoreEvent[] = [
    { kind: 'start', ts: 0, strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' },
    ball('a1', 'a2', 'b1', 6, { zone: 'straight' }),
    ball('a1', 'a2', 'b1', 4, { zone: 'off' }),
    ball('a1', 'a2', 'b1', 2, { zone: 'leg', save: { by: 'b2', runs: 2 } }),
    ball('a1', 'a2', 'b1', 0, { wicket: { type: 'outOfCage', playerOutId: 'a1' } }),
    { kind: 'newBatter', ts: 0, playerId: 'a3' },
    ball('a3', 'a2', 'b1', 1, { zone: 'behind' }),
    ball('a2', 'a3', 'b1', 0, { drop: 'b2' }),
  ];
  const second: ScoreEvent[] = [
    { kind: 'start', ts: 0, strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'a1' },
    ball('b1', 'b2', 'a1', 4),
    ball('b1', 'b2', 'a1', 0, { wicket: { type: 'bowled', playerOutId: 'b1' } }),
    { kind: 'newBatter', ts: 0, playerId: 'b3' },
    ball('b3', 'b2', 'a1', 4),
    ball('b3', 'b2', 'a1', 1),
    ball('b2', 'b3', 'a1', 0, { wicket: { type: 'outOfCage', playerOutId: 'b2' } }),
    { kind: 'newBatter', ts: 0, playerId: 'b4' },
    ball('b4', 'b3', 'a1', 0),
  ];
  const m: Match = {
    id,
    date,
    createdAt: 0,
    updatedAt: 0,
    teams: [
      { name: 'Alpha', playerIds: ['a1', 'a2', 'a3', 'a4'], captainId: 'a1' },
      { name: 'Bravo', playerIds: ['b1', 'b2', 'b3', 'b4'] },
    ],
    rules: { ...DEFAULT_RULES, overs: 1 },
    innings: [
      { battingTeam: 0, events: first },
      { battingTeam: 1, events: second },
    ],
    status: 'completed',
    result: { winner: 0, text: 'Alpha won by 4 runs' },
  };
  return m;
}

describe('club records', () => {
  it('finds totals, best scores and figures, biggest wins and out-of-cage counts', () => {
    const r = computeRecords([played()]);
    expect(r.highestTotals[0]).toMatchObject({ team: 'Alpha', runs: 13, wickets: 1 });
    expect(r.highestScores[0]).toMatchObject({ playerId: 'a1', primary: 12, secondary: 4, notOut: false });
    expect(r.bestFigures[0]).toMatchObject({ playerId: 'a1', primary: 2, secondary: 9 });
    expect(r.biggestWinsByRuns[0]).toMatchObject({ winner: 'Alpha', margin: 4 });
    expect(r.outOfCageCareer.map((c) => c.id).sort()).toEqual(['a1', 'b2']);
    expect(r.mostSixesInnings[0]).toMatchObject({ playerId: 'a1', primary: 1 });
  });

  it('ignores live matches and the bin', () => {
    const live = { ...played('m2'), status: 'live' as const };
    const binned = { ...played('m3'), deletedAt: 1 };
    expect(computeRecords([live, binned]).matches).toBe(0);
  });
});

describe('head to head and shot zones', () => {
  it('counts balls, runs and dismissals between one batter and one bowler', () => {
    const h = headToHead([played()], 'a1', 'b1');
    expect(h).toMatchObject({ balls: 4, runs: 12, dismissals: 1, fours: 1, sixes: 1, matches: 1 });
    expect(headToHead([played()], 'b1', 'a1')).toMatchObject({ balls: 2, runs: 4, dismissals: 1 });
  });

  it('adds up runs by cage zone', () => {
    const z = shotZones([played()], 'a1');
    expect(z.zones.straight.runs).toBe(6);
    expect(z.zones.off.runs).toBe(4);
    expect(z.zones.leg.runs).toBe(2);
    expect(z.tagged).toBe(3);
  });
});

describe('dropped catches and runs saved in MVP', () => {
  it('a drop lowers fielding impact and a save raises it', () => {
    const m = played();
    const base = computeMvp({ ...m, innings: m.innings.map((inn) => ({ ...inn, events: inn.events.map((e) => (e.kind === 'ball' ? { ...e, drop: undefined, save: undefined } : e)) })) });
    const withFielding = computeMvp(m);
    const field = (x: typeof base, id: string) => x.players.find((p) => p.playerId === id)?.fielding ?? 0;
    // b2 both saved 2 and dropped one — net effect differs from base; check each separately.
    const onlySave = computeMvp({ ...m, innings: m.innings.map((inn) => ({ ...inn, events: inn.events.map((e) => (e.kind === 'ball' ? { ...e, drop: undefined } : e)) })) });
    const onlyDrop = computeMvp({ ...m, innings: m.innings.map((inn) => ({ ...inn, events: inn.events.map((e) => (e.kind === 'ball' ? { ...e, save: undefined } : e)) })) });
    expect(field(onlySave, 'b2')).toBeGreaterThan(field(base, 'b2'));
    expect(field(onlyDrop, 'b2')).toBeLessThan(field(base, 'b2'));
    expect(field(withFielding, 'b2')).not.toBe(field(base, 'b2'));
  });
});

describe('live link preview', () => {
  it('decodes Firestore REST documents', () => {
    const fields: Record<string, FsValue> = {
      status: { stringValue: 'live' },
      createdAt: { integerValue: '5' },
      rules: { mapValue: { fields: { overs: { integerValue: '6' }, outOfCage: { booleanValue: true } } } },
      teams: { arrayValue: { values: [{ mapValue: { fields: { name: { stringValue: 'A' }, playerIds: { arrayValue: {} } } } }] } },
    };
    expect(decodeFields(fields)).toEqual({
      status: 'live',
      createdAt: 5,
      rules: { overs: 6, outOfCage: true },
      teams: [{ name: 'A', playerIds: [] }],
    });
  });

  it('writes a live title with the score and a finished title with the result', () => {
    const m = played();
    expect(previewText(m).title).toBe('Alpha v Bravo · Alpha won by 4 runs');
    const live: Match = { ...m, status: 'live', result: undefined, innings: [m.innings[0], { ...m.innings[1], events: m.innings[1].events.slice(0, 2) }] };
    expect(previewText(live).title).toBe('🔴 LIVE · Bravo 4/0 (0.1) v Alpha · need 10 from 5');
    expect(previewText(null).title).toContain('Live scores');
  });

  it('escapes names and redirects into the app', () => {
    const m = played();
    m.teams[0].name = '<script>"x"</script>';
    const html = previewHtml(m, 'https://x.test', 'm1');
    expect(html).not.toContain('<script>"x"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('https://x.test/#/match/m1');
    expect(html).toContain('og:title');
  });
});

describe('win probability', () => {
  const s = (runs: number, wickets: number, legalBalls: number) => ({
    runs, wickets, legalBalls, maxBalls: 36, maxWickets: 5, target: 61, par: 1.3,
  });
  it('is about even at the start of a par chase and moves with the game', () => {
    expect(winProbability(s(0, 0, 0))).toBeGreaterThan(35);
    expect(winProbability(s(0, 0, 0))).toBeLessThan(65);
    expect(winProbability(s(50, 0, 24))).toBeGreaterThan(winProbability(s(30, 0, 24)));
    expect(winProbability(s(30, 4, 24))).toBeLessThan(winProbability(s(30, 0, 24)));
  });
  it('is certain at the end', () => {
    expect(winProbability(s(61, 2, 30))).toBe(100);
    expect(winProbability(s(50, 2, 36))).toBe(0);
    expect(winProbability(s(60, 2, 36))).toBe(50); // tied
  });
});

describe('phases and partnerships', () => {
  it('splits overs into early / middle / death by format', () => {
    expect([0, 6, 12, 18, 24, 30].map((b) => phaseOf(b, 36, 6))).toEqual(['early', 'early', 'middle', 'middle', 'death', 'death']);
    expect([0, 6].map((b) => phaseOf(b, 12, 6))).toEqual(['early', 'death']);
    expect(phaseRangeLabel('middle', 2)).toBe('');
    expect(phaseRangeLabel('early', 6)).toBe('ov 1–2');
  });

  it('adds up runs by phase and pairs across matches', () => {
    const m = played();
    const first = computeMatch(m).innings[0];
    const ph = inningsPhases(first, 6);
    expect(ph.early.runs).toBe(first.runs); // 1-over match: all early
    const pairs = pairRecords([played('m1'), played('m2', '2026-10-02')]);
    const a1a2 = pairs.find((p) => p.ids.join() === 'a1,a2')!;
    expect(a1a2).toMatchObject({ runs: 24, innings: 2, best: 12 });
  });
});