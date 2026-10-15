import { Link } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { toast } from './ui';

/** Small sign-in / account button for app bars (cloud mode only). */
export function AccountButton() {
  const auth = useAuth();
  if (auth.mode === 'local' || !auth.ready) return null;
  if (!auth.user) {
    return (
      <button className="icon-btn" onClick={() => auth.signIn().catch((e) => toast(`Sign-in failed: ${e.message}`))}>
        Sign in
      </button>
    );
  }
  return (
    <Link to="/settings" className="icon-btn" title={`${auth.user.email} (${auth.role})`}>
      {auth.user.photo ? (
        <img src={auth.user.photo} alt="" width={30} height={30} style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
      ) : (
        '👤'
      )}
    </Link>
  );
}

/** Shown where a scorer-only action would be, explaining how to get access. */
export function ScorerOnly({ what = 'score matches' }: { what?: string }) {
  const auth = useAuth();
  if (!auth.ready) return null;
  return (
    <div className="card card-pad stack center">
      <div className="bold">Only approved scorers can {what}</div>
      {!auth.user ? (
        <>
          <div className="small muted">Sign in with the Google account a club admin added to the scorer list.</div>
          <button className="btn primary" onClick={() => auth.signIn().catch((e) => toast(`Sign-in failed: ${e.message}`))}>
            Sign in with Google
          </button>
        </>
      ) : auth.unclaimed ? (
        <>
          <div className="small muted">This club has no admin yet. Claim it in Settings to become the first admin.</div>
          <Link className="btn primary" to="/settings">
            Go to Settings
          </Link>
        </>
      ) : (
        <div className="small muted">
          You're signed in as <b>{auth.user.email}</b>. Ask a club admin to add this email to the scorer list.
        </div>
      )}
    </div>
  );
}
