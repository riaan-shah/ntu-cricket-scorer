import { useEffect, useRef, useState } from 'react';
import { RulesEditor } from '../components/RulesEditor';
import { AppBar, Seg, ToggleRow, toast } from '../components/ui';
import { useSunMode } from '../sunMode';
import { normalizeEmail, useAuth, type Access } from '../data/auth';
import { localDataCounts } from '../data/local';
import { exportBackup, importBackup, saveSettings, uploadLocalData, useMatches, usePlayers, useSettings } from '../db';
import { downloadText } from '../export';
import type { ClubSettings } from '../types';

export default function Settings() {
  const saved = useSettings();
  const auth = useAuth();
  const players = usePlayers();
  const matches = useMatches() ?? [];
  const [draft, setDraft] = useState<ClubSettings>(saved);
  const fileRef = useRef<HTMLInputElement>(null);
  const cloud = auth.mode === 'cloud';
  const [sun, setSun] = useSunMode();

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const backup = async () => {
    const data = await exportBackup();
    downloadText(JSON.stringify(data), `ntu-cricket-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    toast('Backup downloaded');
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      toast('Importing…');
      const res = await importBackup(data);
      toast(`Imported ${res.players} player(s) and ${res.matches} match(es)`);
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <AppBar title="Settings" back="/" />
      <div className="page">
        {cloud && <AccountCard />}
        {cloud && auth.isAdmin && auth.access && <AccessCard access={auth.access} />}

        <div className="card card-pad stack">
          {cloud && !auth.isAdmin && <div className="small muted">Only club admins can change these settings.</div>}
          <fieldset disabled={!auth.isAdmin} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            <label className="field">
              <span>Club name</span>
              <input className="input" value={draft.clubName} onChange={(e) => setDraft({ ...draft, clubName: e.target.value })} />
            </label>
            <label className="field">
              <span>Default venue</span>
              <input
                className="input"
                value={draft.defaultVenue}
                onChange={(e) => setDraft({ ...draft, defaultVenue: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Footer on shared match images</span>
              <input
                className="input"
                value={draft.exportTagline}
                onChange={(e) => setDraft({ ...draft, exportTagline: e.target.value })}
              />
            </label>
          </fieldset>
        </div>

        {auth.isAdmin && (
          <>
            <div className="section-title">Default rules for new matches</div>
            <RulesEditor rules={draft.defaultRules} onChange={(r) => setDraft({ ...draft, defaultRules: r })} />
            <button
              className="btn primary big block"
              onClick={async () => {
                await saveSettings(draft);
                toast('Settings saved');
              }}
            >
              Save settings
            </button>
          </>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Data & backup</h2>
          </div>
          <div className="card-pad stack">
            <div className="small muted">
              {cloud ? (
                <>
                  Club data is stored in the <b>online club database</b> ({players.length} players, {matches.length}{' '}
                  matches) and cached on this phone, so scoring works without signal and syncs when you're back online.
                  Backups are optional extra safety.
                </>
              ) : (
                <>
                  Everything is stored on <b>this device</b> ({players.length} players, {matches.length} matches). Download a
                  backup regularly. To combine scoring from several phones, import each phone's backup here — matches and
                  players are merged, and the newest version of each wins.
                </>
              )}
            </div>
            <div className="grid-2">
              <button className="btn" onClick={backup}>
                ⬇ Download backup
              </button>
              {auth.canScore && (
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  ⬆ Import / merge backup
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
                e.target.value = '';
              }}
            />
            {cloud && auth.canScore && <UploadLocalData />}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Display (this phone)</h2>
          </div>
          <ToggleRow
            label="☀️ Sun mode"
            hint="Large text, bigger buttons and maximum contrast for scoring outdoors. Also on the scoring screen."
            checked={sun}
            onChange={setSun}
          />
        </div>

        <div className="card card-pad small muted">
          <b>Install on your phone:</b> open this site in Chrome/Safari and choose “Add to Home Screen”. The app then
          works offline at the cage.
        </div>
      </div>
    </div>
  );
}

function AccountCard() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  if (!auth.ready) return null;
  const run = (fn: () => Promise<void>, ok?: string) => async () => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <div className="card-head">
        <h2>Account</h2>
        {auth.user && <span className="badge brand">{auth.role.toUpperCase()}</span>}
      </div>
      <div className="card-pad stack">
        {!auth.user ? (
          <>
            <div className="small muted">
              Anyone can view scores. Scorers sign in with their Google account to score matches and edit players.
            </div>
            <button className="btn primary" disabled={busy} onClick={run(auth.signIn)}>
              Sign in with Google
            </button>
          </>
        ) : (
          <>
            <div className="row">
              {auth.user.photo && (
                <img src={auth.user.photo} alt="" width={40} height={40} style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="bold">{auth.user.name}</div>
                <div className="small muted">{auth.user.email}</div>
              </div>
              <button className="btn sm" onClick={run(auth.signOut)}>
                Sign out
              </button>
            </div>
            {auth.unclaimed && (
              <div className="stack">
                <div className="small">
                  <b>This club has no admin yet.</b> Claim it to become the first admin; you can then add other scorers and
                  admins by email.
                </div>
                <button className="btn primary" disabled={busy} onClick={run(auth.claimClub, "You're now the club admin")}>
                  Claim club as admin
                </button>
              </div>
            )}
            {!auth.unclaimed && auth.role === 'viewer' && (
              <div className="small muted">
                You can view everything. To score, ask a club admin to add <b>{auth.user.email}</b> to the scorer list.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AccessCard({ access }: { access: Access }) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'scorer' | 'admin'>('scorer');
  const save = async (next: Access, msg: string) => {
    try {
      await auth.saveAccess(next);
      toast(msg);
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`);
    }
  };
  const add = () => {
    const e = normalizeEmail(email);
    if (!e.includes('@')) return;
    setEmail('');
    void save(
      role === 'admin'
        ? { admins: [...access.admins, e], scorers: access.scorers }
        : { admins: access.admins, scorers: [...access.scorers, e] },
      `${e} added as ${role}`,
    );
  };
  const remove = (e: string) =>
    save(
      { admins: access.admins.filter((x) => x !== e), scorers: access.scorers.filter((x) => x !== e) },
      `${e} removed`,
    );
  const rows = [
    ...access.admins.map((e) => ({ e, r: 'admin' })),
    ...access.scorers.map((e) => ({ e, r: 'scorer' })),
  ];
  return (
    <div className="card">
      <div className="card-head">
        <h2>Scorers & admins</h2>
        <span className="tiny muted">private — only scorers see this list</span>
      </div>
      {rows.map(({ e, r }) => (
        <div key={e} className="list-item" style={{ cursor: 'default' }}>
          <div style={{ flex: 1, minWidth: 0 }} className="small">
            {e}
          </div>
          <span className={`badge ${r === 'admin' ? 'gold' : ''}`}>{r}</span>
          {e !== auth.user?.email && (
            <button className="link-btn" onClick={() => remove(e)} aria-label={`Remove ${e}`}>
              Remove
            </button>
          )}
        </div>
      ))}
      <form
        className="card-pad stack"
        onSubmit={(ev) => {
          ev.preventDefault();
          add();
        }}
      >
        <input
          className="input"
          type="email"
          placeholder="teammate@gmail.com"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
        />
        <Seg
          value={role}
          onChange={setRole}
          options={[
            { value: 'scorer', label: 'Scorer (can score & edit)' },
            { value: 'admin', label: 'Admin (+ manage access)' },
          ]}
        />
        <button className="btn primary" type="submit" disabled={!email.includes('@')}>
          Add
        </button>
      </form>
    </div>
  );
}

/** One-off: move matches scored on this phone before cloud sync existed into the club database. */
function UploadLocalData() {
  const [counts, setCounts] = useState<{ players: number; matches: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void localDataCounts().then(setCounts);
  }, []);
  if (!counts || (counts.players === 0 && counts.matches === 0)) return null;
  return (
    <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <div className="small">
        This phone has <b>{counts.players} players</b> and <b>{counts.matches} matches</b> saved from before cloud sync.
        Upload them to the club database (newer versions win, nothing is deleted).
      </div>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await uploadLocalData();
            toast(`Uploaded ${res.players} player(s) and ${res.matches} match(es)`);
          } catch (e) {
            toast(`Upload failed: ${(e as Error).message}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Uploading…' : '☁ Upload this phone’s data'}
      </button>
    </div>
  );
}
