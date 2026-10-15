import type { Access, BackupStatus, ClubSettings, ID, Match, Player, Snapshot } from '../types';

export type Unsubscribe = () => void;

export interface MatchMeta {
  /** Local changes not yet confirmed by the server (cloud mode only). */
  pendingWrites: boolean;
  fromCache: boolean;
}

/** Storage backend: local (IndexedDB on this device) or cloud (Firestore, shared by the club). */
export interface Backend {
  kind: 'local' | 'cloud';
  subscribePlayers(cb: (players: Player[]) => void): Unsubscribe;
  subscribeMatches(cb: (matches: Match[]) => void): Unsubscribe;
  /** `undefined` = still loading, `null` = doesn't exist. */
  subscribeMatch(id: ID, cb: (match: Match | null | undefined, meta: MatchMeta | null) => void): Unsubscribe;
  subscribeSettings(cb: (settings: Partial<ClubSettings> | undefined) => void): Unsubscribe;

  /** Writes resolve once saved locally; cloud writes then sync in the background. */
  putPlayer(p: Player): Promise<void>;
  deletePlayer(id: ID): Promise<void>;
  putMatch(m: Match): Promise<void>;
  deleteMatch(id: ID): Promise<void>;
  putSettings(s: ClubSettings): Promise<void>;

  getAllPlayers(): Promise<Player[]>;
  getAllMatches(): Promise<Match[]>;
  getSettings(): Promise<ClubSettings | undefined>;
  /** Write/delete many docs in batches (import, restore, player merge). */
  bulkPut(players: Player[], matches: Match[], deletePlayerIds?: ID[], deleteMatchIds?: ID[]): Promise<void>;

  /** True while this device has changes the club database hasn't confirmed yet (cloud only). */
  subscribePending(cb: (pending: boolean) => void): Unsubscribe;
  subscribeBackupStatus(cb: (s: BackupStatus | undefined) => void): Unsubscribe;
  /** Scorer/admin list; undefined if this user can't read it. */
  getAccess(): Promise<Access | undefined>;
  putAccess(a: Access): Promise<void>;
  addSnapshot(s: Snapshot): Promise<void>;
  listSnapshots(limit: number): Promise<Snapshot[]>;
}
