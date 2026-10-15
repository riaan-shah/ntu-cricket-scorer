import { useEffect, useMemo, useState } from 'react';
import type { Backend, MatchMeta } from './data/backend';
import { cloudBackend, cloudEnabled } from './data/cloud';
import { localBackend } from './data/local';
import { planRestore, type RestoreMode } from './data/restore';
import { DEFAULT_RULES } from './engine/engine';
import { clubPar } from './engine/impact';
import type { Access, BackupStatus, ClubSettings, ID, Match, Player, Snapshot, SnapshotReason } from './types';

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

/** IDs of everyone who appears in any match (live, completed or abandoned). */
export function playersWithHistory(matches: Match[]): Set<ID> {
  const ids = new Set<ID>();
  for (const m of matches) for (const t of m.teams) for (const id of t.playerIds) ids.add(id);
  return ids;
}

/**
 * Removes players from the club. Players with match history are archived (hidden from the roster and leaderboards,
 * kept so old scorecards show their name). Players who never played go to the bin for 30 days.
 */
export async function removePlayers(ids: ID[]) {
  const [players, matches] = await Promise.all([backend.getAllPlayers(), backend.getAllMatches()]);
  void takeSnapshot('remove-players', undefined, { players });
  const history = playersWithHistory(matches);
  const now = Date.now();
  const chosen = players.filter((p) => ids.includes(p.id));
  const archive = chosen.filter((p) => history.has(p.id)).map((p) => ({ ...p, archived: true, updatedAt: now }));
  const binned = chosen
    .filter((p) => !history.has(p.id))
    .map((p) => ({ ...p, archived: true, deletedAt: now, updatedAt: now }));
  await backend.bulkPut([...archive, ...binned], []);
  return { archived: archive.length, binned: binned.length };
}

export async function restorePlayer(p: Player) {
  await backend.putPlayer({ ...p, archived: false, deletedAt: undefined, updatedAt: Date.now() });
}

/** Permanently removes binned players (never played, including in binned matches) after 30 days. */
export async function purgeExpiredPlayers(players: Player[]) {
  const history = playersWithHistory(await backend.getAllMatches());
  const expired = players.filter((p) => p.deletedAt && daysLeft(p.deletedAt) === 0 && !history.has(p.id));
  if (expired.length) await backend.bulkPut([], [], expired.map((p) => p.id));
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
  void takeSnapshot('merge-players');
  const changed = matches.filter((m) => JSON.stringify(m).includes(fromId)).map((m) => remapPlayer(m, fromId, intoId));
  await backend.bulkPut([], changed, [fromId]);
}

// ---------- Matches ----------

export async function saveMatch(m: Match) {
  await backend.putMatch({ ...m, updatedAt: Date.now() });
}

/** Days a deleted match stays in the bin before it's removed for good. */
export const BIN_DAYS = 30;

/** "Delete": moves the match to the bin, where it can be restored for 30 days. */
export async function binMatch(m: Match) {
  void takeSnapshot('bin', m);
  // Keep the scorer stamp (released): the database only lets the lock holder or an admin write a live match.
  await backend.putMatch({
    ...m,
    deletedAt: Date.now(),
    scorer: m.scorer ? { ...m.scorer, released: true } : undefined,
    updatedAt: Date.now(),
  });
}

export async function restoreMatch(m: Match) {
  await backend.putMatch({ ...m, deletedAt: undefined, updatedAt: Date.now() });
}

export async function deleteMatchForever(id: ID) {
  await backend.deleteMatch(id);
}

function daysLeft(deletedAt: number): number {
  return Math.max(0, Math.ceil(BIN_DAYS - (Date.now() - deletedAt) / 86_400_000));
}

export function binDaysLeft(m: { deletedAt?: number }): number {
  return daysLeft(m.deletedAt ?? 0);
}

/** Permanently removes matches that have been in the bin for more than 30 days. */
export async function purgeExpiredBin(binned: Match[]) {
  for (const m of binned) if (binDaysLeft(m) === 0) await deleteMatchForever(m.id);
}

// ---------- Settings ----------

export async function saveSettings(s: ClubSettings) {
  await backend.putSettings(s);
}

// ---------- Snapshots (automatic, in-app) ----------

let actor: string | undefined;
/** Who is making changes (for snapshot labels). Set by the auth layer. */
export function setActor(email: string | undefined) {
  actor = email;
}

const matchLabel = (m: Match) => `${m.teams[0].name} v ${m.teams[1].name} · ${m.date}`;

/**
 * Saves an immutable copy (admins can read; nobody can change or delete it): the match, all players, club settings
 * and the scorer/admin list. Fire-and-forget: offline it queues and uploads with everything else.
 */
export async function takeSnapshot(
  reason: SnapshotReason,
  match?: Match,
  extra: { players?: Player[]; lostBalls?: number; note?: string } = {},
) {
  try {
    const [players, settings, access] = await Promise.all([
      extra.players ? Promise.resolve(extra.players) : backend.getAllPlayers(),
      backend.getSettings(),
      backend.getAccess(),
    ]);
    const snap: Snapshot = {
      id: uid(),
      createdAt: Date.now(),
      reason,
      by: actor,
      matchId: match?.id,
      label: match ? matchLabel(match) : 'Club roster',
      match,
      players,
      settings,
      access,
      lostBalls: extra.lostBalls,
      note: extra.note,
    };
    await backend.addSnapshot(snap);
  } catch (e) {
    console.error('Snapshot failed', e);
  }
}

export const listSnapshots = (n = 100) => backend.listSnapshots(n);

// ---------- Backup & restore ----------

export interface Backup {
  app: 'ntu-cricket-scorer';
  version: 1;
  exportedAt: string;
  players: Player[];
  matches: Match[];
  settings?: ClubSettings;
  access?: Access;
  /** A full copy of the club (all matches incl. bin, all players). Only full backups can delete on exact restore. */
  full?: boolean;
}

async function exportFrom(source: Backend): Promise<Backup> {
  const [players, matches, settings, access] = await Promise.all([
    source.getAllPlayers(),
    source.getAllMatches(),
    source.getSettings(),
    source.getAccess(),
  ]);
  return { app: 'ntu-cricket-scorer', version: 1, exportedAt: new Date().toISOString(), players, matches, settings, access, full: true };
}

export const exportBackup = () => exportFrom(backend);

export function snapshotToBackup(s: Snapshot): Backup {
  return {
    app: 'ntu-cricket-scorer',
    version: 1,
    exportedAt: new Date(s.createdAt).toISOString(),
    players: s.players ?? [],
    matches: s.match ? [s.match] : [],
    settings: s.settings,
    access: s.access,
    full: false,
  };
}

export function validateBackup(data: unknown): Backup {
  const d = data as Backup;
  if (d?.app !== 'ntu-cricket-scorer' || !Array.isArray(d.players) || !Array.isArray(d.matches)) {
    throw new Error('This file is not an NTU Cricket Scorer backup.');
  }
  return d;
}

export type { RestoreMode };

export interface RestoreResult {
  players: number;
  matches: number;
  deletedPlayers: number;
  deletedMatches: number;
  settings: boolean;
  access: boolean;
}

/** Applies a backup to the club database (see planRestore for exactly what MERGE and EXACT do). */
export async function restoreBackup(data: Backup, mode: RestoreMode, keepAdmin?: string): Promise<RestoreResult> {
  validateBackup(data);
  const [players, matches, settings, access] = await Promise.all([
    backend.getAllPlayers(),
    backend.getAllMatches(),
    backend.getSettings(),
    backend.getAccess(),
  ]);
  const plan = planRestore({ players, matches, settings, access }, data, mode, keepAdmin);
  await backend.bulkPut(plan.players, plan.matches, plan.deletePlayerIds, plan.deleteMatchIds);
  if (plan.settings) await backend.putSettings(plan.settings);
  if (plan.access) await backend.putAccess(plan.access);
  return {
    players: plan.players.length,
    matches: plan.matches.length,
    deletedPlayers: plan.deletePlayerIds.length,
    deletedMatches: plan.deleteMatchIds.length,
    settings: !!plan.settings,
    access: !!plan.access,
  };
}
/** Old name kept for callers: a merge. */
export async function importBackup(data: Backup) {
  return restoreBackup(validateBackup(data), 'merge');
}

/** Cloud mode: copies whatever this device stored locally (before sync was turned on) into the club database. */
export async function uploadLocalData() {
  const local = await exportFrom(localBackend);
  // Never push this device's old access list or settings over the club's.
  return restoreBackup({ ...local, access: undefined, settings: undefined, full: false }, 'merge');
}

/** This device has changes the club database hasn't confirmed yet (cloud). */
export function usePendingUploads(): boolean {
  return useSubscription(backend.subscribePending, [], false);
}

export function useBackupStatus(): BackupStatus | undefined {
  return useSubscription<BackupStatus | undefined>(backend.subscribeBackupStatus, [], undefined);
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

/** Active club members (excludes removed/archived players). */
export function useRoster(): Player[] {
  const players = usePlayers();
  return useMemo(() => players.filter((p) => !p.archived), [players]);
}

export function usePlayerNames() {
  const players = usePlayers();
  return useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p]));
    const nameOf = (id: ID | undefined | null) => (id ? map.get(id)?.name ?? 'Unknown' : '');
    return { players, map, nameOf };
  }, [players]);
}

function useAllMatches(): Match[] | undefined {
  return useSubscription<Match[] | undefined>(backend.subscribeMatches, [], undefined);
}

/** All matches except those in the bin, newest first. */
export function useMatches(): Match[] | undefined {
  const all = useAllMatches();
  return useMemo(() => all && all.filter((m) => !m.deletedAt).sort(sortMatches), [all]);
}

/** Matches in the bin, most recently deleted first. */
export function useBin(): Match[] {
  const all = useAllMatches();
  return useMemo(
    () => (all ?? []).filter((m) => m.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [all],
  );
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

/** The club's historical batting-first scoring rate going into match (undefined until there's enough history). */
export function useClubPar(match: Match | null | undefined): number | undefined {
  const matches = useMatches();
  // Only the identity/date/venue matter, not every ball of the live match.
  const id = match?.id;
  const date = match?.date;
  const venue = match?.venue;
  const createdAt = match?.createdAt;
  return useMemo(() => {
    if (!matches || !id || !date || createdAt === undefined) return undefined;
    return clubPar(matches, { id, date, venue, createdAt } as Match);
  }, [matches, id, date, venue, createdAt]);
}

export function sortMatches(a: Match, b: Match) {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
}
