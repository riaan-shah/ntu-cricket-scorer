import { Link } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { timeAgo } from '../data/lock';
import { useBackupStatus } from '../db';

const DAY = 86_400_000;
/** Off-site backup runs every Saturday; warn if the last good run is older than this. */
export const BACKUP_STALE_DAYS = 8;

export interface HealthIssue {
  level: 'warn' | 'info';
  text: string;
}

/** Things an admin should act on: the weekly off-site backup and the admin list. */
export function useAdminHealth(): { issues: HealthIssue[]; statusLine: string | null } {
  const auth = useAuth();
  const status = useBackupStatus();
  const issues: HealthIssue[] = [];
  if (auth.mode !== 'cloud' || !auth.isAdmin) return { issues, statusLine: null };

  if (auth.access && auth.access.admins.length < 2) {
    issues.push({
      level: 'warn',
      text: 'Only one admin. Add a second admin in Settings → Scorers & admins so the club can never be locked out.',
    });
  }
  let statusLine: string | null = null;
  if (!status) {
    issues.push({ level: 'info', text: "Weekly off-site backup isn't set up yet (Settings → Backups & restore)." });
  } else {
    const when = new Date(status.lastRunAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    statusLine = status.ok
      ? `Last off-site backup: ${when} ✓ (${timeAgo(status.lastRunAt)})`
      : `Last off-site backup FAILED: ${when}`;
    if (!status.ok) issues.push({ level: 'warn', text: `The last weekly off-site backup failed (${when}). ${status.message ?? ''}`.trim() });
    else if (Date.now() - status.lastRunAt > BACKUP_STALE_DAYS * DAY) {
      issues.push({ level: 'warn', text: `The weekly off-site backup is overdue: last successful run ${timeAgo(status.lastRunAt)}.` });
    }
  }
  return { issues, statusLine };
}

/** Compact warnings for the home screen: only things that need action. */
export function AdminHealthBanner() {
  const { issues } = useAdminHealth();
  const warns = issues.filter((i) => i.level === 'warn');
  if (!warns.length) return null;
  return (
    <Link to="/backups" className="upload-off" style={{ display: 'block' }}>
      {warns.map((w) => (
        <div key={w.text}>⚠️ {w.text}</div>
      ))}
    </Link>
  );
}
