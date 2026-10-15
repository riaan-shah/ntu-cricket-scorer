import Dexie, { liveQuery, type Table } from 'dexie';
import type { Access, ClubSettings, Match, Player, Snapshot } from '../types';
import type { Backend } from './backend';

interface SettingRow {
  key: string;
  value: ClubSettings | Access;
}

class CricketDB extends Dexie {
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  settings!: Table<SettingRow, string>;
  snapshots!: Table<Snapshot, string>;

  constructor() {
    super('ntu-cricket-scorer');
    this.version(1).stores({
      players: 'id, name',
      matches: 'id, status, date',
      settings: 'key',
    });
    this.version(2).stores({ snapshots: 'id, createdAt' });
  }
}

/** This device's IndexedDB. Used directly in local mode, and as the source when uploading to the cloud. */
export const localDb = new CricketDB();

const live = <T>(query: () => Promise<T>, cb: (v: T) => void) => {
  const sub = liveQuery(query).subscribe({ next: cb, error: (e) => console.error(e) });
  return () => sub.unsubscribe();
};

export const localBackend: Backend = {
  kind: 'local',
  subscribePlayers: (cb) => live(() => localDb.players.orderBy('name').toArray(), cb),
  subscribeMatches: (cb) => live(() => localDb.matches.toArray(), cb),
  subscribeMatch: (id, cb) => live(() => localDb.matches.get(id), (m) => cb(m ?? null, null)),
  subscribeSettings: (cb) => live(() => localDb.settings.get('club'), (row) => cb(row?.value as ClubSettings | undefined)),

  putPlayer: async (p) => {
    await localDb.players.put(p);
  },
  deletePlayer: (id) => localDb.players.delete(id),
  putMatch: async (m) => {
    await localDb.matches.put(m);
  },
  deleteMatch: (id) => localDb.matches.delete(id),
  putSettings: async (s) => {
    await localDb.settings.put({ key: 'club', value: s });
  },

  getAllPlayers: () => localDb.players.toArray(),
  getAllMatches: () => localDb.matches.toArray(),
  getSettings: async () => (await localDb.settings.get('club'))?.value as ClubSettings | undefined,
  bulkPut: (players, matches, deletePlayerIds = [], deleteMatchIds = []) =>
    localDb.transaction('rw', localDb.players, localDb.matches, async () => {
      await localDb.players.bulkPut(players);
      await localDb.matches.bulkPut(matches);
      await localDb.players.bulkDelete(deletePlayerIds);
      await localDb.matches.bulkDelete(deleteMatchIds);
    }),
  // On-device storage is always "synced"; there's no off-site job in local mode.
  subscribePending: (cb) => {
    cb(false);
    return () => {};
  },
  subscribeBackupStatus: (cb) => {
    cb(undefined);
    return () => {};
  },
  getAccess: async () => (await localDb.settings.get('access'))?.value as Access | undefined,
  putAccess: async (a) => {
    await localDb.settings.put({ key: 'access', value: a });
  },
  addSnapshot: async (s) => {
    await localDb.snapshots.put(s);
  },
  listSnapshots: (limit) => localDb.snapshots.orderBy('createdAt').reverse().limit(limit).toArray(),
};

/** Does this device have any locally-stored club data (from before cloud sync was enabled)? */
export async function localDataCounts() {
  const [players, matches] = await Promise.all([localDb.players.count(), localDb.matches.count()]);
  return { players, matches };
}
