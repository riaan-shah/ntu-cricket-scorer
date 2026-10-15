import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScorerOnly } from '../components/Account';
import { NewPlayerInline } from '../components/PlayerPick';
import { useAuth } from '../data/auth';
import { RulesEditor } from '../components/RulesEditor';
import { AppBar, Avatar, Seg, toast } from '../components/ui';
import { saveMatch, uid, useMatches, usePlayers, useSettings } from '../db';
import { OversPicker } from '../components/OversPicker';
import type { ID, Match, MatchRules, TeamIdx } from '../types';

type Side = 'A' | 'B' | 'both';

export default function NewMatch() {
  const nav = useNavigate();
  const players = usePlayers();
  const settings = useSettings();
  const auth = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nameA, setNameA] = useState('Team A');
  const [nameB, setNameB] = useState('Team B');
  const [sides, setSides] = useState<Map<ID, Side>>(new Map());
  const [query, setQuery] = useState('');
  const [rules, setRules] = useState<MatchRules | null>(null);
  const [overs, setOvers] = useState<number | null>(null);
  const lastMatch = useMatches()?.[0];
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [venue, setVenue] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [tossWinner, setTossWinner] = useState<TeamIdx>(0);
  const [decision, setDecision] = useState<'bat' | 'bowl'>('bat');
  const [coin, setCoin] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  const effRules = rules ?? settings.defaultRules;
  // Default to whatever the club played last time.
  const effOvers = overs ?? lastMatch?.rules.overs ?? settings.defaultRules.overs;
  const effVenue = venue ?? settings.defaultVenue;

  const teamA = [...sides].filter(([, s]) => s === 'A' || s === 'both').map(([id]) => id);
  const teamB = [...sides].filter(([, s]) => s === 'B' || s === 'both').map(([id]) => id);
  const both = [...sides].filter(([, s]) => s === 'both').length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => !p.archived && (!q || p.name.toLowerCase().includes(q)));
  }, [players, query]);

  const setSide = (id: ID, side: Side) => {
    const next = new Map(sides);
    if (next.get(id) === side) next.delete(id);
    else next.set(id, side);
    setSides(next);
  };

  const shuffle = () => {
    const pool = [...sides].filter(([, s]) => s !== 'both').map(([id]) => id);
    if (pool.length < 2) {
      toast('Pick some players first');
      return;
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const next = new Map(sides);
    pool.forEach((id, i) => next.set(id, i % 2 === 0 ? 'A' : 'B'));
    setSides(next);
    toast('Teams shuffled');
  };

  const short = teamA.length - teamB.length;

  if (!auth.canScore) {
    return (
      <div>
        <AppBar title="New match" back="/" />
        <div className="page">
          <ScorerOnly what="start matches" />
        </div>
      </div>
    );
  }

  const start = async () => {
    const battingTeam: TeamIdx = decision === 'bat' ? tossWinner : ((1 - tossWinner) as TeamIdx);
    const now = Date.now();
    const m: Match = {
      id: uid(),
      title: title.trim() || undefined,
      venue: effVenue.trim() || undefined,
      date,
      createdAt: now,
      updatedAt: now,
      teams: [
        { name: nameA.trim() || 'Team A', playerIds: teamA },
        { name: nameB.trim() || 'Team B', playerIds: teamB },
      ],
      rules: { ...effRules, overs: effOvers },
      toss: { winner: tossWinner, decision },
      innings: [{ battingTeam, events: [] }],
      status: 'live',
    };
    await saveMatch(m);
    nav(`/match/${m.id}/score`, { replace: true });
  };

  return (
    <div>
      <AppBar
        title={step === 1 ? 'New match · Teams' : step === 2 ? 'New match · Rules' : 'New match · Toss & overs'}
        back={step === 1 ? '/' : () => setStep((s) => (s - 1) as 1 | 2)}
      />

      {step === 1 && (
        <div className="page">
          <div className="grid-2">
            <label className="field">
              <span>Team A name</span>
              <input className="input" value={nameA} onChange={(e) => setNameA(e.target.value)} />
            </label>
            <label className="field">
              <span>Team B name</span>
              <input className="input" value={nameB} onChange={(e) => setNameB(e.target.value)} />
            </label>
          </div>

          <div className="card card-pad stack">
            <div className="row">
              <span className="badge brand">A · {teamA.length}</span>
              <span className="badge live">B · {teamB.length}</span>
              {both > 0 && <span className="badge gold">Both · {both}</span>}
              <span className="spacer" />
              <button className="btn sm" onClick={shuffle}>
                🔀 Shuffle teams
              </button>
            </div>
            {short !== 0 && teamA.length > 0 && teamB.length > 0 && (
              <div className="small muted">
                {short < 0 ? nameA : nameB} has {Math.abs(short)} fewer player{Math.abs(short) > 1 ? 's' : ''}
                {effRules.rebatWhenShort
                  ? ` — they get ${Math.abs(short)} extra batting turn${Math.abs(short) > 1 ? 's' : ''}.`
                  : '.'}
              </div>
            )}
            <div className="small muted">
              Tap <b>A</b>, <b>B</b> or <b>Both</b> for each player. “Both” = plays for both sides.
            </div>
          </div>

          <NewPlayerInline
            players={players}
            label="New player name"
            onAdd={(p) =>
              setSides((prev) => {
                const next = new Map(prev);
                const vals = [...prev.values()];
                const a = vals.filter((s) => s !== 'B').length;
                const b = vals.filter((s) => s !== 'A').length;
                next.set(p.id, a <= b ? 'A' : 'B');
                return next;
              })
            }
          />

          <input
            className="input"
            placeholder="Search players…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="card">
            {filtered.length === 0 && <div className="empty">No players yet — add some above.</div>}
            {filtered.map((p) => {
              const s = sides.get(p.id);
              return (
                <div key={p.id} className="list-item" style={{ cursor: 'default' }}>
                  <Avatar name={p.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bold">{p.name}</div>
                    {p.role && <div className="tiny muted">{p.role}</div>}
                  </div>
                  <div className="team-toggle">
                    <button className={s === 'A' ? 'on-a' : ''} onClick={() => setSide(p.id, 'A')}>
                      A
                    </button>
                    <button className={s === 'B' ? 'on-b' : ''} onClick={() => setSide(p.id, 'B')}>
                      B
                    </button>
                    <button className={s === 'both' ? 'on-both' : ''} onClick={() => setSide(p.id, 'both')}>
                      Both
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="btn primary big block"
            disabled={teamA.length === 0 || teamB.length === 0}
            onClick={() => setStep(2)}
          >
            Next: Rules →
          </button>
          <div className="small muted center">You can add more players to either team during the match.</div>
        </div>
      )}

      {step === 2 && (
        <div className="page">
          <div className="card card-pad stack">
            <div className="grid-2">
              <label className="field">
                <span>Date</span>
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Venue</span>
                <input className="input" value={effVenue} onChange={(e) => setVenue(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>Match title (optional)</span>
              <input
                className="input"
                placeholder="e.g. Friday Night Cage Clash"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>
          <RulesEditor rules={effRules} onChange={setRules} />
          <button className="btn primary big block" onClick={() => setStep(3)}>
            Next: Toss & overs →
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="page">
          <div className="card card-pad stack center">
            <button
              className="btn"
              onClick={() => {
                setCoin(null);
                setTimeout(() => setCoin(Math.random() < 0.5 ? 'Heads' : 'Tails'), 350);
              }}
            >
              🪙 Flip a coin
            </button>
            {coin && <div style={{ fontSize: 28, fontWeight: 800 }}>{coin}!</div>}
          </div>
          <div className="card card-pad stack">
            <div className="section-title">Who won the toss?</div>
            <Seg
              value={String(tossWinner) as '0' | '1'}
              onChange={(v) => setTossWinner(Number(v) as TeamIdx)}
              options={[
                { value: '0', label: nameA || 'Team A' },
                { value: '1', label: nameB || 'Team B' },
              ]}
            />
            <div className="section-title">Elected to</div>
            <Seg
              value={decision}
              onChange={setDecision}
              options={[
                { value: 'bat', label: '🏏 Bat' },
                { value: 'bowl', label: '⚾ Bowl' },
              ]}
            />
          </div>
          <div className="card card-pad stack">
            <div className="section-title">How many overs?</div>
            <OversPicker value={effOvers} onChange={setOvers} />
            <div className="tiny muted center">You can add or remove overs any time during the match.</div>
          </div>
          <div className="card card-pad small">
            <b>{tossWinner === 0 ? nameA : nameB}</b> won the toss and elected to <b>{decision}</b>.{' '}
            {effOvers} over{effOvers === 1 ? '' : 's'} a side · {teamA.length} v {teamB.length} players
          </div>
          <button className="btn primary big block" onClick={start}>
            Start match 🏏
          </button>
        </div>
      )}
    </div>
  );
}
