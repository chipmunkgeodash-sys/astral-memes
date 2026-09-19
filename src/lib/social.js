import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  arrayRemove, arrayUnion, collection, doc, onSnapshot, serverTimestamp, updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from './schema';

// Shared bits for the social features: following, saving, presence, streaks.

export const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);

export function formatWhen(ts) {
  const at = millis(ts);
  if (!at) return 'just now';
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------- accounts */

// Every member, live, from one shared listener. Many components need the list
// (members, rankings, hover cards, titles), so they subscribe to this store
// instead of each opening their own connection.
let accountsValue = null;
let accountsById = new Map();
let unsubscribe = null;
let idleTimer = null;
const subscribers = new Set();

function startAccounts() {
  if (unsubscribe) return;
  unsubscribe = onSnapshot(
    collection(db, COL.accounts),
    (snap) => {
      accountsValue = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      accountsById = new Map(accountsValue.map((a) => [a.id, a]));
      subscribers.forEach((fn) => fn());
    },
    () => { accountsValue = []; accountsById = new Map(); subscribers.forEach((fn) => fn()); }
  );
}

function subscribeAccounts(fn) {
  clearTimeout(idleTimer);
  subscribers.add(fn);
  startAccounts();
  return () => {
    subscribers.delete(fn);
    // Keep the listener briefly so hopping between pages doesn't reconnect.
    if (!subscribers.size) {
      idleTimer = setTimeout(() => {
        if (!subscribers.size && unsubscribe) { unsubscribe(); unsubscribe = null; }
      }, 30_000);
    }
  };
}

export function useAccounts() {
  return useSyncExternalStore(subscribeAccounts, () => accountsValue, () => null);
}

export function useAccount(id) {
  useAccounts();
  return id ? accountsById.get(id) || null : null;
}

export const followersOf = (accounts, id) => (accounts || []).filter((a) => (a.following || []).includes(id));

export function setFollowing(me, target, follow) {
  return updateDoc(doc(db, COL.accounts, me), {
    following: follow ? arrayUnion(target) : arrayRemove(target)
  });
}

export function setSaved(me, postId, save) {
  return updateDoc(doc(db, COL.accounts, me), {
    saved: save ? arrayUnion(postId) : arrayRemove(postId)
  });
}

export function setMuted(me, target, mute) {
  return updateDoc(doc(db, COL.accounts, me), {
    muted: mute ? arrayUnion(target) : arrayRemove(target)
  });
}

// Blocking also mutes, so everything that already respects mutes hides them;
// on top of that blocked members' chat messages and guestbook notes are hidden.
export function setBlocked(me, target, block) {
  return updateDoc(doc(db, COL.accounts, me), block
    ? { blocked: arrayUnion(target), muted: arrayUnion(target) }
    : { blocked: arrayRemove(target), muted: arrayRemove(target) });
}

export function setFollowingTag(me, tag, follow) {
  return updateDoc(doc(db, COL.accounts, me), {
    followedTags: follow ? arrayUnion(tag) : arrayRemove(tag)
  });
}

// Words a member doesn't want to see; posts containing any are hidden.
export const hasMutedWord = (text, words) => {
  if (!words?.length || !text) return false;
  const lower = text.toLowerCase();
  return words.some((w) => w && lower.includes(w.toLowerCase()));
};

export const fullDate = (ts) => (millis(ts) ? new Date(millis(ts)).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }) : '');

/* ------------------------------------------------------------- presence */

// Someone counts as online if their tab checked in within this window.
export const ONLINE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 2 * 60 * 1000;

export const isOnline = (account) => !!account && !account.invisible && Date.now() - millis(account.lastSeen) < ONLINE_MS;

// After this long with no mouse, key or touch input a tab counts as away.
const IDLE_MS = 10 * 60 * 1000;

/* --------------------------------------------------------------- streak */

export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayKey = () => dayKey(new Date());
export const yesterdayKey = () => dayKey(new Date(Date.now() - 86400000));
export const isToday = (ts) => !!millis(ts) && dayKey(new Date(millis(ts))) === todayKey();

// A streak only counts while it's current: last visit today or yesterday.
export function currentStreak(account) {
  const s = account?.streak;
  if (!s?.day) return 0;
  return s.day === todayKey() || s.day === yesterdayKey() ? s.count || 0 : 0;
}

// Checks in while the tab is visible, and bumps the daily streak once a day.
// Both ride on the member's own account document, which they can already write.
export function usePresence(accountId, profile) {
  const streakDone = useRef('');

  const invisible = !!profile?.invisible;
  useEffect(() => {
    if (!accountId || invisible) return undefined;
    let lastInput = Date.now();
    let wasIdle = false;
    const beat = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastInput > IDLE_MS) return;
      updateDoc(doc(db, COL.accounts, accountId), { lastSeen: serverTimestamp() }).catch(() => {});
    };
    const onInput = () => {
      lastInput = Date.now();
      if (wasIdle) { wasIdle = false; beat(); }
    };
    const idleCheck = setInterval(() => { if (Date.now() - lastInput > IDLE_MS) wasIdle = true; }, 30_000);
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, onInput, { passive: true }));
    return () => {
      clearInterval(t);
      clearInterval(idleCheck);
      document.removeEventListener('visibilitychange', beat);
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.removeEventListener(ev, onInput));
    };
  }, [accountId, invisible]);

  useEffect(() => {
    if (!accountId || !profile) return;
    const today = todayKey();
    if (streakDone.current === today || profile.streak?.day === today) return;
    streakDone.current = today;
    const prev = profile.streak || {};
    const count = prev.day === yesterdayKey() ? (prev.count || 0) + 1 : 1;
    updateDoc(doc(db, COL.accounts, accountId), {
      streak: { day: today, count, best: Math.max(prev.best || 0, count) }
    }).catch(() => { streakDone.current = ''; });
  }, [accountId, profile]);
}

/* ------------------------------------------------------------ reactions */

export const REACTIONS = [
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'lol', emoji: '😂', label: 'Funny' },
  { id: 'skull', emoji: '💀', label: 'Dead' },
  { id: 'wow', emoji: '😮', label: 'Wow' },
  { id: 'sad', emoji: '😭', label: 'Crying' }
];

/* ------------------------------------------------------------ utilities */

// Tracks a boolean browser condition that can change under us.
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
