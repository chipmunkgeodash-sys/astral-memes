// RNG Roll: free, endless rolls for auras of increasing rarity.
//
// A roll draws u from (0, 1] and lands on the rarest aura whose chance
// (the N in "1 in N") is at most luck / u. That makes P(at least aura X)
// exactly luck / N, so the odds printed on each aura are the real odds.

// [name, chance, fx, color, color2?]
//
// The original 22 auras keep their ids and odds so saved collections still
// line up; everything else slots in around them.
const TABLE = [
  ['Common', 1, 'plain', '#9aa3b5'],
  ['Dusty', 2, 'plain', '#b5a58f'],
  ['Pebble', 3, 'plain', '#a0a8a0'],
  ['Uncommon', 4, 'plain', '#7fd18b'],
  ['Breeze', 5, 'plain', '#9fe3d6'],
  ['Leafy', 6, 'plain', '#6cc46c'],
  ['Good', 8, 'plain', '#5fc4e8'],
  ['Mossy', 10, 'plain', '#7ea35a'],
  ['Spark', 12, 'glow', '#ffe066'],
  ['Natural', 16, 'plain', '#8bd45a'],
  ['Pixel', 20, 'glow', '#ff7ad9'],
  ['Drizzle', 24, 'glow', '#7fb3ff'],
  ['Rare', 32, 'glow', '#4f8dff'],
  ['Ember', 40, 'pulse', '#ff7a3d'],
  ['Frosted', 48, 'frost', '#bfe9ff', '#ffffff'],
  ['Crystal', 64, 'glow', '#b8a6ff'],
  ['Sunbeam', 70, 'pulse', '#ffd23d'],
  ['Amber', 80, 'pulse', '#ffb347'],
  ['Topaz', 100, 'glow', '#ffc857'],
  ['Ruby', 128, 'glow', '#ff4d6d'],
  ['Coral', 150, 'pulse', '#ff8577'],
  ['Jade', 180, 'glow', '#3ccf91'],
  ['Amethyst', 200, 'pulse', '#b061ff'],
  ['Sapphire', 250, 'glow', '#3f6bff'],
  ['Onyx', 300, 'pulse', '#c9c9d6', '#2a2a33'],
  ['Quartz', 400, 'frost', '#f3d9ff', '#ffffff'],
  ['Emerald', 500, 'glow', '#1fd18a'],
  ['Pearl', 600, 'frost', '#fff6ea', '#e3d4ff'],
  ['Obsidian', 750, 'void', '#9d7bff', '#0b0614'],
  ['Opal', 850, 'shimmer', '#9ff7ff', '#ffb3f0'],
  ['Glitch', 1_000, 'glitch', '#39ff14'],
  ['Moonstone', 1_100, 'frost', '#dfe8ff', '#9ab0ff'],
  ['Neon', 1_200, 'electric', '#ff2bd6', '#00f0ff'],
  ['Static', 1_500, 'glitch', '#e8e8e8'],
  ['Voltage', 1_800, 'electric', '#fff13d', '#6ee7ff'],
  ['Prism', 2_000, 'shimmer', '#ff9df5', '#8df7ff'],
  ['Nebula', 2_500, 'shimmer', '#d86bff', '#5b8cff'],
  ['Aurora', 3_000, 'wave', '#4dffb8', '#8b7bff'],
  ['Comet', 3_500, 'shimmer', '#bfe3ff', '#5b8cff'],
  ['Meteor', 4_000, 'fire', '#ff6a2e', '#ffd23d'],
  ['Solar', 5_000, 'shimmer', '#ffb52e', '#ff5e2e'],
  ['Blizzard', 6_000, 'frost', '#d8f3ff', '#6fc3ff'],
  ['Inferno', 7_000, 'fire', '#ff3b1f', '#ffb52e'],
  ['Tempest', 8_000, 'electric', '#9ab8ff', '#ffffff'],
  ['Mirage', 9_000, 'wave', '#ffd9a8', '#ff9df5'],
  ['Lunar', 10_000, 'shimmer', '#e6ecff', '#8fa3d9'],
  ['Horizon', 11_000, 'wave', '#ffb86b', '#6b8cff'],
  ['Zenith', 12_000, 'pulse', '#fff4b8', '#ffd23d'],
  ['Twilight', 15_000, 'shimmer', '#ff8fd1', '#5a4dff'],
  ['Phantom', 18_000, 'void', '#c8c8ff', '#10101c'],
  ['Wraith', 20_000, 'void', '#8affc1', '#04140c'],
  ['Starlight', 25_000, 'shimmer', '#fff38a', '#7ee8ff'],
  ['Spectre', 30_000, 'glitch', '#b7ffec'],
  ['Celestial', 35_000, 'wave', '#fff5c2', '#9fd8ff'],
  ['Seraph', 40_000, 'pulse', '#fffbe6', '#ffe08a'],
  ['Astral', 50_000, 'shimmer', '#8b7bff', '#35e0c8'],
  ['Radiant', 60_000, 'fire', '#fff3a0', '#ff9d2e'],
  ['Abyssal', 70_000, 'void', '#2ee6ff', '#001018'],
  ['Chronos', 80_000, 'electric', '#e4c87a', '#ffffff'],
  ['Hydra', 90_000, 'wave', '#3dffa0', '#1a6bff'],
  ['Void', 100_000, 'void', '#6a4dff', '#000000'],
  ['Nova', 120_000, 'fire', '#ffffff', '#6bd7ff'],
  ['Quasar', 150_000, 'electric', '#b28bff', '#5bf2ff'],
  ['Pulsar', 200_000, 'pulse', '#7af0ff', '#ffffff'],
  ['Eclipse', 250_000, 'void', '#ff8a3d', '#1a0b00'],
  ['Titan', 300_000, 'fire', '#ffcf6b', '#a3521d'],
  ['Leviathan', 350_000, 'wave', '#1ad1ff', '#002a66'],
  ['Oracle', 400_000, 'shimmer', '#e3b8ff', '#ffe9a8'],
  ['Supernova', 500_000, 'rainbow', '#ff3df2'],
  ['Paradox', 600_000, 'glitch', '#ff5d8f'],
  ['Rift', 700_000, 'void', '#ff3df2', '#12001a'],
  ['Warden', 800_000, 'electric', '#6bffb0', '#ffffff'],
  ['Monarch', 900_000, 'fire', '#ffd700', '#8a2be2'],
  ['Galaxy', 1_000_000, 'rainbow', '#7af0ff'],
  ['Zeus', 1_500_000, 'electric', '#fff76b', '#8ad0ff'],
  ['Kraken', 2_000_000, 'wave', '#35ffd0', '#3b0a66'],
  ['Phoenix', 2_500_000, 'fire', '#ff4d1a', '#ffe14d'],
  ['Dragonfire', 3_000_000, 'fire', '#ff1a1a', '#ff9d00'],
  ['Starforge', 4_000_000, 'cosmic', '#ffb347'],
  ['Timeless', 5_000_000, 'wave', '#f5e6c8', '#9ab0ff'],
  ['Archangel', 6_000_000, 'cosmic', '#fff7d6'],
  ['Nightmare', 7_000_000, 'void', '#ff1f4b', '#000000'],
  ['Empyrean', 8_000_000, 'rainbow', '#ffffff'],
  ['Omen', 9_000_000, 'glitch', '#ff0033'],
  ['Cosmic', 10_000_000, 'rainbow', '#ffffff'],
  ['Hyperion', 15_000_000, 'cosmic', '#ffe36b'],
  ['Chaos', 20_000_000, 'glitch', '#ff00aa'],
  ['Genesis', 25_000_000, 'cosmic', '#b3ffcf'],
  ['Oblivion', 30_000_000, 'void', '#a64dff', '#000000'],
  ['Aether', 40_000_000, 'wave', '#e6f7ff', '#b28bff'],
  ['Ragnarok', 50_000_000, 'fire', '#ff2e00', '#2b0000'],
  ['Elysium', 60_000_000, 'cosmic', '#ffd6f5'],
  ['Sovereign', 70_000_000, 'rainbow', '#ffd700'],
  ['Wormhole', 80_000_000, 'void', '#5bf2ff', '#000000'],
  ['Dreamweaver', 90_000_000, 'wave', '#ff9df5', '#7ee8ff'],
  ['Singularity', 100_000_000, 'rainbow', '#ffffff'],
  ['Event Horizon', 150_000_000, 'void', '#ffb52e', '#000000'],
  ['Big Bang', 200_000_000, 'cosmic', '#ffffff'],
  ['Multiverse', 300_000_000, 'rainbow', '#ffffff'],
  ['Transcendent', 400_000_000, 'cosmic', '#e6ccff'],
  ['Apex', 500_000_000, 'electric', '#ffffff', '#ffd700'],
  ['Eternity', 600_000_000, 'wave', '#ffffff', '#ffd700'],
  ['Primordial', 700_000_000, 'fire', '#7dff4d', '#ff4dd2'],
  ['Godlike', 800_000_000, 'cosmic', '#fff2a8'],
  ['Absolute', 900_000_000, 'rainbow', '#ffffff'],
  ['Infinity', 1_000_000_000, 'rainbow', '#ffffff'],
  ['Beyond', 2_000_000_000, 'cosmic', '#c8b8ff'],
  ['Omega', 3_000_000_000, 'glitch', '#ffffff'],
  ['Alpha', 5_000_000_000, 'electric', '#ffffff', '#ff3df2'],
  ['Celestium', 7_500_000_000, 'cosmic', '#9ff7ff'],
  ['Nullspace', 10_000_000_000, 'void', '#ffffff', '#000000'],
  ['Hypernova', 25_000_000_000, 'fire', '#ffffff', '#ff3df2'],
  ['Dimension', 50_000_000_000, 'wave', '#7af0ff', '#ff3df2'],
  ['Creation', 100_000_000_000, 'cosmic', '#ffffff'],
  ['Omniverse', 250_000_000_000, 'rainbow', '#ffffff'],
  ['Unbound', 500_000_000_000, 'electric', '#ffd700', '#ffffff'],
  ['The One', 1_000_000_000_000, 'cosmic', '#fff7d6'],
  ['Glitched Reality', 2_500_000_000_000, 'glitch', '#39ff14'],
  ['Astral King', 5_000_000_000_000, 'cosmic', '#8b7bff'],
  ['Endless', 10_000_000_000_000, 'rainbow', '#ffffff'],
  ['Truth', 100_000_000_000_000, 'cosmic', '#ffffff'],
  ['Beyond Infinity', 1_000_000_000_000_000, 'rainbow', '#ffffff']
];

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const AURAS = TABLE
  .map(([name, chance, fx, color, color2]) => ({ id: slug(name), name, chance, fx, color, color2 }))
  .sort((a, b) => a.chance - b.chance);

const BY_ID = new Map(AURAS.map((a) => [a.id, a]));
export const auraById = (id) => BY_ID.get(id) || AURAS[0];

// Every Nth roll is rolled at double luck. The clover upgrade shortens N.
export const LUCKY_EVERY = 10;
export const LUCKY_BOOST = 2;

// Reveal tiers: a full-screen cutscene from 1 in 1,000, bigger ones above.
export const CUTSCENE_AT = 1_000;
export const tierOf = (chance) => (
  chance >= 1e10 ? 4 : chance >= 1e7 ? 3 : chance >= 1e5 ? 2 : chance >= CUTSCENE_AT ? 1 : 0
);

// Uniform on (0, 1] with 53 bits of crypto randomness, so the one-in-a-billion
// tiers are reachable rather than rounded away.
function unit() {
  const a = new Uint32Array(2);
  globalThis.crypto.getRandomValues(a);
  const bits = (a[0] >>> 5) * 67108864 + (a[1] >>> 6); // 27 + 26 bits
  return (bits + 1) / 9007199254740992;
}

// Returns the aura and the roll itself: the "1 in N" this particular roll hit.
// The number has no ceiling past the rarest aura — it just keeps climbing.
export function rollAura(luck = 1) {
  const reach = luck / unit();
  let aura = AURAS[0];
  for (const a of AURAS) {
    if (a.chance <= reach) aura = a;
    else break;
  }
  return { aura, roll: Math.max(1, Math.floor(reach)) };
}

export const formatChance = (n) => `1 in ${n.toLocaleString()}`;

/* ------------------------------------------------------------- economy */

// Points for landing an aura. Grows with rarity but flattens out: a common is
// worth 5, one in a thousand 80, one in a million 1,260.
export const pointsFor = (aura) => 5 * Math.ceil(aura.chance ** 0.4);

// Free points once a day, more for a longer visit streak (capped at 20 days).
export const dailyBonusFor = (streak) => 500 + 250 * Math.min(Math.max(streak, 1), 20);

// Site coins for rare finds, 1 in 1,000 and up: 6 for the first cutscene tier,
// 200 for one in a million, 6,324 for one in a billion.
//
// Scaled by the square root of the odds on purpose. A payout linear in the odds
// would make every tier worth the same on average and turn auto-roll into a
// money printer; this way a steady roller averages about one coin per 75 rolls.
export const COINS_FROM = CUTSCENE_AT;
export const MAX_COIN_REWARD = 1_000_000;
export const coinsFor = (aura, magnetLevel = 0) => (
  aura.chance < COINS_FROM
    ? 0
    : Math.min(MAX_COIN_REWARD, Math.floor((Math.sqrt(aura.chance) / 5) * (1 + 0.25 * magnetLevel)))
);

// Potions multiply luck for a number of rolls. Buying one while another is
// active replaces it.
export const POTIONS = [
  { id: 'lucky', name: 'Lucky Potion', luck: 2, rolls: 100, cost: 300, color: '#7fd18b' },
  { id: 'fortune', name: 'Fortune Potion', luck: 5, rolls: 100, cost: 1_500, color: '#ffc857' },
  { id: 'heavenly', name: 'Heavenly Potion', luck: 20, rolls: 50, cost: 10_000, color: '#9ff7ff' },
  { id: 'oblivion', name: 'Oblivion Potion', luck: 100, rolls: 25, cost: 60_000, color: '#a64dff' }
];

// Permanent upgrades, bought level by level.
export const UPGRADES = [
  { id: 'charm', name: 'Lucky Charm', max: 10, base: 400, growth: 1.8, describe: (l) => `+${l * 10}% luck on every roll` },
  { id: 'speed', name: 'Quick Hands', max: 5, base: 350, growth: 2, describe: (l) => `Rolls animate ${l * 15}% faster` },
  { id: 'cadence', name: 'Four-Leaf Clover', max: 5, base: 800, growth: 2.2, describe: (l) => `Lucky roll every ${LUCKY_EVERY - l} rolls` },
  { id: 'magnet', name: 'Coin Magnet', max: 4, base: 2_000, growth: 2.5, describe: (l) => `+${l * 25}% coins from rare finds` }
];

export const upgradeCost = (up, level) => Math.round(up.base * up.growth ** level);

// Owner-set luck multiplier bounds.
export const OWNER_LUCK_MAX = 1_000_000_000;
export const clampOwnerLuck = (n) => Math.min(OWNER_LUCK_MAX, Math.max(1, Math.floor(Number(n)) || 1));

// Total luck for a given roll: charm, then any active potion, then the lucky
// roll on top, then rebirths and the Owner's multiplier (1 for everyone else).
export function luckFor({ upgrades = {}, potion = null, ownerLuck = 1, rebirths = 0 }, rollNumber) {
  const every = LUCKY_EVERY - (upgrades.cadence || 0);
  const lucky = rollNumber % every === 0;
  const potionDef = potion && potion.rollsLeft > 0 ? POTIONS.find((p) => p.id === potion.id) : null;
  const luck = (1 + 0.1 * (upgrades.charm || 0))
    * (potionDef ? potionDef.luck : 1)
    * (lucky ? LUCKY_BOOST : 1)
    * clampOwnerLuck(ownerLuck)
    * rebirthMult(rebirths);
  return { luck, lucky, every, potion: potionDef };
}

/* ---------------------------------------------------------- progression */

// Rebirths trade points and upgrades for permanent luck: +25% each.
export const REBIRTH_MAX = 20;
export const rebirthCost = (rebirths) => 500_000 * (rebirths + 1);
export const rebirthMult = (rebirths = 0) => 1 + 0.25 * Math.min(REBIRTH_MAX, Math.max(0, rebirths));

// Pity: this many rolls without a 1 in 1,000+ aura guarantees one.
export const PITY_AT = 1_500;

// Combo: consecutive rolls of 1 in 32 or rarer multiply points, up to ×3.
export const comboMult = (combo = 0) => 1 + 0.1 * Math.min(combo, 20);

// Selling a duplicate aura pays three times its roll points.
export const sellValue = (aura) => pointsFor(aura) * 3;

export const AUTO_SELL_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 10, label: 'Below 1 in 10' },
  { value: 100, label: 'Below 1 in 100' },
  { value: 1_000, label: 'Below 1 in 1,000' }
];

// Roll-count milestones: [rolls, reward points].
export const MILESTONES = [
  [100, 1_000], [1_000, 5_000], [10_000, 25_000], [100_000, 150_000], [1_000_000, 1_000_000], [10_000_000, 5_000_000]
];

// Rarity brackets. Finding every aura in one pays its reward.
export const RARITY_TIERS = [
  { id: 'common', name: 'Common', min: 1, max: 100, reward: 5_000, color: '#9aa3b5' },
  { id: 'uncommon', name: 'Uncommon', min: 100, max: 1_000, reward: 25_000, color: '#5fc4e8' },
  { id: 'rare', name: 'Rare', min: 1_000, max: 100_000, reward: 100_000, color: '#b061ff' },
  { id: 'epic', name: 'Epic', min: 100_000, max: 10_000_000, reward: 500_000, color: '#ffb52e' },
  { id: 'legendary', name: 'Legendary', min: 10_000_000, max: 1_000_000_000, reward: 2_500_000, color: '#ff3df2' },
  { id: 'mythic', name: 'Mythic', min: 1_000_000_000, max: Infinity, reward: 10_000_000, color: '#ffffff' }
];
export const rarityTierOf = (chance) => RARITY_TIERS.find((t) => chance >= t.min && chance < t.max);
export const aurasInTier = (tier) => AURAS.filter((a) => a.chance >= tier.min && a.chance < tier.max);

// Stage backgrounds bought with points.
export const THEMES = [
  { id: 'default', name: 'Starfield', cost: 0 },
  { id: 'nebula', name: 'Nebula', cost: 5_000 },
  { id: 'sunset', name: 'Sunset', cost: 15_000 },
  { id: 'matrix', name: 'Matrix', cost: 40_000 },
  { id: 'ocean', name: 'Deep Ocean', cost: 80_000 },
  { id: 'gold', name: 'Golden Vault', cost: 250_000 },
  { id: 'void', name: 'The Void', cost: 1_000_000 }
];

// One aura a day (the same for everyone) pays a bonus the first time it lands.
function hashDay(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function dailyTarget(day) {
  const pool = AURAS.filter((a) => a.chance >= 100 && a.chance <= 20_000);
  return pool[hashDay(`target:${day}`) % pool.length];
}
export const targetReward = (aura) => pointsFor(aura) * 50;

// A free Lucky Potion once an hour.
export const FREE_POTION_MS = 60 * 60 * 1000;

// Chance of landing `aura` or rarer at least once in `rolls` rolls.
export function chanceWithin(luck, chance, rolls) {
  const p = Math.min(1, luck / chance);
  if (p >= 1) return 1;
  return -Math.expm1(rolls * Math.log1p(-p));
}
