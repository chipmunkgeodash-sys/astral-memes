import { useCallback, useEffect, useState } from 'react';

// Small per-device preferences and lists kept in localStorage. Every read and
// write is guarded (private windows and locked-down browsers throw), and all
// components using the same key stay in sync through a window event.

const EVENT = 'astral-local';

export function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* the value still applies for this visit */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }));
}

export function useLocal(key, fallback) {
  const [value, setValue] = useState(() => readLocal(key, fallback));
  useEffect(() => {
    const onChange = (e) => { if (e.detail?.key === key) setValue(e.detail.value === undefined ? fallback : e.detail.value); };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [key]);
  const set = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(readLocal(key, fallback)) : next;
    writeLocal(key, resolved);
    setValue(resolved);
  }, [key]);
  return [value, set];
}

// Adds an item to the front of a capped, de-duplicated list.
export const pushRecent = (list, item, max = 10, same = (a, b) => a === b) => [item, ...(list || []).filter((x) => !same(x, item))].slice(0, max);

export const KEYS = {
  hiddenPosts: 'astral-hidden-posts',
  recentSearches: 'astral-recent-searches',
  recentPages: 'astral-recent-pages',
  casinoFavorites: 'astral-casino-favorites',
  casinoRecent: 'astral-casino-recent',
  casinoBets: 'astral-casino-bets',
  casinoLimit: 'astral-casino-loss-limit',
  gameFavorites: 'astral-game-favorites',
  gameRecent: 'astral-game-recent',
  homeWidgets: 'astral-home-widgets',
  chatRead: 'astral-chat-read',
  notifPrefs: 'astral-notification-prefs',
  scroll: 'astral-scroll',
  effects: 'astral-effects',
  sidebar: 'astral-sidebar'
};
