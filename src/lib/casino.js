// Outcome math for the casino floor, kept free of React so the return-to-player
// of each game can be checked with a plain simulation.
//
// Every game returns a *payout* — the total handed back, stake included — so
// 0 is a loss, the stake is a push, and anything above it is a win.

import { freshDeck, randomInt } from './cards';

// Uniform float in [0, 1) from the same crypto source the card shuffles use.
export const random = () => randomInt(1_000_000) / 1_000_000;

const pickWeighted = (items) => {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let roll = randomInt(total);
  for (const it of items) {
    roll -= it.weight;
    if (roll < 0) return it;
  }
  return items[items.length - 1];
};

/* ---------------------------------------------------------------- slots */
// Three reels. Three of a kind pays `triple`, exactly two pays `pair`.
// Weights and pays are balanced to roughly 95% RTP.

export const SLOT_SYMBOLS = [
  { id: 'cherry', glyph: '🍒', weight: 30, pair: 0.5, triple: 4 },
  { id: 'lemon', glyph: '🍋', weight: 25, pair: 0.5, triple: 6 },
  { id: 'bell', glyph: '🔔', weight: 20, pair: 1.5, triple: 12 },
  { id: 'star', glyph: '⭐', weight: 12, pair: 2, triple: 40 },
  { id: 'gem', glyph: '💎', weight: 8, pair: 3, triple: 120 },
  { id: 'seven', glyph: '7️⃣', weight: 5, pair: 5, triple: 400 }
];

export function spinSlots(bet) {
  const reels = [0, 1, 2].map(() => pickWeighted(SLOT_SYMBOLS));
  const counts = new Map();
  for (const s of reels) counts.set(s.id, (counts.get(s.id) || 0) + 1);
  const [topId, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const sym = SLOT_SYMBOLS.find((s) => s.id === topId);
  const mult = topCount === 3 ? sym.triple : topCount === 2 ? sym.pair : 0;
  return { reels, mult, payout: Math.floor(bet * mult), line: topCount >= 2 ? sym : null, count: topCount };
}

/* ------------------------------------------------------------- roulette */
// Single-zero wheel, 37 pockets, standard pays (97.3% RTP).

export const ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const pocketColor = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

export const ROULETTE_BETS = [
  { id: 'red', label: 'Red', pays: 2, wins: (n) => pocketColor(n) === 'red' },
  { id: 'black', label: 'Black', pays: 2, wins: (n) => pocketColor(n) === 'black' },
  { id: 'odd', label: 'Odd', pays: 2, wins: (n) => n > 0 && n % 2 === 1 },
  { id: 'even', label: 'Even', pays: 2, wins: (n) => n > 0 && n % 2 === 0 },
  { id: 'low', label: '1–18', pays: 2, wins: (n) => n >= 1 && n <= 18 },
  { id: 'high', label: '19–36', pays: 2, wins: (n) => n >= 19 },
  { id: 'd1', label: '1st 12', pays: 3, wins: (n) => n >= 1 && n <= 12 },
  { id: 'd2', label: '2nd 12', pays: 3, wins: (n) => n >= 13 && n <= 24 },
  { id: 'd3', label: '3rd 12', pays: 3, wins: (n) => n >= 25 },
  { id: 'straight', label: 'Single number', pays: 36, wins: (n, pick) => n === pick }
];

export function spinRoulette(bet, betId, pick = 0) {
  const n = randomInt(37);
  const def = ROULETTE_BETS.find((b) => b.id === betId);
  const won = def.wins(n, pick);
  return { n, color: pocketColor(n), payout: won ? bet * def.pays : 0 };
}

/* ---------------------------------------------------------------- crash */
// P(crash point >= m) = 0.97 / m, so cashing out at any target returns 97%.

export function crashPoint() {
  const r = random();
  const m = Math.floor((0.97 / (1 - r)) * 100) / 100;
  return Math.min(1000, Math.max(1, m));
}

// Multiplier after `ms` of flight: slow off the line, quick once it climbs.
export const crashCurve = (ms) => Math.floor(Math.exp(ms * 0.00016) * 100) / 100;

/* ----------------------------------------------------------------- dice */
// Roll 0.00–99.99 and win when under the target. 97% RTP at every target.

export const diceMultiplier = (target) => Math.floor((97 / target) * 100) / 100;

export function rollDice(bet, target) {
  const roll = randomInt(10000) / 100;
  const won = roll < target;
  return { roll, payout: won ? Math.floor(bet * diceMultiplier(target)) : 0 };
}

/* --------------------------------------------------------------- plinko */
// Eight rows of pegs, nine slots. Both risk tables sit near 99% RTP.

export const PLINKO_ROWS = 8;
export const PLINKO_TABLES = {
  low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
  high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]
};

export function dropPlinko(bet, risk) {
  const path = Array.from({ length: PLINKO_ROWS }, () => randomInt(2));
  const slot = path.reduce((s, step) => s + step, 0);
  const mult = PLINKO_TABLES[risk][slot];
  return { path, slot, mult, payout: Math.floor(bet * mult) };
}

/* ---------------------------------------------------------------- hi-lo */
// Endless deck. Each correct call multiplies the pot by 0.97 / chance.

export const hiloChance = (rank, dir) =>
  dir === 'higher' ? (15 - rank) / 13 : (rank - 1) / 13;

export const hiloStep = (rank, dir) => Math.floor((0.97 / hiloChance(rank, dir)) * 100) / 100;

export function drawCard() {
  return freshDeck()[0];
}

/* ------------------------------------------------------------ coin flip */

export function flipCoin(bet, call) {
  const side = randomInt(2) === 0 ? 'heads' : 'tails';
  return { side, payout: side === call ? Math.floor(bet * 1.94) : 0 };
}

/* ------------------------------------------------------------- baccarat */
// Punto banco with the standard third-card rules. Player pays 2x, Banker
// 1.95x, Tie 9x; Player and Banker bets push on a tie.

const bacValue = (card) => (card.rank >= 10 && card.rank <= 13 ? 0 : card.rank === 14 ? 1 : card.rank);
export const bacTotal = (cards) => cards.reduce((s, c) => s + bacValue(c), 0) % 10;

export function dealBaccarat(bet, side) {
  const deck = freshDeck();
  const player = [deck.pop(), deck.pop()];
  const banker = [deck.pop(), deck.pop()];

  const natural = bacTotal(player) >= 8 || bacTotal(banker) >= 8;
  if (!natural) {
    let third = null;
    if (bacTotal(player) <= 5) {
      third = deck.pop();
      player.push(third);
    }
    const b = bacTotal(banker);
    const t = third ? bacValue(third) : null;
    const bankerDraws = third === null
      ? b <= 5
      : b <= 2
        || (b === 3 && t !== 8)
        || (b === 4 && t >= 2 && t <= 7)
        || (b === 5 && t >= 4 && t <= 7)
        || (b === 6 && (t === 6 || t === 7));
    if (bankerDraws) banker.push(deck.pop());
  }

  const p = bacTotal(player);
  const k = bacTotal(banker);
  const winner = p > k ? 'player' : k > p ? 'banker' : 'tie';

  let payout = 0;
  if (winner === 'tie') payout = side === 'tie' ? bet * 9 : bet;
  else if (winner === side) payout = side === 'banker' ? Math.floor(bet * 1.95) : bet * 2;

  return { player, banker, p, k, winner, payout };
}

/* ----------------------------------------------------------------- keno */
// 40 numbers, 10 drawn. Pick 1–10. Each pick count has its own pay table,
// built from the exact hypergeometric odds and scaled to 95% RTP.

export const KENO_NUMBERS = 40;
export const KENO_DRAWN = 10;

const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i += 1) r = (r * (n - k + i)) / i;
  return r;
};

export const kenoChance = (picks, hits) => (
  choose(picks, hits) * choose(KENO_NUMBERS - picks, KENO_DRAWN - hits) / choose(KENO_NUMBERS, KENO_DRAWN)
);

function buildKenoTable(picks) {
  // Pay nothing below roughly a third of the picks, then grow steeply.
  const floor = Math.max(1, Math.ceil(picks * 0.34));
  const raw = Array.from({ length: picks + 1 }, (_, h) => (h < floor ? 0 : 2 ** ((h - floor) * 1.35) * (h === picks ? 2 : 1)));
  const rtp = raw.reduce((s, m, h) => s + m * kenoChance(picks, h), 0);
  const scale = 0.95 / rtp;
  return raw.map((m) => Math.round(m * scale * 10) / 10);
}

export const KENO_TABLES = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, buildKenoTable(i + 1)]));

export function drawKeno() {
  const pool = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, KENO_DRAWN);
}

export function playKeno(bet, picks) {
  const drawn = drawKeno();
  const hits = picks.filter((n) => drawn.includes(n)).length;
  const mult = KENO_TABLES[picks.length][hits];
  return { drawn, hits, mult, payout: Math.floor(bet * mult) };
}

/* ------------------------------------------------------------ lucky wheel */
// A free spin once a day. Averages about 130 coins.

export const WHEEL_PRIZES = [
  { coins: 25, weight: 22, color: '#475569' },
  { coins: 50, weight: 20, color: '#0ea5e9' },
  { coins: 75, weight: 16, color: '#10b981' },
  { coins: 100, weight: 14, color: '#8b5cf6' },
  { coins: 150, weight: 11, color: '#f59e0b' },
  { coins: 250, weight: 9, color: '#ec4899' },
  { coins: 500, weight: 6, color: '#ef4444' },
  { coins: 1000, weight: 2, color: '#facc15' }
];

export function spinWheel() {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
  let roll = randomInt(total);
  for (let i = 0; i < WHEEL_PRIZES.length; i += 1) {
    roll -= WHEEL_PRIZES[i].weight;
    if (roll < 0) return i;
  }
  return 0;
}

/* ---------------------------------------------------------------- limbo */
// Pick a target multiplier; win it if the result reaches it. 97% RTP at any
// target, the same curve as Crash but settled instantly.

export const LIMBO_MIN = 1.01;
export const LIMBO_MAX = 1000;
export const limboChance = (target) => Math.min(1, 0.97 / target);

export function playLimbo(bet, target) {
  const t = Math.min(LIMBO_MAX, Math.max(LIMBO_MIN, Math.floor(target * 100) / 100));
  const result = crashPoint();
  const won = result >= t;
  return { result, target: t, payout: won ? Math.floor(bet * t) : 0 };
}

/* --------------------------------------------------------- scratch card */
// Nine panels. Three of a symbol wins that symbol's multiplier; the card is
// decided up front and only the reveal is interactive. About 95% RTP.

export const SCRATCH_PRIZES = [
  { sym: '💎', mult: 50, weight: 1 },
  { sym: '⭐', mult: 10, weight: 4 },
  { sym: '🍀', mult: 5, weight: 8 },
  { sym: '🍒', mult: 2, weight: 18 },
  { sym: '🔔', mult: 1, weight: 20 }
];
const SCRATCH_TOTAL = 196; // weights above sum to 51; the other 145 are losing cards

export function dealScratch(bet) {
  let roll = randomInt(SCRATCH_TOTAL);
  let prize = null;
  for (const p of SCRATCH_PRIZES) {
    if (roll < p.weight) { prize = p; break; }
    roll -= p.weight;
  }
  const symbols = SCRATCH_PRIZES.map((p) => p.sym);
  const cells = [];
  if (prize) cells.push(prize.sym, prize.sym, prize.sym);
  // Fill the rest with at most two of any symbol (and never a third prize symbol).
  const used = Object.fromEntries(symbols.map((s) => [s, prize && s === prize.sym ? 3 : 0]));
  while (cells.length < 9) {
    const s = symbols[randomInt(symbols.length)];
    if (used[s] < 2) { used[s] += 1; cells.push(s); }
  }
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return { cells, prize, payout: prize ? bet * prize.mult : 0 };
}
