import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ScorecardExport, topBatters, topBowlers } from '../components/ScorecardExport';
import { AppBar, askConfirm, Avatar, BallChip, Sheet, toast } from '../components/ui';
import {
  BIN_DAYS,
  binDaysLeft,
  binMatch,
  deleteMatchForever,
  restoreMatch,
  saveMatch,
  useClubPar,
  useMatch,
  usePlayerNames,
  useSettings,
} from '../db';
import { useAuth } from '../data/auth';
import { computeMatch, inningsLabel, oversText } from '../engine/engine';
import { ballNumber, commentary } from '../engine/format';
import { computeMvp } from '../engine/impact';
import { HeroesCard, MvpTable } from '../components/Mvp';
import { PressureChart } from '../components/PressureChart';
import { BallEditSheet } from '../components/BallEditor';
import { getDeviceId } from '../data/lock';
import { SummaryCard } from '../components/SummaryCard';
import { downloadText, exportNodeAsImage, matchFileName, shareMatchLink, textSummary } from '../export';

type Tab = 'summary' | 'scorecard' | 'commentary' | 'overs';

export default function MatchView() {
  const { id } = useParams();
  const nav = useNavigate();
  const match = useMatch(id);
  const { nameOf } = usePlayerNames();
  const settings = useSettings();
  const { canScore, isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('summary');
  const [busy, setBusy] = useState(false);
  const [motmOpen, setMotmOpen] = useState(false);
  const [editing, setEditing] = useState<{ inn: number; ev: number } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const state = useMemo(() => (match ? computeMatch(match) : null), [match]);
  const clubParRate = useClubPar(match);
  const mvp = useMemo(
    () => (match && state ? computeMvp(match, state, { clubPar: clubParRate }) : null),
    [match, state, clubParRate],
  );

  if (match === null) return <AppBar title="Match not found" back="/matches" />;
  if (!match || !state || !mvp) return null;
  const bpo = match.rules.ballsPerOver;
  const result = match.result ?? state.result;

  // Ball edits: scorers only, not in the bin, and not while another device holds a live match's scoring lock.
  const canEdit = canScore && !match.deletedAt;
  const openEditor = (inn: number, ev: number) => {
    if (match.status === 'live' && match.scorer && match.scorer.device !== getDeviceId()) {
      toast(`${match.scorer.name} is scoring this match — take over on the scoring screen to edit`);
      return;
    }
    setEditing({ inn, ev });
  };

  const shareImage = async (kind: 'summary' | 'scorecard') => {
    const node = kind === 'summary' ? summaryRef.current : exportRef.current;
    if (!node) return;
    setBusy(true);
    try {
      await exportNodeAsImage(node, matchFileName(match, kind === 'summary' ? 'summary.png' : 'scorecard.png'));
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const print = () => {
    setTab('scorecard');
    setTimeout(() => window.print(), 150);
  };
  const copyText = async () => {
    const text = textSummary(match, state, nameOf, settings.clubName, clubParRate);
    try {
      await navigator.clipboard.writeText(text);
      toast('Summary copied — paste it in WhatsApp');
    } catch {
      downloadText(text, matchFileName(match, 'txt'));
    }
  };
  const reopen = async () => {
    const ok = await askConfirm({
      title: 'Reopen this match?',
      message: 'You can correct the scoring. Stats update when you finish it again.',
      confirmLabel: 'Reopen',
    });
    if (!ok) return;
    await saveMatch({ ...match, status: 'live', result: undefined });
    nav(`/match/${match.id}/score`);
  };
  const remove = async () => {
    const ok = await askConfirm({
      title: 'Delete this match?',
      message: (
        <>
          <b>
            {match.teams[0].name} v {match.teams[1].name}
          </b>{' '}
          ({match.date}) moves to the bin and stops counting towards stats. You can restore it from{' '}
          <b>Matches → Bin</b> for {BIN_DAYS} days.
        </>
      ),
      confirmLabel: 'Move to bin',
      danger: true,
    });
    if (!ok) return;
    await binMatch(match);
    toast(`Moved to bin — restorable for ${BIN_DAYS} days`);
    nav('/matches', { replace: true });
  };

  return (
    <div>
      <AppBar title={`${match.teams[0].name} v ${match.teams[1].name}`} back="/matches" />
      <div className="tabs no-print">
        {(['summary', 'scorecard', 'commentary', 'overs'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="page">
        {match.deletedAt && (
          <div className="card card-pad stack" style={{ borderColor: 'var(--accent)' }}>
            <div className="bold">🗑 This match is in the bin</div>
            <div className="small muted">
              It doesn't count towards stats and will be deleted for good in {binDaysLeft(match)} day
              {binDaysLeft(match) === 1 ? '' : 's'}.
            </div>
            {canScore && (
              <div className="row wrap">
                <button
                  className="btn primary sm"
                  onClick={async () => {
                    await restoreMatch(match);
                    toast('Match restored');
                  }}
                >
                  ↺ Restore match
                </button>
                {isAdmin && (
                  <button
                    className="btn danger sm"
                    onClick={async () => {
                      const ok = await askConfirm({
                        title: 'Delete forever?',
                        message: 'This permanently removes the match and every ball in it. This cannot be undone.',
                        confirmLabel: 'Delete forever',
                        danger: true,
                      });
                      if (!ok) return;
                      await deleteMatchForever(match.id);
                      toast('Match deleted permanently');
                      nav('/matches', { replace: true });
                    }}
                  >
                    Delete forever
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {/* Export bar */}
        <div className="row wrap no-print">
          {match.status === 'live' && canScore && (
            <Link className="btn primary" to={`/match/${match.id}/score`}>
              ▶ Resume scoring
            </Link>
          )}
          <button
            className={`btn sm ${match.status === 'live' ? 'primary' : ''}`}
            onClick={async () => {
              const r = await shareMatchLink(match);
              if (r === 'copied') toast('Link copied — paste it in WhatsApp');
            }}
          >
            {match.status === 'live' ? '📡 Share live link' : '🔗 Share link'}
          </button>
          <button className="btn sm" onClick={() => shareImage('summary')} disabled={busy}>
            {busy ? 'Rendering…' : '🖼 Share summary'}
          </button>
          <button className="btn sm" onClick={() => shareImage('scorecard')} disabled={busy}>
            📋 Scorecard image
          </button>
          <button className="btn sm" onClick={print}>
            📄 PDF / Print
          </button>
          <button className="btn sm" onClick={copyText}>
            💬 Copy summary
          </button>
        </div>

        {tab === 'summary' && (
          <>
            <ScaledPreview width={960}>
              <SummaryCard match={match} state={state} nameOf={nameOf} clubName={settings.clubName} tagline={settings.exportTagline} clubPar={clubParRate} />
            </ScaledPreview>
            <div className="card card-pad stack">
              <div className="row">
                <span className={`badge ${match.status === 'live' ? 'live' : ''}`}>
                  {match.status === 'live' ? 'LIVE' : match.status === 'abandoned' ? 'ABANDONED' : 'COMPLETED'}
                </span>
                <span className="small muted">
                  {match.date}
                  {match.venue ? ` · ${match.venue}` : ''} · {match.rules.overs} ov
                </span>
              </div>
              {match.toss && (
                <div className="small muted">
                  {match.teams[match.toss.winner].name} won the toss and chose to {match.toss.decision}
                </div>
              )}
            </div>

            {result && (
              <HeroesCard
                heroes={{
                  ...mvp.heroes,
                  potm: match.motmId ?? mvp.heroes.potm,
                  fighter: mvp.heroes.fighter === (match.motmId ?? mvp.heroes.potm) ? undefined : mvp.heroes.fighter,
                }}
                players={mvp.players}
                nameOf={nameOf}
                onChangePotm={match.status === 'completed' && canScore ? () => setMotmOpen(true) : undefined}
              />
            )}

            {mvp.players.length > 0 && (
              <div className="card">
                <div className="card-head">
                  <h2>MVP · Impact score</h2>
                  <span className="tiny muted">pressure-weighted</span>
                </div>
                <MvpTable players={mvp.players} nameOf={nameOf} />
              </div>
            )}

            {mvp.pressure.some((p) => p.length > 0) && (
              <div className="card">
                <div className="card-head">
                  <h2>Pressure index</h2>
                  <span className="tiny muted">0 calm · 100 extreme</span>
                </div>
                <PressureChart
                  series={state.innings.map((inn, i) => ({
                    name: match.teams[inn.battingTeam].name,
                    points: mvp.pressure[i],
                  }))}
                  maxBalls={match.rules.overs * bpo}
                  bpo={bpo}
                />
              </div>
            )}
            {state.innings.map((inn) => (
              <div className="card" key={inn.index}>
                <div className="card-head">
                  <h2>
                    {match.teams[inn.battingTeam].name} · {inn.superOver ? inningsLabel(inn.index) : 'innings'} · top performers
                  </h2>
                </div>
                {topBatters(inn, 3).map((b) => (
                  <Link className="list-item" key={b.key} to={`/players/${b.playerId}`}>
                    <Avatar name={nameOf(b.playerId)} />
                    <div style={{ flex: 1 }} className="bold">
                      {nameOf(b.playerId)}
                      {b.stint > 1 && <span className="tiny muted"> (2nd turn)</span>}
                    </div>
                    <span className="bold">
                      {b.runs}
                      {b.status === 'out' ? '' : '*'}
                    </span>
                    <span className="small muted">({b.balls})</span>
                  </Link>
                ))}
                {topBowlers(inn, 2).map((b) => (
                  <Link className="list-item" key={b.playerId} to={`/players/${b.playerId}`}>
                    <Avatar name={nameOf(b.playerId)} />
                    <div style={{ flex: 1 }} className="bold">
                      {nameOf(b.playerId)}
                    </div>
                    <span className="bold">
                      {b.wickets}/{b.runs}
                    </span>
                    <span className="small muted">({oversText(b.balls, bpo)})</span>
                  </Link>
                ))}
              </div>
            ))}

            <div className="card">
              <div className="card-head">
                <h2>Squads</h2>
              </div>
              {match.teams.map((t, i) => (
                <div key={i} className="card-pad small">
                  <b>{t.name}</b> ({t.playerIds.length}):{' '}
                  {t.playerIds.map((pid) => nameOf(pid) + (t.captainId === pid ? ' (c)' : '')).join(', ')}
                </div>
              ))}
            </div>

            {canScore && !match.deletedAt && (
            <div className="row wrap no-print">
              {match.status !== 'live' && (
                <button className="btn sm" onClick={reopen}>
                  ✏️ Reopen for editing
                </button>
              )}
              <button className="btn sm danger" onClick={remove}>
                Delete match
              </button>
            </div>
            )}
          </>
        )}

        {tab === 'commentary' && (
          <div className="stack">
            {[...state.innings].reverse().map((inn) => (
              <div className="card" key={inn.index}>
                <div className="card-head">
                  <h2>
                    {match.teams[inn.battingTeam].name} · {inningsLabel(inn.index)}
                  </h2>
                </div>
                {inn.balls.length === 0 && <div className="empty small">No balls bowled yet</div>}
                {canEdit && inn.balls.length > 0 && (
                  <div className="tiny muted" style={{ padding: '8px 14px 0' }}>
                    Tap a ball to correct it.
                  </div>
                )}
                {[...inn.balls].reverse().map((b) => (
                  <div
                    key={b.eventIndex}
                    className="list-item"
                    style={{ cursor: canEdit ? 'pointer' : 'default', alignItems: 'flex-start' }}
                    role={canEdit ? 'button' : undefined}
                    onClick={canEdit ? () => openEditor(inn.index, b.eventIndex) : undefined}
                  >
                    <span className="tiny muted bold" style={{ minWidth: 34, paddingTop: 8 }}>
                      {ballNumber(b, bpo)}
                    </span>
                    <BallChip ball={b} />
                    <div className="small" style={{ flex: 1, paddingTop: 6 }}>
                      {commentary(b, nameOf)}
                    </div>
                    {mvp.pressureByBall.has(`${inn.index}:${b.eventIndex}`) && (
                      <span className="pi-chip" style={{ paddingTop: 7 }} title="Pressure index before this ball">
                        PI {mvp.pressureByBall.get(`${inn.index}:${b.eventIndex}`)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === 'overs' && (
          <div className="stack">
            {state.innings.map((inn) => (
              <div className="card" key={inn.index}>
                <div className="card-head">
                  <h2>
                    {match.teams[inn.battingTeam].name} · {inningsLabel(inn.index)} · overs
                  </h2>
                </div>
                {inn.overs.map((o) => (
                  <div key={o.overNo} className="over-strip" style={{ borderBottom: '1px solid var(--line)' }}>
                    <span className="tiny bold" style={{ minWidth: 44 }}>
                      Ov {o.overNo + 1}
                    </span>
                    <span className="tiny muted" style={{ minWidth: 80 }}>
                      {nameOf(o.bowlerId)}
                    </span>
                    {o.balls.map((b) => (
                      <BallChip key={b.eventIndex} ball={b} />
                    ))}
                    <span className="spacer" />
                    <span className="tiny bold">
                      {o.runs} run{o.runs === 1 ? '' : 's'}
                      {o.wickets ? ` · ${o.wickets}W` : ''}
                    </span>
                  </div>
                ))}
                {inn.partnerships.length > 0 && (
                  <>
                    <div className="card-head" style={{ borderTop: '1px solid var(--line)' }}>
                      <h2>Partnerships</h2>
                    </div>
                    {inn.partnerships.map((p, i) => (
                      <div key={i} className="list-item" style={{ cursor: 'default' }}>
                        <div style={{ flex: 1 }} className="small">
                          {p.batterIds.map((pid) => nameOf(pid)).join(' & ')}
                        </div>
                        <span className="bold">{p.runs}</span>
                        <span className="small muted">({p.balls})</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'scorecard' && (
          <ScorecardExport match={match} state={state} nameOf={nameOf} clubName={settings.clubName} clubPar={clubParRate} />
        )}
      </div>

      {/* Fixed-width off-screen copies used for image export, so shared images look the same from any device. */}
      <div className="no-print" style={{ position: 'fixed', left: -10000, top: 0, width: 720 }} aria-hidden>
        <ScorecardExport ref={exportRef} match={match} state={state} nameOf={nameOf} clubName={settings.clubName} clubPar={clubParRate} />
      </div>
      <div className="no-print" style={{ position: 'fixed', left: -12000, top: 0, width: 960 }} aria-hidden>
        <SummaryCard
          ref={summaryRef}
          match={match}
          state={state}
          nameOf={nameOf}
          clubName={settings.clubName}
          tagline={settings.exportTagline}
          clubPar={clubParRate}
        />
      </div>

      {editing && (
        <BallEditSheet
          match={match}
          inningsIndex={editing.inn}
          eventIndex={editing.ev}
          nameOf={nameOf}
          onClose={() => setEditing(null)}
          onSave={async (next) => {
            await saveMatch(next);
            if (match.status === 'completed' && next.status === 'live') toast('Ball updated — the match is no longer decided, so it was reopened');
            else if (match.result?.text !== next.result?.text && next.result) toast(`Ball updated — result is now: ${next.result.text}`);
            else toast('Ball updated');
          }}
        />
      )}
      {motmOpen && (
        <Sheet open title="Player of the match" onClose={() => setMotmOpen(false)}>
          <div className="small muted">
            Suggested by MVP 2.0: the top-ranked winning-team player in the top 3 Impact scores. Tap anyone to override.
          </div>
          <div className="card">
            <MvpTable
              players={mvp.players}
              nameOf={nameOf}
              selected={match.motmId ?? mvp.heroes.potm}
              onSelect={async (pid) => {
                await saveMatch({ ...match, motmId: pid });
                setMotmOpen(false);
                toast('Player of the match updated');
              }}
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Shows a fixed-width graphic scaled down to fit the screen. */
function ScaledPreview({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (!outer.current || !inner.current) return;
      const s = Math.min(1, outer.current.clientWidth / width);
      setScale(s);
      setHeight(inner.current.offsetHeight * s);
    });
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} className="sm-preview" style={{ height }}>
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}