# NTU Cricket Club — off-site backups

Private repository. Every **Saturday at 11pm Singapore time** a GitHub Action copies the whole club database
(players, matches including the bin, club settings, scorer/admin list) to [`latest/backup.json`](latest/backup.json).
Every week's version is kept in this file's **history** (open the file → *History*).

## Restoring
1. Open `latest/backup.json` (or an older version from its History) → *Download raw file*.
2. In the app: **Settings → Backups & restore → Load a backup file**.
3. Choose **Merge** (bring back anything missing, delete nothing) or **Restore exactly** (roll the whole club back to
   this file — a safety copy of the current data downloads first).

## How it works
- `backup.mjs` uses a Firebase **service account** stored as the repository secret `FIREBASE_SERVICE_ACCOUNT`. The key
  only ever lives here as a secret; it is never in the app or the website.
- It only commits when something changed.
- After the backup is pushed, it empties bin items older than 30 days and in-app snapshots older than a year.
- It writes `config/backupStatus` in the club database, so admins see the last run in the app and get a warning if it
  failed or is more than 8 days old. GitHub also emails the repository owner if a run fails.
- Run it by hand any time: **Actions → Weekly off-site backup → Run workflow**.
