import { useEffect, useMemo, useState } from 'react';
import type { Backend, MatchMeta } from './data/backend';
import { cloudBackend, cloudEnabled } from './data/cloud';
import { localBackend } from './data/local';
import { DEFAULT_RULES } from './engine/engine';
import type { ClubSettings, ID, Match, Player } from './types';

/** Cloud (shared club database) when Firebase is configured, otherwise this device only. */
export const backend: Backend = cloudEnabled ? cloudBackend : localBackend;

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
  await backend.putPlayer(p);
  return p;
}

export async function savePlayer(p: Player) {
  await backend.putPlayer({ ...p, updatedAt: Date.now() });
}

export async function playerMatchCount(id: ID): Promise<number> {
  const all = await backend.getAllMatches();
  return all.filter((m) => m.teams.some((t) => t.playerIds.includes(id))).length;
}

export async function deletePlayer(id: ID) {
  await backend.deletePlayer(id);
}

/** Rewrites every reference to `fromId` in a match as `intoId`. */
function remapPlayer(m: Match, fromId: ID, intoId: ID): Match {
  const swap = (id: ID) => (id === fromId ? intoId : id);
  const swapOpt = (id: ID | undefined) => (id === undefined ? id : swap(id));
  return {
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
}

/** Moves all of `fromId`'s matches and stats to `intoId`, then removes `fromId`. */
export async function mergePlayers(fromId: ID, intoId: ID) {
  const matches = await backend.getAllMatches();
  const changed = matches.filter((m) => JSON.stringify(m).includes(fromId)).map((m) => remapPlayer(m, fromId, intoId));
  await backend.bulkPut([], changed, [fromId]);
}

// ---------- Matches ----------

export async function saveMatch(m: Match) {
  await backend.putMatch({ ...m, updatedAt: Date.now() });
}

export async function deleteMatch(id: ID) {
  await backend.deleteMatch(id);
}

// ---------- Settings ----------

export async function saveSettings(s: ClubSettings) {
  await backend.putSettings(s);
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

async function exportFrom(source: Backend): Promise<Backup> {
  const [players, matches, settings] = await Promise.all([
    source.getAllPlayers(),
    source.getAllMatches(),
    source.getSettings(),
  ]);
  return { app: 'ntu-cricket-scorer', version: 1, exportedAt: new Date().toISOString(), players, matches, settings };
}

export const exportBackup = () => exportFrom(backend);

/** Merges a backup into the active store: newer `updatedAt` wins, nothing is deleted. */
export async function importBackup(data: Backup) {
  if (data?.app !== 'ntu-cricket-scorer') throw new Error('This file is not an NTU Cricket Scorer backup.');
  const [curPlayers, curMatches] = await Promise.all([backend.getAllPlayers(), backend.getAllMatches()]);
  const pTime = new Map(curPlayers.map((p) => [p.id, p.updatedAt ?? 0]));
  const mTime = new Map(curMatches.map((m) => [m.id, m.updatedAt ?? 0]));
  const players = (data.players ?? []).filter((p) => !pTime.has(p.id) || (p.updatedAt ?? 0) > pTime.get(p.id)!);
  const matches = (data.matches ?? []).filter((m) => !mTime.has(m.id) || (m.updatedAt ?? 0) > mTime.get(m.id)!);
  await backend.bulkPut(players, matches);
  return { players: players.length, matches: matches.length };
}

/** Cloud mode: copies whatever this device stored locally (before sync was turned on) into the club database. */
export async function uploadLocalData() {
  return importBackup(await exportFrom(localBackend));
}

// ---------- Hooks ----------

function useSubscription<T>(subscribe: (cb: (v: T) => void) => () => void, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => subscribe(setValue), deps);
  return value;
}

export function usePlayers(): Player[] {
  return useSubscription(backend.subscribePlayers, [], [] as Player[]);
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
  const all = useSubscription<Match[] | undefined>(backend.subscribeMatches, [], undefined);
  return useMemo(() => all && [...all].sort(sortMatches), [all]);
}

/** `undefined` while loading, `null` if the match doesn't exist. */
export function useMatch(id: ID | undefined): Match | null | undefined {
  return useMatchWithMeta(id).match;
}

export function useMatchWithMeta(id: ID | undefined): { match: Match | null | undefined; meta: MatchMeta | null } {
  const [state, setState] = useState<{ match: Match | null | undefined; meta: MatchMeta | null }>({
    match: undefined,
    meta: null,
  });
  useEffect(() => {
    if (!id) {
      setState({ match: null, meta: null });
      return;
    }
    return backend.subscribeMatch(id, (match, meta) => setState({ match, meta }));
  }, [id]);
  return state;
}

export function useSettings(): ClubSettings {
  const saved = useSubscription<Partial<ClubSettings> | undefined>(backend.subscribeSettings, [], undefined);
  return useMemo(
    () => ({
      ...DEFAULT_SETTINGS,
      ...saved,
      defaultRules: { ...DEFAULT_RULES, ...saved?.defaultRules },
    }),
    [saved],
  );
}

export function sortMatches(a: Match, b: Match) {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
}
