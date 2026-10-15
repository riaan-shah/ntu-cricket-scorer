import type { ID } from '../types';

export function CaptainSelect({
  label,
  playerIds,
  value,
  onChange,
  nameOf,
}: {
  label: string;
  playerIds: ID[];
  value: ID | undefined;
  onChange: (id: ID | undefined) => void;
  nameOf: (id: ID) => string;
}) {
  const current = value && playerIds.includes(value) ? value : '';
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={current} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">No captain</option>
        {playerIds.map((id) => (
          <option key={id} value={id}>
            {nameOf(id)}
          </option>
        ))}
      </select>
    </label>
  );
}
