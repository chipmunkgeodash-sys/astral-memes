import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from './schema';

// Levels come from what's on a member's account document, so every page (hover
// cards, members, profiles) shows the same number without extra queries.
// `activity` counters are bumped by the member's own client as they post.

export function xpFor(account, followers = 0) {
  if (!account) return 0;
  const a = account.activity || {};
  const rng = account.rng || {};
  const streakBest = Math.max(account.streak?.best || 0, account.streak?.count || 0);
  return 50
    + (a.posts || 0) * 40
    + (a.shorts || 0) * 50
    + (a.comments || 0) * 10
    + followers * 60
    + (account.following || []).length * 5
    + Math.floor((rng.rolls || 0) / 5)
    + Object.keys(rng.counts || {}).length * 20
    + streakBest * 30
    + (account.questsDone || 0) * 40;
}

// Each level needs a bit more than the last: level n starts at 100·(n-1)^1.6 XP.
const startOf = (level) => Math.round(100 * (level - 1) ** 1.6);

export function levelFor(xp) {
  let level = 1;
  while (startOf(level + 1) <= xp) level += 1;
  const from = startOf(level);
  const to = startOf(level + 1);
  return { level, xp, from, to, progress: Math.min(1, (xp - from) / (to - from)) };
}

export const levelTitle = (level) => (
  level >= 50 ? 'Cosmic' : level >= 35 ? 'Legend' : level >= 25 ? 'Star' : level >= 15 ? 'Veteran' : level >= 8 ? 'Regular' : level >= 3 ? 'Explorer' : 'Newcomer'
);

export function bumpActivity(accountId, key) {
  if (!accountId) return Promise.resolve();
  return updateDoc(doc(db, COL.accounts, accountId), { [`activity.${key}`]: increment(1) }).catch(() => {});
}

// Coins for reaching level milestones, claimed once each.
export const LEVEL_REWARDS = [
  [5, 500], [10, 1_500], [15, 3_000], [20, 5_000], [25, 7_500], [30, 10_000], [40, 20_000], [50, 40_000]
];

// A week key like "2026-W37" (weeks start on Monday).
export function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// With a 7-day streak, 1,000 coins once a week.
export const WEEKLY_STREAK_DAYS = 7;
export const WEEKLY_STREAK_COINS = 1_000;
