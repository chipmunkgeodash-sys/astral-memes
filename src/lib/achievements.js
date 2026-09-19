import { AURAS, auraById } from './rng';
import { levelFor, xpFor } from './levels';

// Achievements are worked out from data the site already has, so there's
// nothing to store and nothing to fall out of sync.
//
// Each `progress` returns [current, goal]; unlocked means current >= goal.

export const ACHIEVEMENTS = [
  { id: 'welcome', name: 'Welcome Aboard', desc: 'Join Astral', icon: '🚀', tier: 'bronze', progress: () => [1, 1] },
  { id: 'post-1', name: 'First Words', desc: 'Share your first post', icon: '✏️', tier: 'bronze', progress: (s) => [s.posts, 1] },
  { id: 'post-10', name: 'Regular', desc: 'Share 10 posts', icon: '📝', tier: 'silver', progress: (s) => [s.posts, 10] },
  { id: 'post-50', name: 'Content Machine', desc: 'Share 50 posts', icon: '🏭', tier: 'gold', progress: (s) => [s.posts, 50] },
  { id: 'likes-10', name: 'Liked', desc: 'Get 10 likes across your posts', icon: '❤️', tier: 'bronze', progress: (s) => [s.likes, 10] },
  { id: 'likes-100', name: 'Crowd Favourite', desc: 'Get 100 likes across your posts', icon: '💖', tier: 'gold', progress: (s) => [s.likes, 100] },
  { id: 'follow-5', name: 'Social Butterfly', desc: 'Follow 5 members', icon: '🦋', tier: 'bronze', progress: (s) => [s.following, 5] },
  { id: 'followers-5', name: 'Noticed', desc: 'Get 5 followers', icon: '👀', tier: 'silver', progress: (s) => [s.followers, 5] },
  { id: 'followers-25', name: 'Influencer', desc: 'Get 25 followers', icon: '🌟', tier: 'gold', progress: (s) => [s.followers, 25] },
  { id: 'coins-1k', name: 'Pocket Money', desc: 'Hold 1,000 coins', icon: '🪙', tier: 'bronze', progress: (s) => [s.coins, 1_000] },
  { id: 'coins-10k', name: 'High Roller', desc: 'Hold 10,000 coins', icon: '💰', tier: 'silver', progress: (s) => [s.coins, 10_000] },
  { id: 'coins-1m', name: 'Millionaire', desc: 'Hold 1,000,000 coins', icon: '🏦', tier: 'legend', progress: (s) => [s.coins, 1_000_000] },
  { id: 'rolls-100', name: 'Roller', desc: 'Roll 100 times in RNG Roll', icon: '🎲', tier: 'bronze', progress: (s) => [s.rolls, 100] },
  { id: 'rolls-10k', name: 'Grinder', desc: 'Roll 10,000 times', icon: '⚙️', tier: 'gold', progress: (s) => [s.rolls, 10_000] },
  { id: 'aura-1k', name: 'Rare Find', desc: 'Land an aura of 1 in 1,000 or rarer', icon: '💎', tier: 'silver', progress: (s) => [s.bestChance >= 1_000 ? 1 : 0, 1] },
  { id: 'aura-1m', name: 'Mythic', desc: 'Land an aura of 1 in 1,000,000 or rarer', icon: '🌌', tier: 'gold', progress: (s) => [s.bestChance >= 1_000_000 ? 1 : 0, 1] },
  { id: 'aura-1b', name: 'Beyond Luck', desc: 'Land an aura of 1 in 1,000,000,000 or rarer', icon: '♾️', tier: 'legend', progress: (s) => [s.bestChance >= 1_000_000_000 ? 1 : 0, 1] },
  { id: 'collect-25', name: 'Collector', desc: 'Find 25 different auras', icon: '📚', tier: 'silver', progress: (s) => [s.auras, 25] },
  { id: 'collect-all', name: 'Completionist', desc: `Find all ${AURAS.length} auras`, icon: '👑', tier: 'legend', progress: (s) => [s.auras, AURAS.length] },
  { id: 'streak-3', name: 'On a Roll', desc: 'Visit 3 days in a row', icon: '🔥', tier: 'bronze', progress: (s) => [s.bestStreak, 3] },
  { id: 'streak-7', name: 'Dedicated', desc: 'Visit 7 days in a row', icon: '📅', tier: 'silver', progress: (s) => [s.bestStreak, 7] },
  { id: 'streak-30', name: 'Loyal', desc: 'Visit 30 days in a row', icon: '🏆', tier: 'gold', progress: (s) => [s.bestStreak, 30] },
  { id: 'streak-100', name: 'Ride or Die', desc: 'Visit 100 days in a row', icon: '💯', tier: 'legend', progress: (s) => [s.bestStreak, 100] },
  { id: 'shorts-1', name: 'Director', desc: 'Post your first short', icon: '🎬', tier: 'bronze', progress: (s) => [s.shorts, 1] },
  { id: 'shorts-10', name: 'Short King', desc: 'Post 10 shorts', icon: '📽️', tier: 'silver', progress: (s) => [s.shorts, 10] },
  { id: 'comments-10', name: 'Chatterbox', desc: 'Leave 10 comments', icon: '💬', tier: 'bronze', progress: (s) => [s.comments, 10] },
  { id: 'comments-100', name: 'Commentator', desc: 'Leave 100 comments', icon: '🎙️', tier: 'gold', progress: (s) => [s.comments, 100] },
  { id: 'level-10', name: 'Rising Star', desc: 'Reach level 10', icon: '⭐', tier: 'silver', progress: (s) => [s.level, 10] },
  { id: 'level-25', name: 'Star Power', desc: 'Reach level 25', icon: '🌠', tier: 'gold', progress: (s) => [s.level, 25] },
  { id: 'rebirth-1', name: 'Born Again', desc: 'Rebirth in RNG Roll', icon: '♻️', tier: 'gold', progress: (s) => [s.rebirths, 1] },
  { id: 'themes-3', name: 'Interior Designer', desc: 'Own 3 RNG stage themes', icon: '🎨', tier: 'silver', progress: (s) => [s.themes, 3] },
  { id: 'quests-10', name: 'Questing', desc: 'Complete 10 daily quests', icon: '🗺️', tier: 'silver', progress: (s) => [s.quests, 10] }
];

// Pulls the numbers the achievements need out of an account and its posts.
export function statsFor({ account, posts = [], coins = 0, followers = 0 }) {
  const rng = account?.rng || {};
  return {
    posts: posts.length,
    likes: posts.reduce((n, p) => n + (p.likes || []).length, 0),
    following: (account?.following || []).length,
    followers,
    coins,
    rolls: rng.rolls || 0,
    bestChance: auraById(rng.best).chance,
    auras: Object.keys(rng.counts || {}).length,
    bestStreak: Math.max(account?.streak?.best || 0, account?.streak?.count || 0),
    shorts: account?.activity?.shorts || 0,
    comments: account?.activity?.comments || 0,
    level: account ? levelFor(xpFor(account, followers)).level : 1,
    rebirths: rng.rebirths || 0,
    themes: (rng.themes || ['default']).filter((x) => x !== 'default').length,
    quests: account?.questsDone || 0
  };
}

export function evaluate(stats) {
  return ACHIEVEMENTS.map((a) => {
    const [have, goal] = a.progress(stats);
    return { ...a, have: Math.min(have, goal), goal, unlocked: have >= goal };
  });
}
