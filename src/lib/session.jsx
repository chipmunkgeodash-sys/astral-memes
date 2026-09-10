import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COL, hasPermission } from './schema';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [roles, setRoles] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (!u) { setProfile(null); setWallet(null); }
    setReady(true);
  }), []);

  // Live account document.
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, COL.accounts, user.uid), async (snap) => {
      if (snap.exists()) { setProfile({ id: snap.id, ...snap.data() }); return; }
      // First sign-in for this uid: create the account row.
      await setDoc(doc(db, COL.accounts, user.uid), {
        displayName: user.displayName || 'Astral member',
        bio: '',
        owner: false,
        roles: [],
        createdAt: serverTimestamp()
      }, { merge: true });
    }, () => setProfile(null));
  }, [user]);

  // Live wallet document (coin balances).
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, COL.wallets, user.uid), (snap) => {
      setWallet(snap.exists() ? { id: snap.id, ...snap.data() } : { coins: 0, banked: 0 });
    }, () => setWallet({ coins: 0, banked: 0 }));
  }, [user]);

  // Roles are public — everyone can see what each role includes.
  useEffect(() => onSnapshot(collection(db, COL.roles),
    (snap) => setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setRoles([])
  ), []);

  const can = useCallback((key) => hasPermission(profile, roles, key), [profile, roles]);
  const isOwner = !!profile?.owner;

  return (
    <SessionContext.Provider value={{
      user, profile, wallet, roles, ready, can, isOwner,
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
