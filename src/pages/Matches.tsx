import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchCard } from '../components/MatchCard';
import { AppBar, Seg } from '../components/ui';
import { useMatches, usePlayerNames } from '../db';

export default function Matches() {
  const matches = useMatches();
  const { nameOf } = usePlayerNames();
  const [filter, setFilter] = useState<'all' | 'live' | 'completed'>('all');
  const list = (matches ?? []).filter((m) => filter === 'all' || m.status === filter);
  return (
    <div>
      <AppBar
        title="Matches"
        back="/"
        right={
          <Link to="/match/new" className="icon-btn" aria-label="New match">
            ＋
          </Link>
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
          ]}
        />
        <div className="card">
          {matches && list.length === 0 && <div className="empty">No matches here yet.</div>}
          {list.map((m) => (
            <MatchCard key={m.id} match={m} nameOf={nameOf} />
          ))}
        </div>
      </div>
    </div>
  );
}
