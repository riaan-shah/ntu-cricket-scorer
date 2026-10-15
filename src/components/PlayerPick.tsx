import { useState, type ReactNode } from 'react';
import { createPlayer } from '../db';
import type { ID, Player } from '../types';
import { Avatar, toast } from './ui';

export interface PickOption {
  id: ID;
  sub?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export function PlayerPickList({
  options,
  selected,
  onPick,
  nameOf,
  empty = 'No players available',
}: {
  options: PickOption[];
  selected?: ID | null;
  onPick: (id: ID) => void;
  nameOf: (id: ID) => string;
  empty?: ReactNode;
}) {
  if (options.length === 0) return <div className="empty small">{empty}</div>;
  return (
    <div className="card">
      {options.map((o) => (
        <button
          key={o.id}
          className={`list-item ${selected === o.id ? 'selected' : ''}`}
          disabled={o.disabled}
          onClick={() => onPick(o.id)}
        >
          <Avatar name={nameOf(o.id)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bold">{nameOf(o.id)}</div>
            {o.sub && <div className="small muted">{o.sub}</div>}
          </div>
          {o.badge}
          {selected === o.id && <span style={{ color: 'var(--brand-2)', fontWeight: 800 }}>✓</span>}
        </button>
      ))}
    </div>
  );
}

/** Quick-add a brand new player profile by name (used mid-match when someone turns up). */
export function NewPlayerInline({
  players,
  onAdd,
  label = 'Add a new player',
}: {
  players: Player[];
  onAdd: (p: Player) => void;
  label?: string;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const existing = players.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const submit = async () => {
    if (!trimmed) return;
    // Clear before awaiting so fast typists don't lose the next name.
    setName('');
    if (existing) {
      onAdd(existing);
    } else {
      const p = await createPlayer(trimmed);
      toast(`${p.name} added to club roster`);
      onAdd(p);
    }
  };
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        className="input"
        placeholder={label}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={label}
      />
      <button className="btn primary" type="submit" disabled={!trimmed}>
        {existing ? 'Use' : 'Add'}
      </button>
    </form>
  );
}
