import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppBar, BallChip, Sheet, toast } from '../../components/ui';
import { saveMatch, useMatch, usePlayerNames } from '../../db';
import {
  computeMatch,
  economy,
  oversText,
  oversTextFull,
  runRate,
  strikeRate,
  undoLast,
} from '../../engine/engine';
import { computeMvp, currentPressure } from '../../engine/impact';
import { HeroesCard, MvpTable, PressureBadge } from '../../components/Mvp';
import type { ExtraType, Match, ScoreEvent, TeamIdx } from '../../types';
import {
  AddPlayerSheet,
  BatterSheet,
  BowlerSheet,
  ExtrasSheet,
  MatchSettingsSheet,
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
  | 'customRuns';

export default function Scoring() {
  const { id } = useParams();
  const nav = useNavigate();
  const stored = useMatch(id);
  const { players, nameOf } = usePlayerNames();
  const [match, setMatch] = useState<Match | null>(null);
  const matchRef = useRef<Match | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [hideForced, setHideForced] = useState(false);

  useEffect(() => {
    if (stored && !matchRef.current) {
      matchRef.current = stored;
      setMatch(stored);
    }
  }, [stored]);

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
  if (!match || !state) return null;
  if (match.status !== 'live') return <Navigate to={`/match/${match.id}`} replace />;

  const mutate = (fn: (m: Match) => Match) => {
    const next = fn(matchRef.current!);
    matchRef.current = next;
    setMatch(next);
    void saveMatch(next);
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
  const canScore = live && !cur.needs;

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

  const forced = live && !hideForced ? cur.needs : null;
  const pressure = currentPressure(match, state);
  const closeForced = () => setHideForced(true);

  return (
    <div>
      <AppBar
        title={`${match.teams[0].name} v ${match.teams[1].name}`}
        back="/"
        right={
          <>
            <Link className="icon-btn" to={`/match/${match.id}`} title="Scorecard">
              📋
            </Link>
            <button className="icon-btn" onClick={() => setSheet('more')} aria-label="More">
              ⋮
            </button>
          </>
        }
      />

      {/* ---------- Score header ---------- */}
      <div className="score-hero">
        <div className="team">
          {batTeam.name} · {cur.index === 0 ? '1st' : '2nd'} innings
        </div>
        <div className="big">
          {cur.runs}/{cur.wickets}
          <small>
            ({oversTextFull(cur.legalBalls, bpo)}/{rules.overs})
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

      {state.phase === 'break' && <InningsBreak match={match} ctx={ctx} />}
      {state.phase === 'result' && <MatchOver match={match} ctx={ctx} />}

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
              {showOver?.balls.map((b) => <BallChip key={b.eventIndex} ball={b} />)}
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

          <RecentBalls ctx={ctx} />
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
                ['⚙️ Match settings / increase overs', 'settings', true],
                ['🏁 End innings now', 'declare', live && cur.started],
                ['📋 View full scorecard', 'scorecard', true],
                ['🗑 Abandon match', 'abandon', true],
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
                      if (confirm(`End ${batTeam.name}'s innings now?`)) append({ kind: 'declare', ts: Date.now() });
                      break;
                    case 'scorecard':
                      nav(`/match/${match.id}`);
                      break;
                    case 'abandon':
                      if (confirm('Abandon this match? It will be kept in history but not count towards stats.')) {
                        mutate((m) => ({ ...m, status: 'abandoned', result: { winner: null, text: 'Match abandoned' } }));
                        nav(`/match/${match.id}`);
                      }
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

function RecentBalls({ ctx }: { ctx: ScoringCtx }) {
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
          {o.balls.map((b) => (
            <BallChip key={b.eventIndex} ball={b} />
          ))}
          <span className="tiny muted">= {o.runs}</span>
        </div>
      ))}
    </div>
  );
}

function InningsBreak({ match, ctx }: { match: Match; ctx: ScoringCtx }) {
  const first = ctx.state.innings[0];
  const chasing = (1 - first.battingTeam) as TeamIdx;
  const bpo = match.rules.ballsPerOver;
  return (
    <div className="page">
      <div className="card card-pad stack center">
        <div className="section-title">Innings break</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {match.teams[first.battingTeam].name} {first.runs}/{first.wickets} ({oversText(first.legalBalls, bpo)} ov)
        </div>
        <div>
          <b>{match.teams[chasing].name}</b> need <b>{first.runs + 1}</b> runs from {match.rules.overs * bpo} balls
        </div>
        <button
          className="btn primary big block"
          onClick={() =>
            ctx.mutate((m) => ({ ...m, innings: [...m.innings, { battingTeam: chasing, events: [] }] }))
          }
        >
          Start 2nd innings
        </button>
        <div className="grid-2">
          <button className="btn" onClick={ctx.undo}>
            ↶ Undo last ball
          </button>
          <AddOverButton ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

function MatchOver({ match, ctx }: { match: Match; ctx: ScoringCtx }) {
  const nav = useNavigate();
  const mvp = useMemo(() => computeMvp(match, ctx.state), [match, ctx.state]);
  const [motm, setMotm] = useState<string | undefined>(mvp.heroes.potm);
  const finish = () => {
    ctx.mutate((m) => ({ ...m, status: 'completed', result: ctx.state.result!, motmId: motm }));
    toast('Match saved 🏆');
    nav(`/match/${match.id}`, { replace: true });
  };
  const heroes = { ...mvp.heroes, potm: motm, fighter: mvp.heroes.fighter === motm ? undefined : mvp.heroes.fighter };
  return (
    <div className="page">
      <div className="card card-pad stack center">
        <div className="section-title">Match over</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-2)' }}>{ctx.state.result?.text}</div>
      </div>
      <HeroesCard heroes={heroes} players={mvp.players} nameOf={ctx.nameOf} />
      <div className="card">
        <div className="card-head">
          <h2>MVP · Impact score</h2>
          <span className="tiny muted">tap to change Player of the Match</span>
        </div>
        <MvpTable players={mvp.players} nameOf={ctx.nameOf} selected={motm} onSelect={setMotm} limit={8} />
      </div>
      <button className="btn primary big block" onClick={finish}>
        Finish & save match
      </button>
      <div className="grid-2">
        <button className="btn" onClick={ctx.undo}>
          ↶ Undo last ball
        </button>
        <AddOverButton ctx={ctx} />
      </div>
    </div>
  );
}
function AddOverButton({ ctx }: { ctx: ScoringCtx }) {
  if (ctx.cur.completeReason !== 'overs') return <Link className="btn" to={`/match/${ctx.match.id}`}>Scorecard</Link>;
  return (
    <button className="btn" onClick={() => ctx.mutate((m) => ({ ...m, rules: { ...m.rules, overs: m.rules.overs + 1 } }))}>
      + Add an over
    </button>
  );
}
