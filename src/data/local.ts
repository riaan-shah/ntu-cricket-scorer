import Dexie, { liveQuery, type Table } from 'dexie';
import type { ClubSettings, Match, Player } from '../types';
import type { Backend } from './backend';

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
  subscribeSettings: (cb) => live(() => localDb.settings.get('club'), (row) => cb(row?.value)),

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
  getSettings: async () => (await localDb.settings.get('club'))?.value,
  bulkPut: (players, matches, deletePlayerIds = []) =>
    localDb.transaction('rw', localDb.players, localDb.matches, async () => {
      await localDb.players.bulkPut(players);
      await localDb.matches.bulkPut(matches);
      await localDb.players.bulkDelete(deletePlayerIds);
    }),
};

/** Does this device have any locally-stored club data (from before cloud sync was enabled)? */
export async function localDataCounts() {
  const [players, matches] = await Promise.all([localDb.players.count(), localDb.matches.count()]);
  return { players, matches };
}
