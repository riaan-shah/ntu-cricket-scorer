import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cloudEnabled, firebaseApp, firestore } from './cloud';

export type Role = 'viewer' | 'scorer' | 'admin';

/** Stored at config/access — only readable by scorers, so the scorer list isn't public. */
export interface Access {
  admins: string[];
  scorers: string[];
}

export interface AuthState {
  mode: 'local' | 'cloud';
  /** Cloud mode: false until we know who is signed in. */
  ready: boolean;
  user: { email: string; name: string; photo?: string } | null;
  role: Role;
  canScore: boolean;
  isAdmin: boolean;
  /** Cloud mode with no admin yet: the first signed-in person can claim the club. */
  unclaimed: boolean;
  access: Access | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  claimClub(): Promise<void>;
  saveAccess(a: Access): Promise<void>;
}

const noop = async () => {};

const LOCAL: AuthState = {
  mode: 'local',
  ready: true,
  user: null,
  role: 'admin',
  canScore: true,
  isAdmin: true,
  unclaimed: false,
  access: null,
  signIn: noop,
  signOut: noop,
  claimClub: noop,
  saveAccess: noop,
};

const AuthContext = createContext<AuthState>(LOCAL);

export const useAuth = () => useContext(AuthContext);

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!cloudEnabled) return <AuthContext.Provider value={LOCAL}>{children}</AuthContext.Provider>;
  return <CloudAuthProvider>{children}</CloudAuthProvider>;
}

function CloudAuthProvider({ children }: { children: ReactNode }) {
  const auth = useMemo(() => getAuth(firebaseApp()), []);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthState['user']>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [unclaimed, setUnclaimed] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(
          u?.email
            ? { email: normalizeEmail(u.email), name: u.displayName ?? u.email, photo: u.photoURL ?? undefined }
            : null,
        );
        setReady(true);
      }),
    [auth],
  );

  useEffect(() => {
    setAccess(null);
    setUnclaimed(false);
    if (!user) return;
    return onSnapshot(
      doc(firestore(), 'config', 'access'),
      (snap) => {
        if (!snap.exists()) {
          setUnclaimed(true);
          setAccess(null);
        } else {
          setUnclaimed(false);
          setAccess(snap.data() as Access);
        }
      },
      // permission-denied = signed in but not on the scorer list.
      () => setAccess(null),
    );
  }, [user]);

  const role: Role = !user || !access
    ? 'viewer'
    : access.admins.includes(user.email)
      ? 'admin'
      : access.scorers.includes(user.email)
        ? 'scorer'
        : 'viewer';

  const value: AuthState = {
    mode: 'cloud',
    ready,
    user,
    role,
    canScore: role !== 'viewer',
    isAdmin: role === 'admin',
    unclaimed,
    access,
    signIn: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider);
        } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          throw e;
        }
      }
    },
    signOut: () => fbSignOut(auth),
    claimClub: async () => {
      if (!user) return;
      await setDoc(doc(firestore(), 'config', 'access'), { admins: [user.email], scorers: [] });
    },
    saveAccess: async (a) => {
      const clean = (xs: string[]) => [...new Set(xs.map(normalizeEmail).filter((x) => x.includes('@')))];
      const admins = clean([...(user ? [user.email] : []), ...a.admins]); // can't remove yourself
      await setDoc(doc(firestore(), 'config', 'access'), {
        admins,
        scorers: clean(a.scorers).filter((s) => !admins.includes(s)),
      });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
