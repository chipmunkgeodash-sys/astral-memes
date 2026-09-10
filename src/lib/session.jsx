import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COL, DEFAULT_ROLES, hasPermission, isOwner as isOwnerProfile } from './schema';

const SessionContext = createContext(null);

// The account document id is NOT always the Firebase Auth uid. The founding
// Owner lives at a fixed id (accounts/zentraa-owner) while their auth uid is
// something else entirely. Auth emails are <local>@accounts.astralmemes.app,
// so the local part is either a username (look the real id up) or the random
// uuid minted at sign-up (in which case the id is just the auth uid).
async function resolveAccountId(user) {
  if (!user) return null;
  const local = String(user.email || '').split('@')[0];
  if (!local) return user.uid;
  try {
    const snap = await getDoc(doc(db, COL.usernames, local.toLowerCase()));
    const mapped = snap.exists() ? snap.data()?.uid : null;
    return mapped || user.uid;
  } catch {
    return user.uid;
  }
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u);
    if (!u) {
      setAccountId(null); setProfile(null); setWallet(null); setReady(true);
      return;
    }
    setAccountId(await resolveAccountId(u));
    setReady(true);
  }), []);

  useEffect(() => {
    if (!accountId) return undefined;
    return onSnapshot(
      doc(db, COL.accounts, accountId),
      (snap) => setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setProfile(null)
    );
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return undefined;
    return onSnapshot(
      doc(db, COL.wallets, accountId),
      (snap) => setWallet(snap.exists() ? { id: snap.id, ...snap.data() } : { balance: 0 }),
      () => setWallet({ balance: 0 })
    );
  }, [accountId]);

  useEffect(() => onSnapshot(
    collection(db, COL.roles),
    (snap) => setRoles(snap.empty ? DEFAULT_ROLES : snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setRoles(DEFAULT_ROLES)
  ), []);

  const can = useCallback((key) => hasPermission(profile, roles, key), [profile, roles]);
  const isOwner = isOwnerProfile(profile);
  const balance = wallet?.balance ?? 0;

  return (
    <SessionContext.Provider value={{
      user,
      // Use this, not user.uid, whenever addressing this member's own documents.
      accountId,
      profile, wallet, balance, roles, ready, can, isOwner,
      signOut: () => signOut(auth)
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
