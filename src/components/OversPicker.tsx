const PRESETS = [2, 3, 4, 5, 6, 8, 10, 12];

/** Big overs selector: −/+ around the number plus one-tap common choices. */
export function OversPicker({
  value,
  onChange,
  min = 1,
  max = 50,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="overs-picker">
      <div className="op-main">
        <button type="button" className="op-btn" onClick={() => set(value - 1)} disabled={value <= min} aria-label="One fewer over">
          −
        </button>
        <div className="op-value">
          <b>{value}</b>
          <span>over{value === 1 ? '' : 's'} a side</span>
        </div>
        <button type="button" className="op-btn" onClick={() => set(value + 1)} disabled={value >= max} aria-label="One more over">
          +
        </button>
      </div>
      <div className="op-presets">
        {PRESETS.filter((n) => n >= min && n <= max).map((n) => (
          <button key={n} type="button" className={`choice ${n === value ? 'on' : ''}`} onClick={() => set(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
