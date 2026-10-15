// Weekly off-site backup for NTU Cricket Scorer.
// Runs in the private backups repository (GitHub Actions), never in the app or website.
//
// 1. Exports the whole club database (players, matches incl. the bin, club settings, scorer/admin list) to
//    latest/backup.json in the app's own backup format, so an admin can load it in Settings → Backups & restore.
// 2. Commits it if anything changed (git history = every weekly version).
// 3. Only after the backup is safely pushed: empties bin items older than 30 days and snapshots older than a year.
// 4. Writes config/backupStatus so admins see "Last off-site backup: Saturday ✓" (or a warning) in the app.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DAY = 86_400_000;
const BIN_DAYS = 30;
const SNAPSHOT_KEEP_DAYS = 365;
const OUT = path.join('latest', 'backup.json');

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();

const byId = (a, b) => String(a.id).localeCompare(String(b.id));
const all = async (col) => (await db.collection(col).get()).docs.map((d) => d.data());
const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

async function setStatus(status) {
  await db.doc('config/backupStatus').set({ lastRunAt: Date.now(), ...status });
}

async function main() {
  // ---- 1. Export ----
  const [players, matches] = await Promise.all([all('players'), all('matches')]);
  const settings = (await db.doc('config/club').get()).data();
  const access = (await db.doc('config/access').get()).data();
  const data = {
    app: 'ntu-cricket-scorer',
    version: 1,
    players: players.sort(byId),
    matches: matches.sort(byId),
    ...(settings ? { settings } : {}),
    ...(access ? { access } : {}),
    full: true,
  };
  const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const unchanged = previous && JSON.stringify({ ...previous, exportedAt: undefined }, null, 1) === JSON.stringify({ ...data, exportedAt: undefined }, null, 1);

  // ---- 2. Commit ----
  let commit = previous ? sh('git rev-parse --short HEAD') : '';
  const binned = matches.filter((m) => m.deletedAt).length;
  const counts = { players: players.length, matches: matches.length, binned, purged: 0 };
  if (unchanged) {
    console.log('No changes since the last backup — nothing to commit.');
  } else {
    fs.mkdirSync('latest', { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 1) + '\n');
    const date = new Date().toISOString().slice(0, 10);
    sh('git config user.name "ntu-cricket-backup"');
    sh('git config user.email "backup@users.noreply.github.com"');
    sh(`git add ${OUT}`);
    sh(`git commit -m "Backup ${date}: ${players.length} players, ${matches.length} matches (${binned} in bin)"`);
    sh('git push');
    commit = sh('git rev-parse --short HEAD');
    console.log(`Committed ${commit}.`);
  }

  // ---- 3. Purge (only after the backup above is safely stored) ----
  const now = Date.now();
  const expired = (t) => typeof t === 'number' && now - t > BIN_DAYS * DAY;
  const inAnyMatch = new Set(matches.flatMap((m) => (m.teams ?? []).flatMap((t) => t.playerIds ?? [])));
  const batch = db.batch();
  let purged = 0;
  for (const m of matches) {
    if (expired(m.deletedAt)) {
      batch.delete(db.doc(`matches/${m.id}`));
      purged++;
    }
  }
  for (const p of players) {
    if (expired(p.deletedAt) && !inAnyMatch.has(p.id)) {
      batch.delete(db.doc(`players/${p.id}`));
      purged++;
    }
  }
  const oldSnaps = await db.collection('snapshots').where('createdAt', '<', now - SNAPSHOT_KEEP_DAYS * DAY).get();
  oldSnaps.docs.forEach((d) => batch.delete(d.ref));
  if (purged || oldSnaps.size) await batch.commit();
  counts.purged = purged;
  console.log(`Emptied ${purged} expired bin item(s) and ${oldSnaps.size} old snapshot(s).`);

  // ---- 4. Report ----
  await setStatus({ ok: true, counts, commit, message: unchanged ? 'No changes this week' : `Saved ${commit}` });
}

// The Firestore client keeps a network connection open after the work is done, which would leave the job running
// until it times out. Close it and exit explicitly.
main()
  .then(async () => {
    await db.terminate();
    console.log('Backup finished.');
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    try {
      await setStatus({ ok: false, message: String(e?.message ?? e).slice(0, 300) });
    } catch {
      // Can't reach the database either; the workflow failure email is the alert.
    }
    process.exit(1);
  });
