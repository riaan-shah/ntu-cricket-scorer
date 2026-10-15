import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchCard } from '../components/MatchCard';
import { AppBar, askConfirm, Seg, toast } from '../components/ui';
import { useAuth } from '../data/auth';
import {
  BIN_DAYS,
  binDaysLeft,
  deleteMatchForever,
  purgeExpiredBin,
  restoreMatch,
  useBin,
  useMatches,
  usePlayerNames,
} from '../db';

type Filter = 'all' | 'live' | 'completed' | 'bin';

export default function Matches() {
  const matches = useMatches();
  const bin = useBin();
  const { nameOf } = usePlayerNames();
  const { canScore, isAdmin } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const list = (matches ?? []).filter((m) => filter === 'all' || m.status === filter);

  // Anything binned more than 30 days ago is removed for good.
  useEffect(() => {
    if (canScore && bin.some((m) => binDaysLeft(m) === 0)) void purgeExpiredBin(bin);
  }, [canScore, bin]);

  return (
    <div>
      <AppBar
        title="Matches"
        back="/"
        right={
          canScore ? (
            <Link to="/match/new" className="icon-btn" aria-label="New match">
              ＋
            </Link>
          ) : undefined
        }
      />
      <div className="page">
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'live', label: 'Live' },
            { value: 'completed', label: 'Completed' },
            ...(canScore ? [{ value: 'bin' as const, label: `🗑 Bin${bin.length ? ` (${bin.length})` : ''}` }] : []),
          ]}
        />

        {filter !== 'bin' ? (
          <div className="card">
            {matches && list.length === 0 && <div className="empty">No matches here yet.</div>}
            {list.map((m) => (
              <MatchCard key={m.id} match={m} nameOf={nameOf} />
            ))}
          </div>
        ) : (
          <>
            <div className="small muted">
              Deleted matches stay here for {BIN_DAYS} days and don't count towards stats. Restore one to bring it back.
            </div>
            <div className="card">
              {bin.length === 0 && <div className="empty">The bin is empty.</div>}
              {bin.map((m) => {
                const days = binDaysLeft(m);
                return (
                  <div key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <MatchCard match={m} nameOf={nameOf} />
                    <div className="row" style={{ padding: '0 14px 12px' }}>
                      <span className="tiny muted" style={{ flex: 1 }}>
                        Deleted for good in {days} day{days === 1 ? '' : 's'}
                      </span>
                      <button
                        className="btn sm primary"
                        onClick={async () => {
                          await restoreMatch(m);
                          toast('Match restored');
                        }}
                      >
                        ↺ Restore
                      </button>
                      {isAdmin && (
                        <button
                          className="btn sm danger"
                          onClick={async () => {
                            const ok = await askConfirm({
                              title: 'Delete forever?',
                              message: `${m.teams[0].name} v ${m.teams[1].name} (${m.date}) and every ball in it will be removed permanently.`,
                              confirmLabel: 'Delete forever',
                              danger: true,
                            });
                            if (!ok) return;
                            await deleteMatchForever(m.id);
                            toast('Deleted permanently');
                          }}
                        >
                          Delete forever
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
