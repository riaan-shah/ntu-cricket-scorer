import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { ClubSettings, Match, Player } from '../types';
import type { Backend } from './backend';
import { firebaseConfig } from './firebaseConfig';

export const cloudEnabled = firebaseConfig !== null;

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
  bulkPut: async (players, matches, deletePlayerIds = []) => {
    // Firestore batches are limited to 500 writes.
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [
      ...players.map((p) => (b: ReturnType<typeof writeBatch>) => b.set(doc(firestore(), 'players', p.id), p)),
      ...matches.map((m) => (b: ReturnType<typeof writeBatch>) => b.set(doc(firestore(), 'matches', m.id), m)),
      ...deletePlayerIds.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(doc(firestore(), 'players', id))),
    ];
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(firestore());
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  },
};
