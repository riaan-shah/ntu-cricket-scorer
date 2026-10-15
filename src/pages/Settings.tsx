import { useEffect, useRef, useState } from 'react';
import { RulesEditor } from '../components/RulesEditor';
import { AppBar, toast } from '../components/ui';
import { exportBackup, importBackup, saveSettings, useMatches, usePlayers, useSettings } from '../db';
import { downloadText } from '../export';
import type { ClubSettings } from '../types';

export default function Settings() {
  const saved = useSettings();
  const players = usePlayers();
  const matches = useMatches() ?? [];
  const [draft, setDraft] = useState<ClubSettings>(saved);
  const fileRef = useRef<HTMLInputElement>(null);

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
      const res = await importBackup(data);
      toast(`Imported ${res.players} player(s) and ${res.matches} match(es)`);
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <AppBar title="Settings" back="/" />
      <div className="page">
        <div className="card card-pad stack">
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
        </div>

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

        <div className="card">
          <div className="card-head">
            <h2>Data & backup</h2>
          </div>
          <div className="card-pad stack">
            <div className="small muted">
              Everything is stored on <b>this device</b> ({players.length} players, {matches.length} matches). Download a
              backup regularly. To combine scoring from several phones, import each phone's backup here — matches and
              players are merged, and the newest version of each wins.
            </div>
            <div className="grid-2">
              <button className="btn" onClick={backup}>
                ⬇ Download backup
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                ⬆ Import / merge backup
              </button>
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
          </div>
        </div>

        <div className="card card-pad small muted">
          <b>Install on your phone:</b> open this site in Chrome/Safari and choose “Add to Home Screen”. The app then
          works offline at the cage.
        </div>
      </div>
    </div>
  );
}
