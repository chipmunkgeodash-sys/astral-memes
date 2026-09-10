import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COL, DEFAULT_ROLES, hasPermission, isOwner as isOwnerProfile } from './schema';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (!u) { setProfile(null); setWallet(null); }
    setReady(true);
  }), []);

  // Read only. Sign-up owns document creation.
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      doc(db, COL.accounts, user.uid),
      (snap) => setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setProfile(null)
    );
  }, [user]);

  // wallets/{uid} = { balance, lastSettledEntryId, lastRedemptionId, updatedAt }
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      doc(db, COL.wallets, user.uid),
      (snap) => setWallet(snap.exists() ? { id: snap.id, ...snap.data() } : { balance: 0 }),
      () => setWallet({ balance: 0 })
    );
  }, [user]);

  // Roles are public. Fall back to the seeded set if the collection is empty so
  // role names and colours still render.
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
      user, profile, wallet, balance, roles, ready, can, isOwner,
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
