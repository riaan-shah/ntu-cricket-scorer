import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../engine/engine';
import type { BallEvent, Match, Player } from '../types';
import { lockHeldByOther, unsyncedBalls } from './lock';
import { planRestore } from './restore';

const player = (id: string, updatedAt = 1): Player => ({ id, name: id, createdAt: 0, updatedAt });
const match = (id: string, updatedAt = 1, events: BallEvent[] = []): Match => ({
  id,
  date: '2026-10-01',
  createdAt: 0,
  updatedAt,
  teams: [
    { name: 'A', playerIds: ['a1', 'a2'] },
    { name: 'B', playerIds: ['b1', 'b2'] },
  ],
  rules: DEFAULT_RULES,
  innings: [{ battingTeam: 0, events: [{ kind: 'start', ts: 0, strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' }, ...events] }],
  status: 'live',
});
const ball = (runs: number, ts = runs): BallEvent => ({ kind: 'ball', ts, strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1', runs });

describe('restore planning', () => {
  const current = {
    players: [player('p1', 5), player('p2', 5), player('extra', 5)],
    matches: [match('m1', 5), match('later', 9)],
    settings: { clubName: 'Now', defaultVenue: '', exportTagline: '', defaultRules: DEFAULT_RULES },
    access: { admins: ['me@x.com'], scorers: ['s1@x.com'] },
  };
  const backup = {
    players: [player('p1', 9), player('p2', 1), player('gone', 1)],
    matches: [match('m1', 1), match('old', 1)],
    settings: { clubName: 'Backup', defaultVenue: '', exportTagline: '', defaultRules: DEFAULT_RULES },
    access: { admins: ['other@x.com'], scorers: ['s1@x.com', 'S2@x.com'] },
    full: true,
  };

  it('merge brings back only missing/newer items, never deletes, unions the scorer list, keeps settings', () => {
    const plan = planRestore(current, backup, 'merge');
    expect(plan.players.map((p) => p.id).sort()).toEqual(['gone', 'p1']);
    expect(plan.matches.map((m) => m.id)).toEqual(['old']);
    expect(plan.deletePlayerIds).toEqual([]);
    expect(plan.deleteMatchIds).toEqual([]);
    expect(plan.settings).toBeUndefined();
    expect(plan.access).toEqual({ admins: ['me@x.com', 'other@x.com'], scorers: ['s1@x.com', 's2@x.com'] });
  });

  it('exact restore of a full backup overwrites, deletes extras, replaces settings and access but keeps the restorer as admin', () => {
    const plan = planRestore(current, backup, 'exact', 'me@x.com', 1000);
    expect(plan.players.map((p) => p.id)).toEqual(['p1', 'p2', 'gone']);
    expect(plan.players.every((p) => p.updatedAt === 1000)).toBe(true);
    expect(plan.deletePlayerIds).toEqual(['extra']);
    expect(plan.deleteMatchIds).toEqual(['later']);
    expect(plan.settings?.clubName).toBe('Backup');
    expect(plan.access).toEqual({ admins: ['other@x.com', 'me@x.com'], scorers: ['s1@x.com', 's2@x.com'] });
  });

  it('exact restore of a snapshot (not full) never deletes', () => {
    const plan = planRestore(current, { ...backup, full: false }, 'exact', 'me@x.com');
    expect(plan.deletePlayerIds).toEqual([]);
    expect(plan.deleteMatchIds).toEqual([]);
  });

  it('settings come back on merge when the club has none', () => {
    expect(planRestore({ ...current, settings: undefined }, backup, 'merge').settings?.clubName).toBe('Backup');
  });
});

describe('scoring lock helpers', () => {
  it('a released lock does not lock anyone out', () => {
    const lock = { email: 'a', name: 'A', device: 'd1', at: 0 };
    expect(lockHeldByOther(lock, 'd2')).toBe(true);
    expect(lockHeldByOther(lock, 'd1')).toBe(false);
    expect(lockHeldByOther({ ...lock, released: true }, 'd2')).toBe(false);
    expect(lockHeldByOther(undefined, 'd2')).toBe(false);
  });

  it('counts balls this phone has that the club copy does not', () => {
    const club = match('m', 1, [ball(1), ball(4)]);
    const mine = match('m', 1, [ball(1), ball(4), ball(6), ball(0), ball(2)]);
    expect(unsyncedBalls(mine, club)).toBe(3);
    // The new scorer recorded different balls after the take-over: everything after the split counts.
    const theirs = match('m', 1, [ball(1), ball(4), ball(1, 99)]);
    expect(unsyncedBalls(mine, theirs)).toBe(3);
    // Same balls with fields in a different order (as the database may return them) are not "lost".
    const reordered = JSON.parse(JSON.stringify(mine)) as Match;
    reordered.innings[0].events = reordered.innings[0].events.map((e) => Object.fromEntries(Object.entries(e).reverse()) as typeof e);
    expect(unsyncedBalls(mine, reordered)).toBe(0);
  });
});
