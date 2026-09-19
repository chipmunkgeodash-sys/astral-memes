import { todayKey } from './social';

// Three quests a day, picked from this pool by the date so everyone gets the
// same set. Progress is measured from what the site already records.
export const QUEST_POOL = [
  { id: 'post', name: 'Say something', desc: 'Share a post in the feed', goal: 1, reward: 600, key: 'postsToday', to: '/feed', icon: '✏️' },
  { id: 'comment', name: 'Join the conversation', desc: 'Leave 3 comments', goal: 3, reward: 700, key: 'commentsToday', to: '/feed', icon: '💬' },
  { id: 'short', name: 'Lights, camera', desc: 'Post a short', goal: 1, reward: 900, key: 'shortsToday', to: '/shorts', icon: '🎬' },
  { id: 'rolls', name: 'Feeling lucky', desc: 'Roll 150 times in RNG Roll', goal: 150, reward: 800, key: 'rollsToday', to: '/rng', icon: '🎲' },
  { id: 'rounds', name: 'Hit the tables', desc: 'Play 10 casino rounds', goal: 10, reward: 700, key: 'roundsToday', to: '/casino', icon: '🃏' },
  { id: 'win', name: 'Winner winner', desc: 'Win 3 casino rounds', goal: 3, reward: 900, key: 'winsToday', to: '/casino', icon: '🏆' },
  { id: 'wheel', name: 'Spin to win', desc: 'Spin the daily lucky wheel', goal: 1, reward: 400, key: 'wheelToday', to: '/casino', icon: '🎡' },
  { id: 'chat', name: 'Say hi', desc: 'Send 5 messages in global chat', goal: 5, reward: 600, key: 'chatToday', to: '/chat', icon: '👋' }
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function questsForDay(day = todayKey()) {
  const pool = [...QUEST_POOL];
  const picked = [];
  let seed = hash(day);
  while (picked.length < 3) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    picked.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picked;
}
