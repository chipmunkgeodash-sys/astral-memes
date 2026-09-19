import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from './schema';
import { REACTIONS, millis, useAccounts } from './social';
import { mentionsHandle, myHandles } from '../components/RichText';
import { KEYS, useLocal } from './local';

// Notifications are worked out from data the site already has: likes and
// reactions on your posts and shorts, comments on them, new followers, and
// @mentions. Nothing is written for them. "Read" is remembered per device.

const SEEN_KEY = 'astral-notifications-seen';
let seenVersion = 0;
const seenListeners = new Set();

function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch { return null; }
}

function writeSeen(ids) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-3000))); } catch { /* per-visit only */ }
  seenVersion += 1;
  seenListeners.forEach((fn) => fn());
}

const subscribeSeen = (fn) => { seenListeners.add(fn); return () => seenListeners.delete(fn); };

export function markAllRead(items) {
  const seen = new Set(readSeen() || []);
  items.forEach((n) => seen.add(n.id));
  writeSeen([...seen]);
}

export function useNotifications(accountId, profile) {
  const accounts = useAccounts();
  const [myPosts, setMyPosts] = useState([]);
  const [myShorts, setMyShorts] = useState([]);
  const [comments, setComments] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  useSyncExternalStore(subscribeSeen, () => seenVersion, () => 0);
  // Types switched off in Settings never show up at all.
  const [prefs] = useLocal(KEYS.notifPrefs, null);

  useEffect(() => {
    if (!accountId) return undefined;
    return onSnapshot(query(collection(db, COL.posts), where('uid', '==', accountId)),
      (s) => setMyPosts(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setMyPosts([]));
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return undefined;
    return onSnapshot(query(collection(db, COL.shorts), where('uid', '==', accountId)),
      (s) => setMyShorts(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setMyShorts([]));
  }, [accountId]);

  useEffect(() => onSnapshot(query(collection(db, COL.comments), orderBy('createdAt', 'desc'), limit(400)),
    (s) => setComments(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setComments([])), []);

  useEffect(() => onSnapshot(query(collection(db, COL.posts), orderBy('createdAt', 'desc'), limit(100)),
    (s) => setRecentPosts(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRecentPosts([])), []);

  const items = useMemo(() => {
    if (!accountId) return [];
    const names = new Map((accounts || []).map((a) => [a.id, a]));
    const who = (id, fallback) => names.get(id) || { id, displayName: fallback || 'Someone' };
    const muted = profile?.muted || [];
    const out = [];
    const push = (n) => { if (!muted.includes(n.from.id) && n.from.id !== accountId) out.push(n); };

    const mineIds = new Set([...myPosts.map((p) => p.id), ...myShorts.map((s) => s.id)]);
    for (const p of myPosts) {
      const snippet = (p.text || 'your post').slice(0, 60);
      for (const uid of p.likes || []) push({ id: `like:${p.id}:${uid}`, type: 'like', from: who(uid), at: millis(p.createdAt), text: `liked your post “${snippet}”`, to: `/post/${p.id}` });
      for (const r of REACTIONS) {
        for (const uid of p.reactions?.[r.id] || []) push({ id: `react:${p.id}:${r.id}:${uid}`, type: 'react', emoji: r.emoji, from: who(uid), at: millis(p.createdAt), text: `reacted ${r.emoji} to “${snippet}”`, to: `/post/${p.id}` });
      }
    }
    for (const s of myShorts) {
      for (const uid of s.likes || []) push({ id: `slike:${s.id}:${uid}`, type: 'like', from: who(uid), at: millis(s.createdAt), text: 'liked your short', to: `/shorts/${s.id}` });
    }
    const handles = myHandles(profile);
    for (const c of comments) {
      const target = myShorts.some((s) => s.id === c.postId) ? `/shorts/${c.postId}` : `/post/${c.postId}`;
      if (mineIds.has(c.postId)) {
        push({ id: `comment:${c.id}`, type: 'comment', from: who(c.uid, c.displayName), at: millis(c.createdAt), text: `commented: “${(c.text || '').slice(0, 80)}”`, to: target });
      } else if (mentionsHandle(c.text, handles)) {
        push({ id: `cmention:${c.id}`, type: 'mention', from: who(c.uid, c.displayName), at: millis(c.createdAt), text: `mentioned you: “${(c.text || '').slice(0, 80)}”`, to: target });
      }
    }
    for (const p of recentPosts) {
      if (p.uid !== accountId && mentionsHandle(p.text, handles)) {
        push({ id: `pmention:${p.id}`, type: 'mention', from: who(p.uid, p.displayName), at: millis(p.createdAt), text: `mentioned you in a post: “${(p.text || '').slice(0, 80)}”`, to: `/post/${p.id}` });
      }
    }
    for (const a of accounts || []) {
      if ((a.following || []).includes(accountId)) push({ id: `follow:${a.id}`, type: 'follow', from: a, at: 0, text: 'started following you', to: `/u/${encodeURIComponent(a.username || a.id)}` });
    }
    const off = (type) => prefs && prefs[type === 'react' ? 'react' : type] === false;
    return out.filter((n) => !off(n.type)).sort((a, b) => b.at - a.at);
  }, [accountId, profile, accounts, myPosts, myShorts, comments, recentPosts, prefs]);

  // The very first time, treat everything that already exists as read so a
  // long-time member isn't greeted with hundreds of "new" notifications.
  // Waits a few seconds so every listener has delivered before taking that snapshot.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!accountId || readSeen() !== null) return undefined;
    const t = setTimeout(() => {
      if (readSeen() === null) writeSeen(itemsRef.current.map((n) => n.id));
    }, 4000);
    return () => clearTimeout(t);
  }, [accountId]);

  const seen = new Set(readSeen() || []);
  const withRead = items.map((n) => ({ ...n, unread: !seen.has(n.id) }));
  return { items: withRead, unread: withRead.filter((n) => n.unread).length };
}
