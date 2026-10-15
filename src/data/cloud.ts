import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { Access, BackupStatus, ClubSettings, Match, Player, Snapshot } from '../types';
import type { Backend } from './backend';
import { firebaseConfig } from './firebaseConfig';

/** 
pm run dev:offline forces on-device storage (for testing without touching the club database). */
export const cloudEnabled = firebaseConfig !== null && import.meta.env.VITE_LOCAL_ONLY !== '1';

let app: FirebaseApp | null = null;
let fs: Firestore | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig!);
  return app;
}

export function firestore(): Firestore {
  if (!fs) {
    fs = initializeFirestore(firebaseApp(), {
      // Offline-first: reads come from the on-device cache, writes apply instantly and sync when there's signal.
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  }
  return fs;
}

let reportError: (e: unknown) => void = (e) => console.error(e);
/** Called when a background write is rejected (e.g. not an approved scorer). */
export function onCloudWriteError(fn: (e: unknown) => void) {
  reportError = fn;
}

/**
 * Fire-and-forget write: Firestore applies it to the local cache immediately, but the promise only resolves once
 * the server confirms — which never happens while offline at the cage. So we don't make the UI wait for it.
 */
const background = (p: Promise<unknown>) => {
  p.catch((e) => reportError(e));
  return Promise.resolve();
};

const byName = (a: Player, b: Player) => a.name.localeCompare(b.name);

export const cloudBackend: Backend = {
  kind: 'cloud',
  subscribePlayers: (cb) =>
    onSnapshot(
      collection(firestore(), 'players'),
      (snap) => cb(snap.docs.map((d) => d.data() as Player).sort(byName)),
      (e) => console.error(e),
    ),
  subscribeMatches: (cb) =>
    onSnapshot(
      collection(firestore(), 'matches'),
      (snap) => cb(snap.docs.map((d) => d.data() as Match)),
      (e) => console.error(e),
    ),
  subscribeMatch: (id, cb) =>
    onSnapshot(
      doc(firestore(), 'matches', id),
      { includeMetadataChanges: true },
      (snap) => {
        const meta = { pendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache };
        // Not in the offline cache yet and no server answer: still loading rather than "not found".
        if (!snap.exists()) cb(snap.metadata.fromCache ? undefined : null, meta);
        else cb(snap.data() as Match, meta);
      },
      (e) => {
        console.error(e);
        cb(null, null);
      },
    ),
  subscribeSettings: (cb) =>
    onSnapshot(
      doc(firestore(), 'config', 'club'),
      (snap) => cb(snap.exists() ? (snap.data() as ClubSettings) : undefined),
      (e) => console.error(e),
    ),

  putPlayer: (p) => background(setDoc(doc(firestore(), 'players', p.id), p)),
  deletePlayer: (id) => background(deleteDoc(doc(firestore(), 'players', id))),
  putMatch: (m) => background(setDoc(doc(firestore(), 'matches', m.id), m)),
  deleteMatch: (id) => background(deleteDoc(doc(firestore(), 'matches', id))),
  putSettings: (s) => background(setDoc(doc(firestore(), 'config', 'club'), s)),

  getAllPlayers: async () => (await getDocs(collection(firestore(), 'players'))).docs.map((d) => d.data() as Player),
  getAllMatches: async () => (await getDocs(collection(firestore(), 'matches'))).docs.map((d) => d.data() as Match),
  getSettings: async () => {
    const snap = await getDoc(doc(firestore(), 'config', 'club'));
    return snap.exists() ? (snap.data() as ClubSettings) : undefined;
  },
  bulkPut: async (players, matches, deletePlayerIds = [], deleteMatchIds = []) => {
    // Firestore batches are limited to 500 writes.
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [
      ...players.map((p) => (b: ReturnType<typeof writeBatch>) => b.set(doc(firestore(), 'players', p.id), p)),
      ...matches.map((m) => (b: ReturnType<typeof writeBatch>) => b.set(doc(firestore(), 'matches', m.id), m)),
      ...deletePlayerIds.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(doc(firestore(), 'players', id))),
      ...deleteMatchIds.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(doc(firestore(), 'matches', id))),
    ];
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(firestore());
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  },

  subscribePending: (cb) => {
    // A collection snapshot's hasPendingWrites is true while any of its docs has unconfirmed local changes.
    let m = false;
    let p = false;
    const emit = () => cb(m || p);
    const u1 = onSnapshot(collection(firestore(), 'matches'), { includeMetadataChanges: true }, (s) => {
      m = s.metadata.hasPendingWrites;
      emit();
    });
    const u2 = onSnapshot(collection(firestore(), 'players'), { includeMetadataChanges: true }, (s) => {
      p = s.metadata.hasPendingWrites;
      emit();
    });
    return () => {
      u1();
      u2();
    };
  },
  subscribeBackupStatus: (cb) =>
    onSnapshot(
      doc(firestore(), 'config', 'backupStatus'),
      (snap) => cb(snap.exists() ? (snap.data() as BackupStatus) : undefined),
      () => cb(undefined),
    ),
  getAccess: async () => {
    try {
      const snap = await getDoc(doc(firestore(), 'config', 'access'));
      return snap.exists() ? (snap.data() as Access) : undefined;
    } catch {
      return undefined;
    }
  },
  putAccess: async (a) => {
    await setDoc(doc(firestore(), 'config', 'access'), a);
  },
  // Snapshots are a safety net: a failure (e.g. rules not yet published) is logged, never shown as a scoring error.
  addSnapshot: (s) => {
    setDoc(doc(firestore(), 'snapshots', s.id), s).catch((e) => console.warn('Snapshot not saved', e));
    return Promise.resolve();
  },
  listSnapshots: async (n) =>
    (await getDocs(query(collection(firestore(), 'snapshots'), orderBy('createdAt', 'desc'), limit(n)))).docs.map(
      (d) => d.data() as Snapshot,
    ),
};
