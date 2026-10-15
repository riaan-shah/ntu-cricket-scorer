import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppBar, askConfirm, BallChip, Sheet, toast } from '../../components/ui';
import { BIN_DAYS, binMatch, saveMatch, useClubPar, useMatchWithMeta, usePlayerNames } from '../../db';
import { useAuth } from '../../data/auth';
import { getDeviceId, lockHeldByOther, timeAgo } from '../../data/lock';
import {
  computeMatch,
  economy,
  oversText,
  oversTextFull,
  runRate,
  strikeRate,
  inningsLabel,
  startSuperOver,
  undoLast,
} from '../../engine/engine';
import { computeMvp, currentPressure } from '../../engine/impact';
import { BallEditSheet } from '../../components/BallEditor';
import { captainMark } from '../../engine/format';
import { HeroesCard, MvpTable, PressureBadge } from '../../components/Mvp';
import type { ExtraType, Match, ScoreEvent, TeamIdx } from '../../types';
import {
  AddPlayerSheet,
  BatterSheet,
  BowlerSheet,
  ExtrasSheet,
  MatchSettingsSheet,
  OversSheet,
  RetireSheet,
  StartSheet,
  WicketSheet,
  type ScoringCtx,
} from './sheets';

type SheetKind =
  | null
  | 'wicket'
  | ExtraType
  | 'more'
  | 'retire'
  | 'addPlayer'
  | 'settings'
  | 'changeBowler'
  | 'customRuns'
  | 'overs';

export default function Scoring() {
  const { id } = useParams();
  const nav = useNavigate();
  const { match: stored, meta } = useMatchWithMeta(id);
  const auth = useAuth();
  const clubParRate = useClubPar(stored);
  const { players, nameOf } = usePlayerNames();
  const [match, setMatch] = useState<Match | null>(null);
  const matchRef = useRef<Match | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [hideForced, setHideForced] = useState(false);
  const [editingBall, setEditingBall] = useState<number | null>(null);

  // Scorer lock (cloud mode): one device holds the pen; others watch and can take over.
  const lockOn = auth.mode === 'cloud' && !!auth.user;
  const deviceId = useMemo(getDeviceId, []);
  const me = auth.user ? { email: auth.user.email, name: auth.user.name, device: deviceId } : null;

  useEffect(() => {
    if (!stored) return;
    // Until this device holds the pen, always show the latest synced copy (another scorer's balls, or a newer
    // server version than the offline cache). Once we hold it, our own saves echo back and are ignored, so
    // in-flight balls are never replaced by an older copy.
    if (!matchRef.current || (lockOn && stored.scorer?.device !== deviceId)) {
      matchRef.current = stored;
      setMatch(stored);
    }
  }, [stored, lockOn, deviceId]);

  // Nobody is scoring this live match: claim it — but only from a server-confirmed copy, never a possibly-stale
  // offline cache. (Offline, the first ball recorded takes the lock instead.)
  useEffect(() => {
    if (!lockOn || !me || !stored || !meta || meta.fromCache) return;
    if (stored.status !== 'live' || stored.deletedAt || stored.scorer) return;
    const next = { ...stored, scorer: { ...me, at: Date.now() } };
    matchRef.current = next;
    setMatch(next);
    void saveMatch(next);
  }, [lockOn, stored, meta, me?.device]);
  const state = useMemo(() => (match ? computeMatch(match) : null), [match]);

  // Re-show mandatory prompts whenever the score changes.
  const eventCount = match?.innings.reduce((n, i) => n + i.events.length, 0) ?? 0;
  useEffect(() => {
    setHideForced(false);
  }, [eventCount, match?.innings.length]);

  if (stored === null) {
    return (
      <div>
        <AppBar title="Match not found" back="/" />
      </div>
    );
  }
  if (!match || !state || !auth.ready) return null;
  if (match.status !== 'live' || !auth.canScore || match.deletedAt) return <Navigate to={`/match/${match.id}`} replace />;

  const holder = match.scorer;
  const lockedOut = lockOn && lockHeldByOther(holder, deviceId);

  const mutate = (fn: (m: Match) => Match) => {
    const current = matchRef.current!;
    if (lockOn && lockHeldByOther(current.scorer, deviceId)) {
      toast(`${current.scorer.name} is scoring this match — take over first`);
      return;
    }
    let next = fn(current);
    // Stamp the lock on every save while live; release it when the match finishes or is abandoned.
    if (lockOn && me) next = { ...next, scorer: next.status === 'live' ? { ...me, at: Date.now() } : undefined };
    matchRef.current = next;
    setMatch(next);
    void saveMatch(next);
  };
  const takeOver = () => {
    if (!me) return;
    // Build on the latest synced copy so we don't drop balls the previous scorer already uploaded.
    const base = stored ?? matchRef.current!;
    const next = { ...base, scorer: { ...me, at: Date.now() } };
    matchRef.current = next;
    setMatch(next);
    void saveMatch(next);
    toast("You're now scoring this match");
  };
  const append = (ev: ScoreEvent) =>
    mutate((m) => ({
      ...m,
      innings: m.innings.map((inn, i) => (i === m.innings.length - 1 ? { ...inn, events: [...inn.events, ev] } : inn)),
    }));
  const undo = () => {
    mutate(undoLast);
    toast('Undone');
  };

  const cur = state.current!;
  const rules = match.rules;
  const bpo = rules.ballsPerOver;
  const batTeam = match.teams[cur.battingTeam];
  const ctx: ScoringCtx = {
    match,
    state,
    cur,
    players,
    nameOf,
    append,
    mutate,
    undo,
    ballBase: () => ({
      ts: Date.now(),
      strikerId: cur.striker!.playerId,
      nonStrikerId: cur.nonStriker?.playerId ?? null,
      bowlerId: cur.bowlerId!,
    }),
  };

  const live = state.phase === 'innings';
  const canScore = live && !cur.needs && !lockedOut;

  const runs = (n: number, boundary = false) => {
    if (!canScore) return;
    append({ kind: 'ball', ...ctx.ballBase(), runs: n, boundary });
    if (boundary && n === 6) toast('SIX! 🚀');
    else if (boundary && n === 4) toast('FOUR! 🔥');
  };
  const outOfCage = () => {
    if (!canScore) return;
    if (cur.freeHit && !rules.outOfCageOnFreeHit) {
      toast('Free hit — out of cage is not out. Record the runs instead.');
      return;
    }
    append({
      kind: 'ball',
      ...ctx.ballBase(),
      runs: 0,
      wicket: { type: 'outOfCage', playerOutId: cur.striker!.playerId },
    });
    if (navigator.vibrate) navigator.vibrate(120);
    toast(`OUT! ${nameOf(cur.striker!.playerId)} hit it out of the cage`);
  };

  const lastOver = cur.overs[cur.overs.length - 1];
  const showOver = lastOver && (!lastOver.complete || cur.bowlerId === null) ? lastOver : null;
  const currentPartnership = cur.partnerships.find((p) => p.ongoing);
  const ballsLeft = cur.maxBalls - cur.legalBalls;
  const bowlerLine = cur.bowlers.find((b) => b.playerId === (cur.bowlerId ?? cur.lastOverBowlerId));

  const forced = live && !hideForced && !lockedOut ? cur.needs : null;
  const pressure = currentPressure(match, state, clubParRate);
  const closeForced = () => setHideForced(true);

  return (
    <div>
      <AppBar
        title={`${match.teams[0].name} v ${match.teams[1].name}`}
        back="/"
        right={
          <>
            {meta && <SyncChip pending={meta.pendingWrites} />}
            <Link className="icon-btn" to={`/match/${match.id}`} title="Scorecard">
              📋
            </Link>
            <button className="icon-btn" onClick={() => setSheet('more')} aria-label="More">
              ⋮
            </button>
          </>
        }
      />

      {lockedOut && holder && (
        <div className="lock-banner">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bold">
              📝 Being scored by {holder.name}
              {auth.user && holder.email === auth.user.email ? ' on another device' : ''}
            </div>
            <div className="tiny">Last ball saved {timeAgo(holder.at)}. You're watching live.</div>
          </div>
          <button
            className="btn sm"
            onClick={async () => {
              const ok = await askConfirm({
                title: 'Take over scoring?',
                message: (
                  <>
                    <b>{holder.name}</b> will be switched to watching and won't be able to score until they take it back.
                    If their phone has no signal, balls they've recorded but not yet uploaded could be lost, so check with
                    them first.
                  </>
                ),
                confirmLabel: 'Take over',
              });
              if (ok) takeOver();
            }}
          >
            Take over
          </button>
        </div>
      )}

      {/* ---------- Score header ---------- */}
      <div className="score-hero">
        <div className="team">
          {batTeam.name} · {inningsLabel(cur.index)}
        </div>
        <div className="big">
          {cur.runs}/{cur.wickets}
          <small>
            {cur.superOver ? (
              <>({oversTextFull(cur.legalBalls, bpo)}/1)</>
            ) : (
              <button className="overs-link" onClick={() => setSheet('overs')} title="Change overs">
                ({oversTextFull(cur.legalBalls, bpo)}/{rules.overs} ✎)
              </button>
            )}
          </small>
        </div>
        <div className="meta">
          <span>CRR {runRate(cur.runs, cur.legalBalls, bpo)}</span>
          {cur.extras.total > 0 && <span>Extras {cur.extras.total}</span>}
          {cur.target === null && match.toss && cur.legalBalls === 0 && (
            <span>
              {match.teams[match.toss.winner].name} won the toss & chose to {match.toss.decision}
            </span>
          )}
          {cur.target === null && cur.legalBalls > 0 && (
            <span>Projected {Math.round(cur.runs + (cur.runs / cur.legalBalls) * ballsLeft)}</span>
          )}
        </div>
        {live && pressure !== null && (
          <div>
            <PressureBadge pi={pressure} />
          </div>
        )}
        {cur.target !== null && live && (
          <div className="need">
            Need {Math.max(0, cur.target - cur.runs)} run{cur.target - cur.runs === 1 ? '' : 's'} from {ballsLeft} ball
            {ballsLeft === 1 ? '' : 's'} · RRR{' '}
            {ballsLeft > 0 ? (((cur.target - cur.runs) * bpo) / ballsLeft).toFixed(2) : '-'}
          </div>
        )}
      </div>
      {live && cur.freeHit && <div className="free-hit">FREE HIT</div>}

      {state.phase === 'break' && <InningsBreak match={match} ctx={ctx} onChangeOvers={() => setSheet('overs')} />}
      {state.phase === 'result' && (
        <MatchOver match={match} ctx={ctx} clubPar={clubParRate} onChangeOvers={() => setSheet('overs')} />
      )}

      {live && (
        <div className="page" style={{ paddingTop: 12 }}>
          {/* Batters */}
          <div className="card">
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Batter</th>
                  <th>R</th>
                  <th>B</th>
                  <th>4s</th>
                  <th>6s</th>
                  <th>SR</th>
                </tr>
              </thead>
              <tbody>
                {[cur.striker, cur.nonStriker].map((l, i) =>
                  l ? (
                    <tr key={l.key} className={i === 0 ? 'on-strike' : ''}>
                      <td className="name">
                        {nameOf(l.playerId)}
                        {captainMark(match, cur.battingTeam, l.playerId)}
                        {l.stint > 1 && <span className="badge gold" style={{ marginLeft: 6 }}>2nd turn</span>}
                      </td>
                      <td className="bold">{l.runs}</td>
                      <td>{l.balls}</td>
                      <td>{l.fours}</td>
                      <td>{l.sixes}</td>
                      <td>{strikeRate(l.runs, l.balls)}</td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td className="muted" colSpan={6}>
                        {cur.needs === 'batter' ? (
                          <button className="link-btn" onClick={() => setHideForced(false)}>
                            + Select batter
                          </button>
                        ) : (
                          <span className="small">{i === 1 && rules.lastManStands ? 'Last man standing' : '—'}</span>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {currentPartnership && (
              <div className="small muted" style={{ padding: '0 14px 10px' }}>
                Partnership {currentPartnership.runs} ({currentPartnership.balls})
              </div>
            )}
          </div>

          {/* Bowler + this over */}
          <div className="card">
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Bowler</th>
                  <th>O</th>
                  <th>M</th>
                  <th>R</th>
                  <th>W</th>
                  <th>Econ</th>
                </tr>
              </thead>
              <tbody>
                {bowlerLine ? (
                  <tr>
                    <td className="name">
                      {nameOf(bowlerLine.playerId)}
                      {captainMark(match, cur.bowlingTeam, bowlerLine.playerId)}
                      {cur.bowlerId === null && <span className="tiny muted"> (last over)</span>}
                    </td>
                    <td>{oversText(bowlerLine.balls, bpo)}</td>
                    <td>{bowlerLine.maidens}</td>
                    <td>{bowlerLine.runs}</td>
                    <td className="bold">{bowlerLine.wickets}</td>
                    <td>{economy(bowlerLine.runs, bowlerLine.balls, bpo)}</td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={6} className="muted small">
                      {cur.needs === 'bowler' ? (
                        <button className="link-btn" onClick={() => setHideForced(false)}>
                          + Select bowler
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="over-strip">
              <span className="tiny muted bold" style={{ marginRight: 4 }}>
                {showOver ? `Over ${showOver.overNo + 1}` : 'This over'}
              </span>
              {showOver?.balls.map((b) => (
                <button key={b.eventIndex} className="ball-btn" onClick={() => !lockedOut && setEditingBall(b.eventIndex)} title="Edit this ball">
                  <BallChip ball={b} />
                </button>
              ))}
              {showOver && <span className="tiny muted">= {showOver.runs}</span>}
            </div>
          </div>

          {/* Pending prompt banner */}
          {cur.needs && hideForced && (
            <button className="btn primary block" onClick={() => setHideForced(false)}>
              {cur.needs === 'batter' ? 'Select next batter' : cur.needs === 'bowler' ? 'Select next bowler' : 'Select openers'}
            </button>
          )}

          {/* Scoring pad */}
          <div className="card" style={{ opacity: canScore ? 1 : 0.5 }}>
            <div className="pad">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} onClick={() => runs(n)} disabled={!canScore}>
                  {n}
                </button>
              ))}
              <button className="four" onClick={() => runs(4, true)} disabled={!canScore}>
                4
              </button>
              <button className="six" onClick={() => runs(6, true)} disabled={!canScore}>
                6
              </button>
              <button className="extra" onClick={() => setSheet('wd')} disabled={!canScore}>
                WD
              </button>
              <button className="extra" onClick={() => setSheet('nb')} disabled={!canScore}>
                NB
              </button>
              <button className="extra" onClick={() => setSheet('b')} disabled={!canScore}>
                BYE
              </button>
              <button className="extra" onClick={() => setSheet('lb')} disabled={!canScore}>
                LB
              </button>
              <button className="util" onClick={undo} disabled={eventCount === 0}>
                ↶ Undo
              </button>
              <button className="util" onClick={() => setSheet('more')}>
                ⋯ More
              </button>
              <button
                className={`out ${rules.outOfCage ? 'span-2' : ''}`}
                style={rules.outOfCage ? undefined : { gridColumn: 'span 4' }}
                onClick={() => setSheet('wicket')}
                disabled={!canScore}
              >
                OUT
              </button>
              {rules.outOfCage && (
                <button className="cage span-2" onClick={outOfCage} disabled={!canScore}>
                  OUT OF CAGE
                  <br />
                  <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>1 tap · striker out</span>
                </button>
              )}
            </div>
          </div>

          <RecentBalls ctx={ctx} onEdit={lockedOut ? undefined : setEditingBall} />
        </div>
      )}

      {/* ---------- Mandatory prompts ---------- */}
      {forced === 'start' && <StartSheet key={cur.index} ctx={ctx} />}
      {forced === 'batter' && sheet === null && <BatterSheet ctx={ctx} onClose={closeForced} />}
      {forced === 'bowler' && sheet === null && <BowlerSheet ctx={ctx} mode="new" onClose={closeForced} />}

      {/* ---------- User-opened sheets ---------- */}
      {sheet === 'wicket' && canScore && <WicketSheet ctx={ctx} onClose={() => setSheet(null)} />}
      {(sheet === 'wd' || sheet === 'nb' || sheet === 'b' || sheet === 'lb') && canScore && (
        <ExtrasSheet ctx={ctx} kind={sheet} onClose={() => setSheet(null)} />
      )}
      {sheet === 'retire' && <RetireSheet ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'addPlayer' && <AddPlayerSheet ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <MatchSettingsSheet ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'overs' && <OversSheet ctx={ctx} onClose={() => setSheet(null)} />}
      {editingBall !== null && (
        <BallEditSheet
          match={match}
          inningsIndex={cur.index}
          eventIndex={editingBall}
          nameOf={nameOf}
          onClose={() => setEditingBall(null)}
          onSave={(next) => {
            mutate(() => next);
            toast('Ball updated');
          }}
        />
      )}
      {sheet === 'changeBowler' && <BowlerSheet ctx={ctx} mode="change" onClose={() => setSheet(null)} />}
      {sheet === 'customRuns' && <CustomRunsSheet onRuns={(n) => runs(n)} onClose={() => setSheet(null)} />}
      {sheet === 'more' && (
        <Sheet open title="More options" onClose={() => setSheet(null)}>
          <div className="card">
            {(
              [
                ['🏃 5 / 7 / other runs', 'customRuns', canScore],
                ['⇄ Swap strike', 'swap', live && !!cur.striker && !!cur.nonStriker],
                ['🔁 Change bowler (mid-over)', 'changeBowler', canScore],
                ['🩹 Retire batter', 'retire', canScore],
                ['➕ Add player to a team', 'addPlayer', true],
                ['🏏 Change overs', 'overs', true],
                ['⚙️ Match settings', 'settings', true],
                ['🏁 End innings now', 'declare', live && cur.started],
                ['📋 View full scorecard', 'scorecard', true],
                ['🚫 Abandon match (keep in history)', 'abandon', true],
                ['🗑 Delete match', 'delete', true],
              ] as const
            ).map(([label, action, enabled]) => (
              <button
                key={action}
                className="list-item"
                disabled={!enabled}
                onClick={() => {
                  setSheet(null);
                  switch (action) {
                    case 'swap':
                      append({ kind: 'swap', ts: Date.now() });
                      break;
                    case 'declare':
                      void askConfirm({ title: `End ${batTeam.name}'s innings now?`, confirmLabel: 'End innings' }).then(
                        (ok) => ok && append({ kind: 'declare', ts: Date.now() }),
                      );
                      break;
                    case 'scorecard':
                      nav(`/match/${match.id}`);
                      break;
                    case 'abandon':
                      void askConfirm({
                        title: 'Abandon this match?',
                        message: "It stays in match history marked 'abandoned' but doesn't count towards anyone's stats.",
                        confirmLabel: 'Abandon',
                        danger: true,
                      }).then((ok) => {
                        if (!ok) return;
                        mutate((m) => ({ ...m, status: 'abandoned', result: { winner: null, text: 'Match abandoned' } }));
                        nav(`/match/${match.id}`);
                      });
                      break;
                    case 'delete':
                      void askConfirm({
                        title: 'Delete this match?',
                        message: `${match.teams[0].name} v ${match.teams[1].name} moves to the bin and stops counting towards stats. You can restore it from Matches → Bin for ${BIN_DAYS} days.`,
                        confirmLabel: 'Move to bin',
                        danger: true,
                      }).then(async (ok) => {
                        if (!ok) return;
                        await binMatch(matchRef.current!);
                        toast(`Moved to bin — restorable for ${BIN_DAYS} days`);
                        nav('/', { replace: true });
                      });
                      break;
                    default:
                      setSheet(action);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function CustomRunsSheet({ onRuns, onClose }: { onRuns: (n: number) => void; onClose: () => void }) {
  const [n, setN] = useState('');
  const go = (v: number) => {
    onRuns(v);
    onClose();
  };
  return (
    <Sheet open title="Other runs" onClose={onClose}>
      <div className="choice-grid">
        {[5, 7, 8].map((v) => (
          <button key={v} className="choice" style={{ minHeight: 60, fontSize: 18 }} onClick={() => go(v)}>
            {v}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const v = parseInt(n, 10);
          if (v >= 0) go(v);
        }}
      >
        <input className="input" type="number" min={0} placeholder="Custom runs" value={n} onChange={(e) => setN(e.target.value)} />
        <button className="btn primary" type="submit">
          Add
        </button>
      </form>
      <div className="small muted">Runs off the bat, not counted as a boundary (e.g. 4 + overthrow).</div>
    </Sheet>
  );
}

function RecentBalls({ ctx, onEdit }: { ctx: ScoringCtx; onEdit?: (eventIndex: number) => void }) {
  const overs = ctx.cur.overs.slice(-4).reverse();
  if (overs.length === 0) return null;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Recent overs</h2>
      </div>
      {overs.map((o) => (
        <div key={o.overNo} className="over-strip" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="tiny bold" style={{ minWidth: 54 }}>
            Ov {o.overNo + 1}
          </span>
          <span className="tiny muted" style={{ minWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ctx.nameOf(o.bowlerId)}
          </span>
          {o.balls.map((b) =>
            onEdit ? (
              <button key={b.eventIndex} className="ball-btn" onClick={() => onEdit(b.eventIndex)} title="Edit this ball">
                <BallChip ball={b} />
              </button>
            ) : (
              <BallChip key={b.eventIndex} ball={b} />
            ),
          )}
          <span className="tiny muted">= {o.runs}</span>
        </div>
      ))}
      {onEdit && <div className="tiny muted" style={{ padding: '6px 14px 10px' }}>Tap any ball to correct it.</div>}
    </div>
  );
}

function InningsBreak({ match, ctx, onChangeOvers }: { match: Match; ctx: ScoringCtx; onChangeOvers: () => void }) {
  const first = ctx.state.innings[ctx.state.innings.length - 1];
  const chasing = (1 - first.battingTeam) as TeamIdx;
  const bpo = match.rules.ballsPerOver;
  const nextLabel = first.superOver ? `${match.teams[chasing].name}'s super over` : '2nd innings';
  return (
    <div className="page">
      <div className="card card-pad stack center">
        <div className="section-title">{first.superOver ? `${inningsLabel(first.index)} · halfway` : 'Innings break'}</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {match.teams[first.battingTeam].name} {first.runs}/{first.wickets} ({oversText(first.legalBalls, bpo)} ov)
        </div>
        <div>
          <b>{match.teams[chasing].name}</b> need <b>{first.runs + 1}</b> runs from {first.maxBalls} balls
          {first.superOver && <> (2 wickets)</>}
        </div>
        <button
          className="btn primary big block"
          onClick={() =>
            ctx.mutate((m) => ({
              ...m,
              innings: [...m.innings, { battingTeam: chasing, events: [], ...(first.superOver ? { superOver: true } : {}) }],
            }))
          }
        >
          Start {nextLabel}
        </button>
        <div className="grid-2">
          <button className="btn" onClick={ctx.undo}>
            ↶ Undo last ball
          </button>
          <ChangeOversButton ctx={ctx} onClick={onChangeOvers} />
        </div>
      </div>
    </div>
  );
}

function MatchOver({
  match,
  ctx,
  clubPar,
  onChangeOvers,
}: {
  match: Match;
  ctx: ScoringCtx;
  clubPar?: number;
  onChangeOvers: () => void;
}) {
  const nav = useNavigate();
  const mvp = useMemo(() => computeMvp(match, ctx.state, { clubPar }), [match, ctx.state, clubPar]);
  const [motm, setMotm] = useState<string | undefined>(mvp.heroes.potm);
  const finish = () => {
    ctx.mutate((m) => ({ ...m, status: 'completed', result: ctx.state.result!, motmId: motm }));
    toast('Match saved 🏆');
    nav(`/match/${match.id}`, { replace: true });
  };
  const heroes = { ...mvp.heroes, potm: motm, fighter: mvp.heroes.fighter === motm ? undefined : mvp.heroes.fighter };
  const tied = ctx.state.result?.winner === null;
  return (
    <div className="page">
      <div className="card card-pad stack center">
        <div className="section-title">Match over</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-2)' }}>{ctx.state.result?.text}</div>
        {tied && (
          <>
            <div className="small muted">
              Scores are level. Play a super over: {match.teams[ctx.cur.battingTeam].name} bat first, one over, two wickets.
            </div>
            <button className="btn primary big block" onClick={() => ctx.mutate(startSuperOver)}>
              ⚡ Play {ctx.state.innings.length > 2 ? 'another ' : 'a '}super over
            </button>
          </>
        )}
      </div>
      <HeroesCard heroes={heroes} players={mvp.players} nameOf={ctx.nameOf} />
      <div className="card">
        <div className="card-head">
          <h2>MVP · Impact score</h2>
          <span className="tiny muted">tap to change Player of the Match</span>
        </div>
        <MvpTable players={mvp.players} nameOf={ctx.nameOf} selected={motm} onSelect={setMotm} limit={8} />
      </div>
      <button className={`btn ${tied ? '' : 'primary'} big block`} onClick={finish}>
        {tied ? 'Finish as a tie' : 'Finish & save match'}
      </button>
      <div className="grid-2">
        <button className="btn" onClick={ctx.undo}>
          ↶ Undo last ball
        </button>
        <ChangeOversButton ctx={ctx} onClick={onChangeOvers} />
      </div>
    </div>
  );
}
/** Offered when an innings ended on overs: lets the scorer agree to play more (any number). */
function ChangeOversButton({ ctx, onClick }: { ctx: ScoringCtx; onClick: () => void }) {
  if (ctx.cur.completeReason !== 'overs' || ctx.cur.superOver) return <Link className="btn" to={`/match/${ctx.match.id}`}>Scorecard</Link>;
  return (
    <button className="btn" onClick={onClick}>
      ＋ Add overs
    </button>
  );
}
/** Cloud mode: shows whether the latest balls have reached the club database. */
function SyncChip({ pending }: { pending: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  const label = !pending ? '☁ Synced' : online ? '⏳ Syncing' : '📴 Saved on phone';
  const hint = !pending
    ? 'Every ball is saved to the club database'
    : online
      ? 'Uploading the latest balls'
      : 'No signal — balls are saved on this phone and will upload automatically';
  return (
    <span className="sync-chip" title={hint}>
      {label}
    </span>
  );
}