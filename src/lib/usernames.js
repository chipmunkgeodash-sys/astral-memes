// Username-based auth. Firebase Auth requires an email, so each username is
// mapped to a synthetic one and the real mapping lives in the `usernames`
// collection. Members only ever type a username and a password.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from './schema';

const DOMAIN = 'astral-memes.app';

export function normalize(username) {
  return String(username || '').trim().toLowerCase();
}

export function isValidUsername(username) {
  return /^[a-z0-9_.-]{3,20}$/.test(normalize(username));
}

export function usernameToEmail(username) {
  return `${normalize(username)}@${DOMAIN}`;
}

// A username doc is keyed by the normalized name so uniqueness is enforced by
// document id rather than by a query.
export async function isUsernameTaken(username) {
  const snap = await getDoc(doc(db, COL.usernames, normalize(username)));
  return snap.exists();
}

export async function claimUsername(username, uid) {
  await setDoc(doc(db, COL.usernames, normalize(username)), {
    uid,
    username: normalize(username),
    createdAt: serverTimestamp()
  });
}

export async function lookupUid(username) {
  const snap = await getDoc(doc(db, COL.usernames, normalize(username)));
  return snap.exists() ? snap.data().uid : null;
}
