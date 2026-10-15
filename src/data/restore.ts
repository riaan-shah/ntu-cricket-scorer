import type { Access, ClubSettings, ID, Match, Player } from '../types';

export type RestoreMode = 'merge' | 'exact';

export interface RestoreInput {
  players: Player[];
  matches: Match[];
  settings?: ClubSettings;
  access?: Access;
  /** Full copy of the club: only then may an exact restore delete things that aren't in it. */
  full?: boolean;
}

export interface RestorePlan {
  players: Player[];
  matches: Match[];
  deletePlayerIds: ID[];
  deleteMatchIds: ID[];
  /** Settings to write, or undefined to leave them. */
  settings?: ClubSettings;
  /** Access list to write, or undefined if unchanged. */
  access?: Access;
}

const norm = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];

/**
 * Works out what a restore will write, without touching any database.
 * MERGE: anything missing or newer (by updatedAt); never deletes; adds missing scorers/admins; settings only if none.
 * EXACT: overwrite everything in the backup (timestamps bumped so it wins on every phone); settings and access set
 * exactly (the person restoring stays an admin); a full backup also deletes players/matches not in it.
 */
export function planRestore(
  current: { players: Player[]; matches: Match[]; settings?: ClubSettings; access?: Access },
  data: RestoreInput,
  mode: RestoreMode,
  keepAdmin?: string,
  now = Date.now(),
): RestorePlan {
  let players = data.players;
  let matches = data.matches;
  let deletePlayerIds: ID[] = [];
  let deleteMatchIds: ID[] = [];
  if (mode === 'merge') {
    const pTime = new Map(current.players.map((p) => [p.id, p.updatedAt ?? 0]));
    const mTime = new Map(current.matches.map((m) => [m.id, m.updatedAt ?? 0]));
    players = players.filter((p) => !pTime.has(p.id) || (p.updatedAt ?? 0) > pTime.get(p.id)!);
    matches = matches.filter((m) => !mTime.has(m.id) || (m.updatedAt ?? 0) > mTime.get(m.id)!);
  } else {
    players = players.map((p) => ({ ...p, updatedAt: now }));
    matches = matches.map((m) => ({ ...m, updatedAt: now }));
    if (data.full) {
      const keepP = new Set(data.players.map((p) => p.id));
      const keepM = new Set(data.matches.map((m) => m.id));
      deletePlayerIds = current.players.filter((p) => !keepP.has(p.id)).map((p) => p.id);
      deleteMatchIds = current.matches.filter((m) => !keepM.has(m.id)).map((m) => m.id);
    }
  }

  const settings = data.settings && (mode === 'exact' || !current.settings) ? data.settings : undefined;

  let access: Access | undefined;
  if (data.access) {
    const next: Access =
      mode === 'exact'
        ? { admins: norm([...data.access.admins, ...(keepAdmin ? [keepAdmin] : [])]), scorers: norm(data.access.scorers) }
        : {
            admins: norm([...(current.access?.admins ?? []), ...data.access.admins]),
            scorers: norm([...(current.access?.scorers ?? []), ...data.access.scorers]),
          };
    next.scorers = next.scorers.filter((s) => !next.admins.includes(s));
    const same =
      current.access &&
      JSON.stringify([...current.access.admins].sort()) === JSON.stringify([...next.admins].sort()) &&
      JSON.stringify([...current.access.scorers].sort()) === JSON.stringify([...next.scorers].sort());
    if (!same) access = next;
  }
  return { players, matches, deletePlayerIds, deleteMatchIds, settings, access };
}
