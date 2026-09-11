// Firestore shape, recovered from the deployed bundle. Field names here must
// match exactly or the app won't read the live data.

export const COL = {
  accounts: 'accounts',
  usernames: 'usernames',
  wallets: 'wallets',
  roles: 'roles',
  polls: 'polls',
  posts: 'posts',
  messages: 'messages',
  chat: 'chat',
  announcements: 'announcements',
  storeItems: 'storeItems',
  redemptions: 'redemptions',
  groups: 'groups',
  deletionLog: 'deletionLog',
  // paidContent/games.key holds the base64 AES-GCM key for the game library.
  paidContent: 'paidContent'
};

// Thread ids. A DM is both account ids sorted so either side derives the same
// key; a group thread carries its group id, which the rules use to check
// membership.
export const LOUNGE_THREAD = 'the-lounge';
export const dmThread = (a, b) => [a, b].sort().join('__');
export const groupThread = (groupId) => `group_${groupId}`;

// Auth uses synthetic addresses on this domain; the real one per account is
// stored as `authEmail` on its usernames document.
export const AUTH_DOMAIN = 'accounts.astralmemes.app';

// The founding Owner is resolved directly rather than through a lookup.
export const FOUNDING_OWNER = 'zentraa';
export const FOUNDING_OWNER_EMAIL = `${FOUNDING_OWNER}@${AUTH_DOMAIN}`;

// Permission key -> label, in the original's order.
export const PERMISSION_LABELS = {
  manageUsers: 'Manage users',
  manageAnnouncements: 'Manage announcements',
  moderateMemes: 'Moderate posts',
  deleteMessages: 'Delete messages',
  manageChat: 'Manage global chat',
  accessAdmin: 'Access admin dashboard',
  manageSubscriptions: 'Manage subscriptions',
  accessPaidGames: 'Access paid game library',
  accessEarlyFeatures: 'Access early and testing features'
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS);

export const PERMISSIONS = ALL_PERMISSIONS.map((key) => ({
  key,
  label: PERMISSION_LABELS[key]
}));

// Seeded roles. Ids are stable and referenced by accounts.roleIds.
export const DEFAULT_ROLES = [
  { id: 'owner', name: 'Owner', color: '#b5a3ff', permissions: ALL_PERMISSIONS },
  { id: 'member', name: 'Frostbite', color: '#b9cce0', permissions: [] },
  { id: 'arctic', name: 'Arctic', color: '#73d7ff', permissions: ['accessPaidGames'] },
  { id: 'astral', name: 'Astral', color: '#bb8cff', permissions: ['accessPaidGames', 'accessEarlyFeatures'] }
];

export const OWNER_ROLE_ID = 'owner';
export const MEMBER_ROLE_ID = 'member';

// Everyone claims a fixed top-up once a day. The cooldown is under 24h so the
// claim doesn't drift later and later for someone who plays at the same time.
export const DAILY_POINTS = 100;
export const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export const LIMITS = {
  rewardCostMin: 1,
  rewardCostMax: 100000,
  pollQuestionMax: 180,
  pollChoicesMin: 2,
  pollChoicesMax: 6,
  passwordMin: 8,
  minBet: 1
};

export const UPLOAD = {
  types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxBytes: 2097152
};

export function isOwner(profile) {
  return !!profile && (profile.roleIds || []).includes(OWNER_ROLE_ID);
}

// Permissions come from assigned roles plus any granted directly on the account.
export function hasPermission(profile, roles, key) {
  if (!profile) return false;
  if (isOwner(profile)) return true;
  if ((profile.permissions || []).includes(key)) return true;
  const ids = profile.roleIds || [];
  return roles.some((r) => ids.includes(r.id) && (r.permissions || []).includes(key));
}
