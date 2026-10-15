import type { Match, ScorerLock } from '../types';

const KEY = 'ntu-cricket-device-id';
let sessionFallback: string | null = null;

/** Stable id for this browser/phone, so the same scorer on two devices still gets a lock per device. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    sessionFallback ??= Math.random().toString(36).slice(2);
    return sessionFallback;
  }
}

/** A live lock held by a different device (a released lock doesn't count). */
export function lockHeldByOther(lock: ScorerLock | undefined, deviceId: string): lock is ScorerLock {
  return !!lock && !lock.released && lock.device !== deviceId;
}

/** JSON with sorted keys and no undefined values: the database may return fields in a different order. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Balls this device recorded that the club's copy doesn't have: compares each innings' events up to the first
 * difference and counts the balls after it. Used when another scorer took over while this phone was offline.
 */
export function unsyncedBalls(mine: Match, theirs: Match): number {
  let lost = 0;
  mine.innings.forEach((inn, i) => {
    const other = theirs.innings[i]?.events ?? [];
    let k = 0;
    while (k < inn.events.length && k < other.length && stable(inn.events[k]) === stable(other[k])) k++;
    lost += inn.events.slice(k).filter((e) => e.kind === 'ball').length;
  });
  return lost;
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
