// Username auth, matching the original exactly.
//
// Firebase Auth needs an email, so each account gets a synthetic one. Crucially
// it is NOT derived from the username: sign-up mints `<uuid>@accounts.astralmemes.app`
// and records it as `authEmail` on the usernames document. Sign-in therefore has
// to look that address up rather than reconstruct it. The founding Owner is the
// one exception and resolves directly.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { COL, AUTH_DOMAIN, FOUNDING_OWNER, FOUNDING_OWNER_EMAIL } from './schema';

export function normalize(username) {
  return String(username || '').trim().toLowerCase();
}

export function isValidUsername(username) {
  return /^[a-zA-Z0-9_.-]{3,20}$/.test(String(username || '').trim());
}

// A fresh synthetic address for a new account.
export function mintAuthEmail() {
  return `${crypto.randomUUID()}@${AUTH_DOMAIN}`;
}

export async function isUsernameTaken(username) {
  const snap = await getDoc(doc(db, COL.usernames, normalize(username)));
  return snap.exists();
}

// Resolve a username to the address Firebase Auth actually knows it by.
export async function resolveAuthEmail(username) {
  const name = normalize(username);
  if (name === FOUNDING_OWNER) return FOUNDING_OWNER_EMAIL;

  const snap = await getDoc(doc(db, COL.usernames, name));
  if (!snap.exists()) return null;
  return snap.data()?.authEmail || null;
}
