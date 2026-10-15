import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { DEFAULT_RULES } from './engine/engine';
import type { ClubSettings, ID, Match, Player } from './types';

interface SettingRow {
  key: string;
  value: ClubSettings;
}

class CricketDB extends Dexie {
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super('ntu-cricket-scorer');
    this.version(1).stores({
      players: 'id, name',
      matches: 'id, status, date',
      settings: 'key',
    });
  }
}

export const db = new CricketDB();

/** crypto.randomUUID needs a secure context, which a phone on http://<lan-ip> isn't. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_SETTINGS: ClubSettings = {
  clubName: 'NTU Cricket Club',
  defaultVenue: 'NTU Cage',
  exportTagline: 'Play. Passion. Fun. · @ntu.cricketclub',
  defaultRules: DEFAULT_RULES,
};

// ---------- Players ----------

export async function createPlayer(name: string, extra: Partial<Player> = {}): Promise<Player> {
  const now = Date.now();
  const p: Player = { ...extra, id: uid(), name: name.trim(), createdAt: now, updatedAt: now };
  await db.players.put(p);
  return p;
}

export async function savePlayer(p: Player) {
  await db.players.put({ ...p, updatedAt: Date.now() });
}

export async function playerMatchCount(id: ID): Promise<number> {
  const all = await db.matches.toArray();
  return all.filter((m) => m.teams.some((t) => t.playerIds.includes(id))).length;
}

export async function deletePlayer(id: ID) {
  await db.players.delete(id);
}

/** Rewrites every reference to `fromId` as `intoId`, then removes `fromId`. */
export async function mergePlayers(fromId: ID, intoId: ID) {
  const swap = (id: ID) => (id === fromId ? intoId : id);
  const swapOpt = (id: ID | undefined) => (id === undefined ? id : swap(id));
  await db.transaction('rw', db.players, db.matches, async () => {
    const matches = await db.matches.toArray();
    for (const m of matches) {
      const json = JSON.stringify(m);
      if (!json.includes(fromId)) continue;
      const next: Match = {
        ...m,
        updatedAt: Date.now(),
        motmId: swapOpt(m.motmId),
        teams: m.teams.map((t) => ({
          ...t,
          playerIds: [...new Set(t.playerIds.map(swap))],
          captainId: swapOpt(t.captainId),
          keeperId: swapOpt(t.keeperId),
        })) as Match['teams'],
        innings: m.innings.map((inn) => ({
          ...inn,
          events: inn.events.map((ev) => {
            switch (ev.kind) {
              case 'start':
                return { ...ev, strikerId: swap(ev.strikerId), nonStrikerId: ev.nonStrikerId && swap(ev.nonStrikerId), bowlerId: swap(ev.bowlerId) };
              case 'ball':
                return {
                  ...ev,
                  strikerId: swap(ev.strikerId),
                  nonStrikerId: ev.nonStrikerId && swap(ev.nonStrikerId),
                  bowlerId: swap(ev.bowlerId),
                  wicket: ev.wicket && {
                    ...ev.wicket,
                    playerOutId: swap(ev.wicket.playerOutId),
                    fielderId: swapOpt(ev.wicket.fielderId),
                  },
                };
              case 'newBatter':
              case 'newBowler':
              case 'retire':
                return { ...ev, playerId: swap(ev.playerId) };
              default:
                return ev;
            }
          }),
        })),
      };
      await db.matches.put(next);
    }
    await db.players.delete(fromId);
  });
}

// ---------- Matches ----------

export async function saveMatch(m: Match) {
  await db.matches.put({ ...m, updatedAt: Date.now() });
}

export async function deleteMatch(id: ID) {
  await db.matches.delete(id);
}

// ---------- Settings ----------

export async function saveSettings(s: ClubSettings) {
  await db.settings.put({ key: 'club', value: s });
}

// ---------- Backup ----------

export interface Backup {
  app: 'ntu-cricket-scorer';
  version: 1;
  exportedAt: string;
  players: Player[];
  matches: Match[];
  settings?: ClubSettings;
}

export async function exportBackup(): Promise<Backup> {
  const [players, matches, settings] = await Promise.all([
    db.players.toArray(),
    db.matches.toArray(),
    db.settings.get('club'),
  ]);
  return {
    app: 'ntu-cricket-scorer',
    version: 1,
    exportedAt: new Date().toISOString(),
    players,
    matches,
    settings: settings?.value,
  };
}

/** Merges a backup into this device: newer `updatedAt` wins, nothing is deleted. */
export async function importBackup(data: Backup) {
  if (data?.app !== 'ntu-cricket-scorer') throw new Error('This file is not an NTU Cricket Scorer backup.');
  let players = 0;
  let matches = 0;
  await db.transaction('rw', db.players, db.matches, async () => {
    for (const p of data.players ?? []) {
      const cur = await db.players.get(p.id);
      if (!cur || (p.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
        await db.players.put(p);
        players++;
      }
    }
    for (const m of data.matches ?? []) {
      const cur = await db.matches.get(m.id);
      if (!cur || (m.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
        await db.matches.put(m);
        matches++;
      }
    }
  });
  return { players, matches };
}

// ---------- Hooks ----------

export function usePlayers(): Player[] {
  return useLiveQuery(() => db.players.orderBy('name').toArray(), [], []);
}

export function usePlayerNames() {
  const players = usePlayers();
  return useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p]));
    const nameOf = (id: ID | undefined | null) => (id ? map.get(id)?.name ?? 'Unknown' : '');
    return { players, map, nameOf };
  }, [players]);
}

export function useMatches(): Match[] | undefined {
  return useLiveQuery(() => db.matches.toArray().then((ms) => ms.sort(sortMatches)), []);
}

export function useMatch(id: ID | undefined): Match | null | undefined {
  return useLiveQuery(async () => (id ? (await db.matches.get(id)) ?? null : null), [id]);
}

export function useSettings(): ClubSettings {
  const row = useLiveQuery(() => db.settings.get('club'), []);
  return useMemo(
    () => ({
      ...DEFAULT_SETTINGS,
      ...row?.value,
      defaultRules: { ...DEFAULT_RULES, ...row?.value?.defaultRules },
    }),
    [row],
  );
}

export function sortMatches(a: Match, b: Match) {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
}
