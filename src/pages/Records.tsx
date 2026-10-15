import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppBar, Avatar, Empty } from '../components/ui';
import { useMatches, usePlayerNames } from '../db';
import { oversText } from '../engine/engine';
import { computeRecords } from '../engine/records';
import { pairRecords } from '../engine/insights';

function Section({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      {empty ? <div className="empty small">No record yet</div> : children}
    </div>
  );
}

function Row({
  rank,
  to,
  avatar,
  title,
  sub,
  value,
}: {
  rank: number;
  to?: string;
  avatar?: string;
  title: ReactNode;
  sub: ReactNode;
  value: ReactNode;
}) {
  const body = (
    <>
      <span className="bold" style={{ width: 18, color: rank === 1 ? 'var(--gold)' : 'var(--muted)' }}>
        {rank}
      </span>
      {avatar && <Avatar name={avatar} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="bold">{title}</div>
        <div className="tiny muted">{sub}</div>
      </div>
      <span style={{ fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap' }}>{value}</span>
    </>
  );
  return to ? (
    <Link to={to} className="list-item">
      {body}
    </Link>
  ) : (
    <div className="list-item" style={{ cursor: 'default' }}>
      {body}
    </div>
  );
}

export default function Records() {
  const matches = useMatches();
  const { nameOf } = usePlayerNames();
  const r = useMemo(() => computeRecords(matches ?? []), [matches]);
  const pairs = useMemo(() => pairRecords(matches ?? []).slice(0, 5), [matches]);
  const m = (id: string) => `/match/${id}`;

  return (
    <div>
      <AppBar title="Club records" back="/" />
      <div className="page">
        {r.matches === 0 ? (
          <Empty>Records appear once matches are completed.</Empty>
        ) : (
          <>
            <div className="small muted">
              From {r.matches} completed match{r.matches === 1 ? '' : 'es'}. Super overs and the bin aren't counted.
            </div>

            <Section title="Highest team totals" empty={!r.highestTotals.length}>
              {r.highestTotals.map((t, i) => (
                <Row
                  key={t.matchId + t.team}
                  rank={i + 1}
                  to={m(t.matchId)}
                  title={t.team}
                  sub={`v ${t.opponent} · ${t.date} · ${oversText(t.balls, t.bpo)} ov`}
                  value={`${t.runs}/${t.wickets}`}
                />
              ))}
            </Section>

            <Section title="Highest individual scores" empty={!r.highestScores.length}>
              {r.highestScores.map((s, i) => (
                <Row
                  key={s.matchId + s.playerId + i}
                  rank={i + 1}
                  to={m(s.matchId)}
                  avatar={nameOf(s.playerId)}
                  title={nameOf(s.playerId)}
                  sub={`v ${s.opponent} · ${s.date} · ${s.secondary} balls`}
                  value={`${s.primary}${s.notOut ? '*' : ''}`}
                />
              ))}
            </Section>

            <Section title="Best bowling figures" empty={!r.bestFigures.length}>
              {r.bestFigures.map((f, i) => (
                <Row
                  key={f.matchId + f.playerId + i}
                  rank={i + 1}
                  to={m(f.matchId)}
                  avatar={nameOf(f.playerId)}
                  title={nameOf(f.playerId)}
                  sub={`v ${f.opponent} · ${f.date} · ${oversText(f.balls ?? 0, f.bpo)} ov`}
                  value={`${f.primary}/${f.secondary}`}
                />
              ))}
            </Section>

            <Section title="Biggest wins (by runs)" empty={!r.biggestWinsByRuns.length}>
              {r.biggestWinsByRuns.map((w, i) => (
                <Row
                  key={w.matchId}
                  rank={i + 1}
                  to={m(w.matchId)}
                  title={`${w.winner} beat ${w.loser}`}
                  sub={w.date}
                  value={`${w.margin} run${w.margin === 1 ? '' : 's'}`}
                />
              ))}
            </Section>

            <Section title="Biggest wins (chasing)" empty={!r.biggestWinsByWickets.length}>
              {r.biggestWinsByWickets.map((w, i) => (
                <Row
                  key={w.matchId}
                  rank={i + 1}
                  to={m(w.matchId)}
                  title={`${w.winner} beat ${w.loser}`}
                  sub={`${w.date} · ${w.ballsLeft} ball${w.ballsLeft === 1 ? '' : 's'} left`}
                  value={`${w.margin} wkt${w.margin === 1 ? '' : 's'}`}
                />
              ))}
            </Section>

            <Section title="Best partnerships" empty={!r.bestPartnerships.length}>
              {r.bestPartnerships.map((p, i) => (
                <Row
                  key={p.matchId + p.batterIds.join() + i}
                  rank={i + 1}
                  to={m(p.matchId)}
                  title={p.batterIds.map((id) => nameOf(id)).join(' & ')}
                  sub={`${p.team} · ${p.date} · ${p.balls} balls`}
                  value={p.runs}
                />
              ))}
            </Section>

            <Section title="Best pairs · most runs together" empty={!pairs.length}>
              {pairs.map((p, i) => (
                <Row
                  key={p.ids.join()}
                  rank={i + 1}
                  title={p.ids.map((id) => nameOf(id)).join(' & ')}
                  sub={`${p.innings} stand${p.innings === 1 ? '' : 's'} · avg ${(p.runs / p.innings).toFixed(1)} · best ${p.best}${p.big ? ` · ${p.big}× 30+` : ''}`}
                  value={p.runs}
                />
              ))}
            </Section>

            <Section title="Most sixes in an innings" empty={!r.mostSixesInnings.length}>
              {r.mostSixesInnings.map((s, i) => (
                <Row
                  key={s.matchId + s.playerId + i}
                  rank={i + 1}
                  to={m(s.matchId)}
                  avatar={nameOf(s.playerId)}
                  title={nameOf(s.playerId)}
                  sub={`v ${s.opponent} · ${s.date} · ${s.secondary} runs`}
                  value={`${s.primary} × 6`}
                />
              ))}
            </Section>

            <Section title="🙈 Out of cage — most dismissals (career)" empty={!r.outOfCageCareer.length}>
              {r.outOfCageCareer.map((c, i) => (
                <Row
                  key={c.id}
                  rank={i + 1}
                  to={`/players/${c.id}`}
                  avatar={nameOf(c.id)}
                  title={nameOf(c.id)}
                  sub="times hit out of the cage"
                  value={c.count}
                />
              ))}
            </Section>

            <Section title="🙈 Out of cage — most in one innings" empty={!r.outOfCageInnings.length}>
              {r.outOfCageInnings.map((c, i) => (
                <Row key={c.id} rank={i + 1} to={m(c.matchId!)} title={c.label} sub={c.date} value={c.count} />
              ))}
            </Section>

            <Section title="Lowest completed totals" empty={!r.lowestTotals.length}>
              {r.lowestTotals.map((t, i) => (
                <Row
                  key={t.matchId + t.team}
                  rank={i + 1}
                  to={m(t.matchId)}
                  title={t.team}
                  sub={`v ${t.opponent} · ${t.date} · ${oversText(t.balls, t.bpo)} ov`}
                  value={`${t.runs}/${t.wickets}`}
                />
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
