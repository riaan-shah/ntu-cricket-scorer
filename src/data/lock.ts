import type { ScorerLock } from '../types';

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

export function lockHeldByOther(lock: ScorerLock | undefined, deviceId: string): lock is ScorerLock {
  return !!lock && lock.device !== deviceId;
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
