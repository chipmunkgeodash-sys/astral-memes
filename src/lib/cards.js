// Shared card and hand logic for the challenge arcade.

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const rankLabel = (r) =>
  ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));

export const isRed = (card) => card.suit === '♥' || card.suit === '♦';

export function freshDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  // Fisher–Yates with crypto randomness so hands aren't predictable.
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function randomInt(max) {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    // Reject the tail so the modulo stays uniform.
    const limit = Math.floor(0xffffffff / max) * max;
    let v;
    do { globalThis.crypto.getRandomValues(a); [v] = a; } while (v >= limit);
    return v % max;
  }
  return Math.floor(Math.random() * max);
}

// Blackjack hand value, demoting aces from 11 to 1 as needed.
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 14) { aces += 1; total += 11; }
    else total += Math.min(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards) === 21;

// Five-card hand ranking. Returns { name, score } where score compares
// element-by-element, highest first — matching the original's scheme.
export function rankHand(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // Sort by count first, then by rank, so pairs outrank kickers.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const straightHigh = findStraight(ranks);
  const spread = groups.flatMap(([r, n]) => Array(n).fill(r));

  if (flush && straightHigh) return { name: straightHigh === 14 ? 'Royal flush' : 'Straight flush', score: [8, straightHigh] };
  if (groups[0][1] === 4) return { name: 'Four of a kind', score: [7, ...spread] };
  if (groups[0][1] === 3 && groups[1]?.[1] === 2) return { name: 'Full house', score: [6, groups[0][0], groups[1][0]] };
  if (flush) return { name: 'Flush', score: [5, ...ranks] };
  if (straightHigh) return { name: 'Straight', score: [4, straightHigh] };
  if (groups[0][1] === 3) return { name: 'Three of a kind', score: [3, ...spread] };
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) return { name: 'Two pair', score: [2, ...spread] };
  if (groups[0][1] === 2) return { name: 'Pair', score: [1, ...spread] };
  return { name: 'High card', score: [0, ...ranks] };
}

function findStraight(descRanks) {
  const uniq = [...new Set(descRanks)];
  if (uniq.length !== 5) return 0;
  if (uniq[0] - uniq[4] === 4) return uniq[0];
  // Wheel: A-2-3-4-5 plays as a five-high straight.
  if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) return 5;
  return 0;
}

// > 0 when a beats b, < 0 when b wins, 0 for a tie.
export function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
