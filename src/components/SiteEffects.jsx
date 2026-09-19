import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../lib/session';
import { followersOf, useAccounts } from '../lib/social';
import { levelFor, xpFor } from '../lib/levels';
import { KEYS, pushRecent, readLocal, useLocal, writeLocal } from '../lib/local';
import { confetti } from '../lib/confetti';
import { play } from '../lib/sound';

export const PAGE_TITLES = {
  home: 'Home', feed: 'Feed', shorts: 'Shorts', chat: 'Global chat', messages: 'Messages', members: 'Members',
  casino: 'Casino', rng: 'RNG Roll', games: 'Games', leaderboard: 'Leaderboards', achievements: 'Achievements',
  polls: 'Polls', store: 'Store', notifications: 'Notifications', 'whats-new': "What's new", profile: 'Profile',
  settings: 'Settings', terms: 'Terms', search: 'Search', admin: 'Admin', u: 'Profile', post: 'Post', tag: 'Tag'
};

export const NOTIF_DEFAULTS = { like: true, react: true, comment: true, mention: true, follow: true, sound: true, desktop: false };
export const EFFECT_DEFAULTS = { snow: false, cursor: false };

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

// Draws the tab icon with a red dot when there are unread notifications.
function setFaviconDot(on) {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (!link.dataset.base) link.dataset.base = link.href || '';
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  ctx.fillStyle = '#5b5bd6';
  ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(38, 26, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b5bd6';
  ctx.beginPath(); ctx.arc(44, 20, 12, 0, Math.PI * 2); ctx.fill();
  if (on) {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(50, 14, 12, 0, Math.PI * 2); ctx.fill();
  }
  try { link.href = canvas.toDataURL('image/png'); } catch { /* ignore */ }
}

function Snow() {
  const flakes = useRef(Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100, size: 2 + Math.random() * 5, dur: 7 + Math.random() * 10, delay: -Math.random() * 15, drift: (Math.random() - 0.5) * 60, key: i
  })));
  return createPortal(
    <div className="snow" aria-hidden="true">
      {flakes.current.map((f) => (
        <i key={f.key} style={{ left: `${f.left}%`, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`, '--drift': `${f.drift}px` }} />
      ))}
    </div>,
    document.body
  );
}

function CursorTrail() {
  useEffect(() => {
    let last = 0;
    const onMove = (e) => {
      const now = performance.now();
      if (now - last < 40) return;
      last = now;
      const s = document.createElement('i');
      s.className = 'cursor-spark';
      s.style.left = `${e.clientX}px`;
      s.style.top = `${e.clientY}px`;
      s.style.setProperty('--hue', `${Math.floor(now / 10) % 360}`);
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 700);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return null;
}

export default function SiteEffects({ router, notifications }) {
  const { accountId, profile } = useSession();
  const accounts = useAccounts();
  const { items, unread } = notifications;
  const [prefs] = useLocal(KEYS.notifPrefs, NOTIF_DEFAULTS);
  const [effects] = useLocal(KEYS.effects, EFFECT_DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [egg, setEgg] = useState(false);
  const section = router.segments[0] || 'home';
  const notified = useRef(null);
  const lastLevel = useRef(null);
  const konami = useRef([]);

  // Tab title: unread count, page name, site.
  useEffect(() => {
    const page = PAGE_TITLES[section] || '';
    document.title = `${unread ? `(${unread > 99 ? '99+' : unread}) ` : ''}${page ? `${page} · ` : ''}Astral Memes`;
  }, [unread, section]);

  const hasUnread = unread > 0;
  useEffect(() => { setFaviconDot(hasUnread); }, [hasUnread]);

  // A quick bar across the top whenever the page changes, plus scroll memory
  // and the recently visited list for the command palette.
  const prevPath = useRef(router.path);
  const cameBack = useRef(false);
  useEffect(() => {
    const onPop = () => { cameBack.current = true; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    const from = prevPath.current;
    prevPath.current = router.path;
    if (from !== router.path) {
      const scrolls = readLocal(KEYS.scroll, {});
      writeLocal(KEYS.scroll, { ...scrolls, [from]: window.scrollY });
      setLoading(true);
      const t = setTimeout(() => setLoading(false), 450);
      // Going back or forward returns to where you were on that page.
      const saved = readLocal(KEYS.scroll, {})[router.path];
      if (cameBack.current && saved) setTimeout(() => window.scrollTo(0, saved), 60);
      cameBack.current = false;
      return () => clearTimeout(t);
    }
    return undefined;
  }, [router.path]);

  useEffect(() => {
    const page = PAGE_TITLES[section];
    if (!page || section === 'home') return;
    writeLocal(KEYS.recentPages, pushRecent(readLocal(KEYS.recentPages, []), { to: router.path, label: page }, 6, (a, b) => a.to === b.to));
  }, [router.path, section]);

  // New notifications: a sound, and a desktop notification if the tab is hidden.
  useEffect(() => {
    if (!accountId) return;
    const unreadIds = items.filter((n) => n.unread).map((n) => n.id);
    if (notified.current === null) { notified.current = new Set(unreadIds); return; }
    const fresh = items.filter((n) => n.unread && !notified.current.has(n.id));
    fresh.forEach((n) => notified.current.add(n.id));
    if (!fresh.length) return;
    const p = { ...NOTIF_DEFAULTS, ...(prefs || {}) };
    if (p.sound) play('coin');
    if (p.desktop && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = fresh[0];
      try {
        const note = new Notification('Astral', { body: `${n.from.displayName || 'Someone'} ${n.text}`, tag: n.id });
        note.onclick = () => { window.focus(); router.navigate(n.to); };
      } catch { /* some browsers only allow notifications from a service worker */ }
    }
  }, [items, accountId, prefs, router]);

  // Level-up celebration.
  const followers = followersOf(accounts, accountId).length;
  const level = profile && accounts ? levelFor(xpFor(profile, followers)).level : null;
  useEffect(() => {
    if (level == null) return;
    const stored = readLocal('astral-last-level', null);
    if (lastLevel.current === null) {
      lastLevel.current = stored ?? level;
      if (stored == null) writeLocal('astral-last-level', level);
    }
    if (level > lastLevel.current) {
      confetti({ count: 140 });
      play('epic');
      setEgg(`Level up! You're now level ${level}.`);
      setTimeout(() => setEgg(false), 3500);
    }
    lastLevel.current = level;
    writeLocal('astral-last-level', level);
  }, [level]);

  // Konami code.
  useEffect(() => {
    const onKey = (e) => {
      konami.current = [...konami.current, e.key].slice(-KONAMI.length);
      if (KONAMI.every((k, i) => (konami.current[i] || '').toLowerCase() === k.toLowerCase())) {
        konami.current = [];
        confetti({ count: 200 });
        play('epic');
        document.documentElement.classList.add('konami');
        setTimeout(() => document.documentElement.classList.remove('konami'), 4000);
        setEgg('↑↑↓↓←→←→BA — you found the secret! 🌈');
        setTimeout(() => setEgg(false), 4000);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fx = { ...EFFECT_DEFAULTS, ...(effects || {}) };
  const reduced = document.documentElement.getAttribute('data-motion') === 'reduced';

  return (
    <>
      {loading && <div className="top-loader" aria-hidden="true" />}
      {fx.snow && !reduced && <Snow />}
      {fx.cursor && !reduced && <CursorTrail />}
      {egg && createPortal(<div className="rng-toast rng-toast-good" role="status">{egg}</div>, document.body)}
    </>
  );
}
