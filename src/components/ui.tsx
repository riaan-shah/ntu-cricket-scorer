import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { initials } from '../engine/format';
import type { BallView } from '../engine/engine';

export function AppBar({
  title,
  back,
  right,
}: {
  title: ReactNode;
  back?: string | true | (() => void);
  right?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <header className="appbar">
      {back && (
        <button
          className="icon-btn"
          aria-label="Back"
          onClick={() => (typeof back === 'function' ? back() : back === true ? nav(-1) : nav(back))}
        >
          ←
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: ReactNode;
  /** Omit to make the sheet mandatory (no backdrop dismiss / close button). */
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          {onClose && (
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-body" style={{ paddingTop: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

const AVATAR_COLORS = ['#14716f', '#e0483e', '#1e7fd8', '#8b2fc9', '#e08a00', '#2f8f4e', '#c2185b', '#5d6d7e'];

export function Avatar({ name, size }: { name: string; size?: 'lg' }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}>
      {initials(name) || '?'}
    </span>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div className="text">
        <div>{label}</div>
        {hint && <div className="small muted">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease">
        −
      </button>
      <output>{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase">
        +
      </button>
    </div>
  );
}

export function StepperRow({
  label,
  hint,
  ...rest
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="toggle-row">
      <div className="text">
        <div>{label}</div>
        {hint && <div className="small muted">{hint}</div>}
      </div>
      <Stepper {...rest} />
    </div>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BallChip({ ball }: { ball: Pick<BallView, 'label' | 'tone'> }) {
  return <span className={`ball ${ball.tone}`}>{ball.label}</span>;
}

// ---------- Toast ----------

let pushToast: ((msg: string) => void) | null = null;

export function toast(msg: string) {
  pushToast?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    pushToast = (m) => {
      setMsg(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2400);
    };
    return () => {
      pushToast = null;
      clearTimeout(timer);
    };
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ---------- Confirm dialog ----------
// In-app replacement for window.confirm(), which some browsers block silently (in-app browsers such as WhatsApp's,
// some installed web apps) — there it returns false without showing anything, so the action just never happens.

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

let openConfirm: ((o: ConfirmOptions) => Promise<boolean>) | null = null;

export function askConfirm(o: ConfirmOptions): Promise<boolean> {
  return openConfirm ? openConfirm(o) : Promise.resolve(window.confirm(o.title));
}

export function ConfirmHost() {
  const [req, setReq] = useState<{ o: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  useEffect(() => {
    openConfirm = (o) => new Promise<boolean>((resolve) => setReq({ o, resolve }));
    return () => {
      openConfirm = null;
    };
  }, []);
  if (!req) return null;
  const done = (v: boolean) => {
    req.resolve(v);
    setReq(null);
  };
  return (
    <Sheet open title={req.o.title} onClose={() => done(false)}>
      {req.o.message && <div className="small">{req.o.message}</div>}
      <div className="grid-2">
        <button className="btn" onClick={() => done(false)}>
          Cancel
        </button>
        <button className={`btn ${req.o.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>
          {req.o.confirmLabel ?? 'OK'}
        </button>
      </div>
    </Sheet>
  );
}