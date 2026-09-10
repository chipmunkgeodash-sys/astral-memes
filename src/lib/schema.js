// Firestore collection names and permission keys, recovered from the deployed
// bundle's call sites. These must match exactly or the app won't see live data.

export const COL = {
  accounts: 'accounts',
  usernames: 'usernames',
  wallets: 'wallets',
  roles: 'roles',
  challenges: 'challenges',
  challengeEntries: 'challengeEntries',
  polls: 'polls',
  posts: 'posts',
  messages: 'messages',
  chat: 'chat',
  announcements: 'announcements',
  storeItems: 'storeItems',
  redemptions: 'redemptions',
  // Holds the base64 AES-GCM key for the encrypted game library at
  // paidContent/games.key. Reads are gated by `accessPaidGames` in rules.
  paidContent: 'paidContent'
};

// Image upload constraints enforced by the original app.
export const UPLOAD = {
  types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxBytes: 2097152
};

// Permission flags stored on role documents.
export const PERMISSIONS = [
  { key: 'accessAdmin', label: 'Access admin dashboard' },
  { key: 'moderateMemes', label: 'Moderate posts' },
  { key: 'accessPaidGames', label: 'Access paid game library' },
  { key: 'accessEarlyFeatures', label: 'Access early and testing features' },
  { key: 'manageAnnouncements', label: 'Manage announcements' }
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

// Limits enforced by the original UI copy.
export const LIMITS = {
  weeklyAllowanceMin: 25,
  weeklyAllowanceMax: 10000,
  rewardCostMin: 1,
  rewardCostMax: 100000,
  pollQuestionMax: 180,
  pollChoicesMin: 2,
  pollChoicesMax: 6,
  weeklyChallengeMaxDays: 8,
  passwordMin: 8,
  foreverRefillPoints: 100
};

// An Owner implicitly holds every permission.
export function hasPermission(profile, roles, key) {
  if (!profile) return false;
  if (profile.owner) return true;
  const mine = roles.filter((r) => (profile.roles || []).includes(r.id));
  return mine.some((r) => r.permissions && r.permissions[key]);
}
