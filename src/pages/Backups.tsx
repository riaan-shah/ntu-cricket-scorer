import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminHealth } from '../components/AdminHealth';
import { AppBar, askConfirm, Empty, Sheet, toast } from '../components/ui';
import { useAuth } from '../data/auth';
import { timeAgo } from '../data/lock';
import {
  exportBackup,
  listSnapshots,
  restoreBackup,
  snapshotToBackup,
  takeSnapshot,
  useBin,
  usePlayers,
  validateBackup,
  type Backup,
  type RestoreMode,
  type RestoreResult,
} from '../db';
import { computeMatch, oversText } from '../engine/engine';
import { downloadText } from '../export';
import type { Snapshot, SnapshotReason } from '../types';

const REASONS: Record<SnapshotReason, string> = {
  finish: 'Match finished',
  bin: 'Match moved to bin',
  reopen: 'Match reopened',
  edit: 'Ball edited after finish',
  'merge-players': 'Players merged',
  'remove-players': 'Players removed',
  'takeover-lost': '⚠️ Balls not uploaded before a take-over',
  'before-restore': 'Before a restore',
};

const fmt = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function backupSummary(b: Backup) {
  const binned = b.matches.filter((m) => m.deletedAt).length;
  return [
    `${b.players.length} players`,
    `${b.matches.length} match${b.matches.length === 1 ? '' : 'es'}${binned ? ` (${binned} in bin)` : ''}`,
    b.access ? `${b.access.admins.length} admin${b.access.admins.length === 1 ? '' : 's'}, ${b.access.scorers.length} scorers` : 'no scorer list',
    b.settings ? 'club settings' : 'no settings',
  ].join(' · ');
}

function resultText(r: RestoreResult) {
  const parts = [`${r.players} players`, `${r.matches} matches`];
  if (r.deletedPlayers || r.deletedMatches) parts.push(`removed ${r.deletedPlayers} players / ${r.deletedMatches} matches`);
  if (r.settings) parts.push('settings');
  if (r.access) parts.push('scorer list');
  return `Restored: ${parts.join(', ')}`;
}

export default function Backups() {
  const auth = useAuth();
  const { issues, statusLine } = useAdminHealth();
  const bin = useBin();
  const players = usePlayers();
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [loaded, setLoaded] = useState<{ name: string; data: Backup } | null>(null);
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listSnapshots(100).then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => {
    if (auth.isAdmin) void refresh();
  }, [auth.isAdmin]);

  if (!auth.ready) return null;
  if (!auth.isAdmin) {
    return (
      <div>
        <AppBar title="Backups & restore" back="/settings" />
        <div className="page">
          <Empty>Only club admins can see backups and restore data.</Empty>
        </div>
      </div>
    );
  }

  const downloadNow = async (label = 'backup') => {
    const data = await exportBackup();
    downloadText(JSON.stringify(data), `ntu-cricket-${label}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, 'application/json');
    return data;
  };

  const runRestore = async (data: Backup, mode: RestoreMode, what: string) => {
    if (mode === 'exact') {
      const ok = await askConfirm({
        title: 'Restore exactly?',
        message: (
          <>
            The club database will be made to match <b>{what}</b>
            {data.full ? (
              <>
                {' '}
                — <b>players and matches that aren't in it will be deleted</b>, and club settings and the scorer/admin list
                will be replaced.
              </>
            ) : (
              <> — everything in it overwrites the current versions, including settings and the scorer/admin list.</>
            )}{' '}
            A safety copy of the current data downloads first. Everyone's phones update automatically.
          </>
        ),
        confirmLabel: 'Restore exactly',
        danger: true,
      });
      if (!ok) return;
    } else {
      const ok = await askConfirm({
        title: 'Merge this backup?',
        message: 'Anything missing or newer in the backup is brought back. Nothing is deleted. Missing scorers/admins are added back.',
        confirmLabel: 'Merge',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (mode === 'exact') {
        await downloadNow('before-restore');
        void takeSnapshot('before-restore', undefined, { note: `Before restoring ${what}` });
      }
      const res = await restoreBackup(data, mode, auth.user?.email);
      toast(resultText(res));
      void refresh();
    } catch (e) {
      toast(`Restore failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const binnedPlayers = players.filter((p) => p.deletedAt).length;

  return (
    <div>
      <AppBar title="Backups & restore" back="/settings" />
      <div className="page">
        <div className="card">
          <div className="card-head">
            <h2>Off-site backup (weekly)</h2>
          </div>
          <div className="card-pad stack">
            <div className="small">{statusLine ?? 'Not set up yet.'}</div>
            {issues.map((i) => (
              <div key={i.text} className={i.level === 'warn' ? 'upload-off' : 'small muted'}>
                {i.level === 'warn' ? '⚠️ ' : ''}
                {i.text}
              </div>
            ))}
            <div className="tiny muted">
              Every Saturday at 11pm (Singapore) the whole club database — players, matches including the bin, club settings
              and the scorer/admin list — is copied to a private GitHub repository, with full history. Download one of those
              files and load it below to restore.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Backup files</h2>
          </div>
          <div className="card-pad stack">
            <div className="grid-2">
              <button className="btn" disabled={busy} onClick={() => downloadNow().then(() => toast('Full backup downloaded'))}>
                ⬇ Download full backup
              </button>
              <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                ⬆ Load a backup file
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  setLoaded({ name: f.name, data: validateBackup(JSON.parse(await f.text())) });
                } catch (err) {
                  toast((err as Error).message);
                }
              }}
            />
            {loaded && (
              <div className="card card-pad stack" style={{ borderColor: 'var(--brand-2)' }}>
                <div className="bold">{loaded.name}</div>
                <div className="small muted">
                  {loaded.data.exportedAt ? `Made ${fmt(Date.parse(loaded.data.exportedAt))}` : ''} · {backupSummary(loaded.data)}
                  {loaded.data.full ? ' · full backup' : ''}
                </div>
                <div className="grid-2">
                  <button className="btn" disabled={busy} onClick={() => runRestore(loaded.data, 'merge', loaded.name)}>
                    Merge
                  </button>
                  <button className="btn danger" disabled={busy} onClick={() => runRestore(loaded.data, 'exact', loaded.name)}>
                    Restore exactly
                  </button>
                </div>
                <div className="tiny muted">
                  <b>Merge</b>: bring back anything missing or newer, delete nothing. <b>Restore exactly</b>: roll the club
                  back to this file.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Automatic snapshots</h2>
            <span className="tiny muted">read-only copies, newest first</span>
          </div>
          {snaps === null && <div className="empty small">Loading…</div>}
          {snaps?.length === 0 && (
            <div className="empty small">None yet. A snapshot is saved every time a match is finished, binned, reopened or edited.</div>
          )}
          {snaps?.map((s) => (
            <button key={s.id} className="list-item" onClick={() => setPreview(s)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="bold" style={s.reason === 'takeover-lost' ? { color: 'var(--accent)' } : undefined}>
                  {REASONS[s.reason] ?? s.reason}
                  {s.lostBalls ? ` · ${s.lostBalls} ball${s.lostBalls === 1 ? '' : 's'}` : ''}
                </div>
                <div className="tiny muted">
                  {s.label} · {fmt(s.createdAt)}
                  {s.by ? ` · ${s.by}` : ''}
                </div>
              </div>
              <span className="tiny muted">{timeAgo(s.createdAt)}</span>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Bin</h2>
          </div>
          <Link to="/matches" className="list-item">
            <div style={{ flex: 1 }}>Matches in the bin</div>
            <span className="badge">{bin.length}</span>
          </Link>
          <Link to="/players" className="list-item">
            <div style={{ flex: 1 }}>Players in the bin</div>
            <span className="badge">{binnedPlayers}</span>
          </Link>
          <div className="tiny muted card-pad">Restorable for 30 days. The weekly backup runs before anything is emptied.</div>
        </div>
      </div>

      {preview && (
        <Sheet open title={REASONS[preview.reason] ?? 'Snapshot'} onClose={() => setPreview(null)}>
          <div className="small muted">
            {fmt(preview.createdAt)}
            {preview.by ? ` · by ${preview.by}` : ''}
          </div>
          {preview.note && <div className="small">{preview.note}</div>}
          {preview.match && <MatchLine snap={preview} />}
          <div className="small">{backupSummary(snapshotToBackup(preview))}</div>
          {preview.reason === 'takeover-lost' && (
            <div className="upload-off small">
              These are the balls one phone recorded but couldn't upload before someone else took over. Compare with the
              live match before restoring — <b>Overwrite</b> replaces the club's version of this match with this copy.
            </div>
          )}
          <div className="grid-2">
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                await runRestore(snapshotToBackup(preview), 'merge', 'this snapshot');
                setPreview(null);
              }}
            >
              Merge back
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                await runRestore(snapshotToBackup(preview), 'exact', 'this snapshot');
                setPreview(null);
              }}
            >
              Overwrite with this
            </button>
          </div>
          <button
            className="btn ghost block"
            onClick={() =>
              downloadText(JSON.stringify(snapshotToBackup(preview)), `ntu-cricket-snapshot-${preview.id}.json`, 'application/json')
            }
          >
            ⬇ Download this snapshot
          </button>
        </Sheet>
      )}
    </div>
  );
}

function MatchLine({ snap }: { snap: Snapshot }) {
  const m = snap.match!;
  const st = computeMatch(m);
  const bpo = m.rules.ballsPerOver;
  return (
    <div className="card card-pad small">
      <div className="bold">{snap.label}</div>
      {st.innings.map((inn) => (
        <div key={inn.index}>
          {m.teams[inn.battingTeam].name} {inn.runs}/{inn.wickets} ({oversText(inn.legalBalls, bpo)} ov)
        </div>
      ))}
      <div className="muted">{(m.result ?? st.result)?.text ?? (m.status === 'live' ? 'In progress' : '')}</div>
    </div>
  );
}
