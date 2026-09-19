import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles, Repeat, Zap, Trophy, Clover, History, Coins, Store, FlaskConical, ArrowUpCircle, Gem, Gift, Flame, Search, BadgeCheck, ShieldCheck
} from 'lucide-react';
import {
  addDoc, collection, doc, increment, onSnapshot, serverTimestamp, updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import {
  AURAS, auraById, rollAura, formatChance, LUCKY_BOOST, CUTSCENE_AT, tierOf,
  pointsFor, coinsFor, POTIONS, UPGRADES, upgradeCost, luckFor, dailyBonusFor, clampOwnerLuck, OWNER_LUCK_MAX,
  PITY_AT, comboMult, sellValue, dailyTarget, targetReward
} from '../lib/rng';
import RngHub, { AuraDetail, RarityChart } from '../components/RngHub';
import { copyText } from '../lib/social';
import { currentStreak, todayKey } from '../lib/social';
import { play } from '../lib/sound';
import { PageHead, Tabs, UserLink } from '../components/ui';
import AuraName, { auraVars } from '../components/AuraName';

// Progress rides on the account document as `rng`, which members may already
// write. Rolls are saved in batches: every write fans out to anyone listening
// on the accounts collection, and auto-roll would otherwise write every second.
const SAVE_EVERY_MS = 10_000;
const RANK_LIMIT = 100;
// Matches isPlausibleRound in firestore.rules: one wallet write can raise the
// balance by at most this much, so bigger payouts land in instalments.
const MAX_WIN_WRITE = 100_000;

// How long each reveal tier holds the screen, and how long the build-up runs
// before a rare one lands.
const CUTSCENE_MS = [0, 2600, 3200, 4300, 5600];
const SUSPENSE_MS = [0, 0, 900, 1500, 2200];

const EMPTY = {
  rolls: 0, counts: {}, best: 'common', bestRoll: 1,
  points: 0, pointsEarned: 0, coinsEarned: 0,
  upgrades: {}, potion: null, bonusDay: '', day: '', dayRolls: 0, ownerLuck: 1, ownerSpeed: 100,
  sinceRare: 0, combo: 0, bestCombo: 0, favorites: [], found: {}, milestones: [], tiersClaimed: [],
  targetDay: '', potionHour: 0, themes: ['default'], theme: 'default', rebirths: 0, sold: 0, autoSellBelow: 0
};

// Everything saved to the account besides the Owner-only fields.
const SAVED_KEYS = [
  'rolls', 'counts', 'best', 'bestRoll', 'points', 'pointsEarned', 'coinsEarned', 'upgrades', 'potion',
  'bonusDay', 'day', 'dayRolls', 'sinceRare', 'combo', 'bestCombo', 'favorites', 'found', 'milestones',
  'tiersClaimed', 'targetDay', 'potionHour', 'themes', 'theme', 'rebirths', 'sold', 'autoSellBelow'
];

// Owner roll speed, as a percentage of the normal roll time: 0 is instant.
const SPEED_MAX = 300;

// Owner bulk rolls.
const BATCH_MAX = 1_000_000;
const BATCH_PRESETS = [10, 100, 1_000, 10_000, 100_000, 1_000_000];
const BATCH_CHUNK = 20_000;
const clampSpeed = (n) => Math.min(SPEED_MAX, Math.max(0, Math.round(Number(n)) || 0));
const SPEED_PRESETS = [
  { value: 0, label: 'Instant' },
  { value: 10, label: '10%' },
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 100, label: 'Normal' },
  { value: 200, label: 'Slow' }
];

const OWNER_PRESETS = [1, 10, 100, 1_000, 100_000, 1_000_000, 1_000_000_000];
const shortNumber = (n) => (n >= 1e9 ? `${n / 1e9}B` : n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Math.floor(n).toLocaleString();

// A ring of sparks thrown outward. Remounted (via key) for every burst.
function Burst({ count = 18, spread = 110, size = 6 }) {
  return (
    <span className="burst" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            '--a': `${(360 / count) * i + (i % 2 ? 7 : -7)}deg`,
            '--d': `${spread * (0.6 + ((i * 37) % 10) / 25)}px`,
            '--s': `${size * (0.6 + ((i * 53) % 10) / 20)}px`,
            '--t': `${0.6 + ((i * 29) % 10) / 25}s`
          }}
        />
      ))}
    </span>
  );
}

function RankRow({ player, me, board }) {
  const aura = auraById(player.rng.best);
  const rolls = `${player.rng.rolls.toLocaleString()} rolls`;
  const roll = `1 in ${player.top.toLocaleString()}`;
  return (
    <li className={me ? 'rng-me' : ''} data-rank={player.rank}>
      <UserLink to={player.id}>{player.displayName || 'Astral member'}</UserLink>
      <AuraName aura={aura} />
      <small>{board === 'rolls' ? `${rolls} · ${roll}` : `${roll} · ${rolls}`}</small>
    </li>
  );
}

export default function RngPage() {
  const { accountId, profile, balance, isOwner } = useSession();
  // Owner luck only ever applies to an Owner. The role comes from roleIds,
  // which the rules keep Owner-only, so a saved ownerLuck does nothing for
  // anyone else.
  const isOwnerRef = useRef(isOwner);
  isOwnerRef.current = isOwner;
  const [skipReveals, setSkipReveals] = useState(false);
  const skipRef = useRef(skipReveals);
  skipRef.current = skipReveals;
  const withOwnerLuck = (s) => ({ ...s, ownerLuck: isOwnerRef.current ? s.ownerLuck || 1 : 1 });
  const [stats, setStats] = useState(EMPTY);
  const [shown, setShown] = useState(null); // { aura, roll, lucky, spinning, n }
  const [suspense, setSuspense] = useState(0);
  const [recent, setRecent] = useState([]);
  const [rolling, setRolling] = useState(false);
  const [auto, setAuto] = useState(false);
  const [quick, setQuick] = useState(false);
  const [cutscene, setCutscene] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [saveError, setSaveError] = useState('');
  const [board, setBoard] = useState('rarest');
  const [shopTab, setShopTab] = useState('potions');
  const [showFound, setShowFound] = useState('all');
  const [auraSearch, setAuraSearch] = useState('');
  const [auraSort, setAuraSort] = useState('rarity');
  const [toast, setToast] = useState(null);
  const [session, setSession] = useState(() => ({ start: Date.now(), rolls: 0, points: 0, coins: 0, rarest: null }));
  const [stopTarget, setStopTarget] = useState('');
  const [stopAfter, setStopAfter] = useState(0);
  const [detail, setDetail] = useState(null);
  const stopTargetRef = useRef(stopTarget);
  stopTargetRef.current = stopTarget;
  const stopAfterRef = useRef(stopAfter);
  stopAfterRef.current = stopAfter;

  // A rare find while the tab is in the background shows up in the tab title.
  useEffect(() => {
    const restore = () => { if (!document.hidden && document.title.startsWith('✨')) document.title = 'Astral Memes'; };
    document.addEventListener('visibilitychange', restore);
    return () => document.removeEventListener('visibilitychange', restore);
  }, []);

  const noteSession = (rolls, points, coins, landed) => setSession((prev) => ({
    ...prev,
    rolls: prev.rolls + rolls,
    points: prev.points + points,
    coins: prev.coins + coins,
    rarest: !prev.rarest || landed.roll > prev.rarest.roll ? landed : prev.rarest
  }));

  const statsRef = useRef(stats);
  statsRef.current = stats;
  const dirty = useRef(false);
  const loaded = useRef(false);
  // Mirrors loaded.current for rendering: a ref alone wouldn't re-render when a
  // member with no saved progress finishes loading.
  const [isLoaded, setIsLoaded] = useState(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const quickRef = useRef(quick);
  quickRef.current = quick;

  // Pick up saved progress once, before the first roll of this visit.
  useEffect(() => {
    if (loaded.current || !profile) return;
    loaded.current = true;
    setIsLoaded(true);
    const saved = profile.rng;
    if (saved && statsRef.current.rolls === 0) {
      setStats({
        ...EMPTY,
        ...saved,
        counts: { ...(saved.counts || {}) },
        upgrades: { ...(saved.upgrades || {}) },
        found: { ...(saved.found || {}) },
        bestRoll: saved.bestRoll || saved.bestChance || 1
      });
    }
  }, [profile]);

  const save = useCallback(async () => {
    // Never save before the stored progress has been read, or it gets overwritten.
    if (!dirty.current || !accountId || !profile || !loaded.current) return;
    dirty.current = false;
    const s = statsRef.current;
    try {
      await updateDoc(doc(db, COL.accounts, accountId), {
        rng: {
          ...Object.fromEntries(SAVED_KEYS.map((k) => [k, s[k] ?? EMPTY[k] ?? null])),
          bestChance: auraById(s.best).chance,
          ownerLuck: isOwnerRef.current ? clampOwnerLuck(s.ownerLuck) : 1,
          ownerSpeed: isOwnerRef.current ? clampSpeed(s.ownerSpeed ?? 100) : 100
        }
      });
      setSaveError('');
    } catch (err) {
      dirty.current = true;
      setSaveError(err.message);
    }
  }, [accountId, profile]);

  const saveRef = useRef(save);
  saveRef.current = save;
  // Clicks (shop, bonus, Owner tools) save right away; saves triggered by rolling
  // go through saveSoon, which spaces them out.
  const saveNow = () => setTimeout(() => saveRef.current(), 0);
  const lastSaveAt = useRef(0);
  const saveTimer = useRef(null);
  const saveSoon = () => {
    if (saveTimer.current) return;
    const delay = Math.max(0, 2000 - (Date.now() - lastSaveAt.current));
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      lastSaveAt.current = Date.now();
      saveRef.current();
    }, delay);
  };

  useEffect(() => {
    const t = setInterval(() => saveRef.current(), SAVE_EVERY_MS);
    const flush = () => saveRef.current();
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(t);
      window.removeEventListener('pagehide', flush);
      saveRef.current();
    };
  }, []);

  useEffect(() => onSnapshot(
    collection(db, COL.accounts),
    (snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setAccounts([])
  ), []);

  const flash = (text, tone = 'info') => {
    setToast({ text, tone, key: Date.now() });
    setTimeout(() => setToast((t) => (t && t.text === text ? null : t)), 2600);
  };

  // Rare finds pay real site coins into the wallet, with a results row so the
  // payout shows up alongside everything else.
  const payCoins = useCallback(async (amount, aura) => {
    if (!accountId || amount <= 0) return false;
    try {
      let left = amount;
      while (left > 0) {
        const step = isOwnerRef.current ? left : Math.min(left, MAX_WIN_WRITE);
        await updateDoc(doc(db, COL.wallets, accountId), {
          balance: increment(step),
          updatedAt: serverTimestamp()
        });
        left -= step;
      }
      await addDoc(collection(db, COL.redemptions), {
        type: 'rng',
        uid: accountId,
        displayName: profile?.displayName || null,
        amount,
        note: `RNG Roll · ${aura.name} (${formatChance(aura.chance)})`,
        createdAt: serverTimestamp()
      });
      return true;
    } catch (err) {
      setSaveError(`Couldn't pay out ${fmt(amount)} coins: ${err.message}`);
      return false;
    }
  }, [accountId, profile]);

  // Rare finds can come several a second at fast speeds, but one wallet can
  // only take about a write a second, so payouts are pooled and paid together.
  const pendingCoins = useRef({ amount: 0, finds: [] });
  const payTimer = useRef(null);
  const queueCoins = useCallback((amount, aura) => {
    pendingCoins.current.amount += amount;
    pendingCoins.current.finds.push(aura);
    if (payTimer.current) return;
    payTimer.current = setTimeout(async () => {
      payTimer.current = null;
      const { amount: total, finds } = pendingCoins.current;
      pendingCoins.current = { amount: 0, finds: [] };
      if (!total) return;
      const rarest = finds.reduce((a, b) => (b.chance > a.chance ? b : a));
      const label = finds.length === 1 ? rarest : { ...rarest, name: `${finds.length} rare finds, best ${rarest.name}` };
      await payCoinsRef.current(total, label);
    }, 1500);
  }, []);
  const payCoinsRef = useRef(payCoins);
  payCoinsRef.current = payCoins;
  const payRef = useRef(queueCoins);
  payRef.current = queueCoins;

  // Pay anything still pooled when leaving the page.
  useEffect(() => () => {
    clearTimeout(payTimer.current);
    const { amount, finds } = pendingCoins.current;
    if (amount && finds.length) payCoinsRef.current(amount, finds.reduce((a, b) => (b.chance > a.chance ? b : a)));
  }, []);

  const roll = useCallback(async () => {
    const s = statsRef.current;
    const n = s.rolls + 1;
    const { luck, lucky, potion } = luckFor(withOwnerLuck(s), n);
    let result = rollAura(luck);
    // Pity: too long without a 1 in 1,000+ means this one is guaranteed.
    const pity = (s.sinceRare || 0) + 1 >= PITY_AT && result.aura.chance < CUTSCENE_AT;
    if (pity) result = rollAura(luck * CUTSCENE_AT);
    const tier = tierOf(result.aura.chance);
    const pace = isOwnerRef.current ? clampSpeed(s.ownerSpeed ?? 100) / 100 : 1;
    const instant = pace === 0;
    const speed = (1 - 0.15 * (s.upgrades.speed || 0)) * pace;

    setRolling(true);
    // Tick through climbing numbers before landing on the real one.
    const frames = instant ? 0 : quickRef.current ? 6 : 12;
    for (let i = 0; i < frames; i += 1) {
      const fake = rollAura(1 + i * i);
      setShown({ ...fake, lucky, spinning: true, n });
      if (i % 2 === 0) play('tick');
      await wait((quickRef.current ? 60 : 40 + i * 9) * speed);
    }

    // Something big is coming: dim the stage and let the numbers race.
    if (SUSPENSE_MS[tier] && !skipRef.current && !instant) {
      setSuspense(tier);
      const until = Date.now() + SUSPENSE_MS[tier] * pace;
      while (Date.now() < until) {
        const fake = rollAura(10 ** (2 + Math.random() * tier * 2.5));
        setShown({ ...fake, lucky, spinning: true, n });
        await wait(70);
      }
      setSuspense(0);
    }

    const today = todayKey();
    const target = dailyTarget(today);
    const hitTarget = result.aura.id === target.id && s.targetDay !== today;
    const combo = result.aura.chance >= 32 ? (s.combo || 0) + 1 : 0;
    const autoSold = (s.counts[result.aura.id] || 0) > 0 && (s.autoSellBelow || 0) > 0 && result.aura.chance < s.autoSellBelow;
    const points = Math.round(pointsFor(result.aura) * comboMult(combo))
      + (autoSold ? sellValue(result.aura) : 0)
      + (hitTarget ? targetReward(target) : 0);
    const coins = coinsFor(result.aura, s.upgrades.magnet || 0);
    const landed = { ...result, lucky, spinning: false, n, points, coins, luck, combo, pity, autoSold };
    setShown(landed);
    setRecent((r) => [landed, ...r].slice(0, 30));
    noteSession(1, points, coins, landed);
    if (!instant || tier >= 1) play(tier >= 2 ? 'epic' : tier === 1 ? 'rare' : result.aura.chance >= 32 ? 'good' : 'land');
    if (coins > 0) setTimeout(() => play('coin'), 350);

    setStats((prev) => {
      const id = result.aura.id;
      const counts = autoSold ? prev.counts : { ...prev.counts, [id]: (prev.counts[id] || 0) + 1 };
      const best = result.aura.chance > auraById(prev.best).chance ? id : prev.best;
      const left = prev.potion ? prev.potion.rollsLeft - 1 : 0;
      return {
        ...prev,
        rolls: prev.rolls + 1,
        day: today,
        dayRolls: prev.day === today ? (prev.dayRolls || 0) + 1 : 1,
        counts,
        found: prev.counts[id] ? prev.found : { ...(prev.found || {}), [id]: Date.now() },
        best,
        bestRoll: Math.max(prev.bestRoll || 1, result.roll),
        points: prev.points + points,
        pointsEarned: (prev.pointsEarned || 0) + points,
        coinsEarned: (prev.coinsEarned || 0) + coins,
        potion: prev.potion && left > 0 ? { ...prev.potion, rollsLeft: left } : null,
        sinceRare: result.aura.chance >= CUTSCENE_AT ? 0 : (prev.sinceRare || 0) + 1,
        combo,
        bestCombo: Math.max(prev.bestCombo || 0, combo),
        sold: (prev.sold || 0) + (autoSold ? 1 : 0),
        targetDay: hitTarget ? today : prev.targetDay
      };
    });
    dirty.current = true;
    if (potion && s.potion?.rollsLeft === 1) flash(`${potion.name} wore off.`);
    if (!s.counts[result.aura.id] && result.aura.chance >= 32) flash(`New aura: ${result.aura.name}!`, 'good');
    if (pity) flash('Pity roll! A guaranteed 1 in 1,000+.', 'good');
    if (hitTarget) { flash(`Daily target hit! +${targetReward(target).toLocaleString()} points.`, 'good'); saveSoon(); }
    if (tier >= 1 && document.hidden) document.title = `✨ ${result.aura.name}! · Astral`;

    if (coins > 0) payRef.current(coins, result.aura);

    // Auto-roll stops on the target aura (or anything rarer).
    if (autoRef.current && stopTargetRef.current && result.aura.chance >= auraById(stopTargetRef.current).chance) {
      setAuto(false);
      flash(`Auto stopped: you landed ${result.aura.name}.`, 'good');
    }

    if (result.aura.chance >= CUTSCENE_AT) {
      // Big finds are saved within a couple of seconds rather than waiting for the batch.
      saveSoon();
      if (!skipRef.current) {
        setCutscene({ ...landed, tier });
        await wait(CUTSCENE_MS[tier]);
        setCutscene(null);
      }
    }
    setRolling(false);
  }, []);

  // Auto-roll keeps going until switched off.
  useEffect(() => {
    if (!auto) return undefined;
    let stopped = false;
    (async () => {
      let count = 0;
      while (!stopped && autoRef.current) {
        await roll();
        count += 1;
        if (stopAfterRef.current > 0 && count >= stopAfterRef.current) {
          setAuto(false);
          flash(`Auto stopped after ${count.toLocaleString()} rolls.`, 'good');
          break;
        }
        const st = statsRef.current;
        const pace = isOwnerRef.current ? clampSpeed(st.ownerSpeed ?? 100) / 100 : 1;
        const speed = (1 - 0.15 * (st.upgrades.speed || 0)) * pace;
        // Even "instant" leaves a sliver of time so the page stays responsive.
        await wait(Math.max(40, (quickRef.current ? 200 : 350) * speed));
      }
    })();
    return () => { stopped = true; };
  }, [auto, roll]);

  // Space rolls, like a real roll button.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'a' || e.key === 'A') { setAuto((v) => !v); return; }
      if (e.key === 'q' || e.key === 'Q') { setQuick((v) => !v); return; }
      if (e.code !== 'Space' || e.target.closest?.('button')) return;
      e.preventDefault();
      if (!rolling && !auto) roll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roll, rolling, auto]);

  const buyPotion = (p) => {
    if (statsRef.current.points < p.cost) return;
    setStats((prev) => (prev.points < p.cost ? prev : {
      ...prev, points: prev.points - p.cost, potion: { id: p.id, rollsLeft: p.rolls }
    }));
    dirty.current = true;
    saveNow();
    flash(`${p.name} active: ×${p.luck} luck for ${p.rolls} rolls.`, 'good');
    play('coin');
  };

  const buyUpgrade = (up) => {
    const level = statsRef.current.upgrades[up.id] || 0;
    const cost = upgradeCost(up, level);
    if (level >= up.max || statsRef.current.points < cost) return;
    setStats((prev) => {
      const lvl = prev.upgrades[up.id] || 0;
      if (lvl !== level || prev.points < cost) return prev;
      return { ...prev, points: prev.points - cost, upgrades: { ...prev.upgrades, [up.id]: lvl + 1 } };
    });
    dirty.current = true;
    saveNow();
    flash(`${up.name} is now level ${level + 1}.`, 'good');
    play('coin');
  };

  const streak = currentStreak(profile);
  const bonus = dailyBonusFor(streak);
  const bonusReady = isLoaded && stats.bonusDay !== todayKey();

  const claimBonus = () => {
    const today = todayKey();
    if (statsRef.current.bonusDay === today) return;
    setStats((prev) => (prev.bonusDay === today ? prev : {
      ...prev, points: prev.points + bonus, pointsEarned: (prev.pointsEarned || 0) + bonus, bonusDay: today
    }));
    dirty.current = true;
    saveNow();
    flash(`+${bonus.toLocaleString()} daily bonus points!`, 'good');
    play('rare');
  };

  const ranked = useMemo(() => {
    const players = accounts
      .filter((a) => a.rng?.rolls)
      .map((a) => ({ ...a, top: a.rng.bestRoll || a.rng.bestChance || 1 }));
    players.sort(board === 'rolls'
      ? (a, b) => b.rng.rolls - a.rng.rolls || b.top - a.top
      : (a, b) => b.top - a.top || b.rng.rolls - a.rng.rolls);
    return players.map((a, i) => ({ ...a, rank: i + 1 }));
  }, [accounts, board]);
  const leaders = ranked.slice(0, RANK_LIMIT);
  const myRank = ranked.find((a) => a.id === accountId);

  const best = auraById(stats.best);
  const found = AURAS.filter((a) => stats.counts[a.id]).length;
  const next = luckFor(withOwnerLuck(stats), stats.rolls + 1);
  const ownerLuck = isOwner ? clampOwnerLuck(stats.ownerLuck) : 1;

  const [ownerAura, setOwnerAura] = useState('glitch');
  const [ownerPoints, setOwnerPoints] = useState('');
  const [batchCount, setBatchCount] = useState('1000');
  const [batchProgress, setBatchProgress] = useState(null); // { done, total } while running
  const [batchResult, setBatchResult] = useState(null);

  // Rolls many times in one go. The work runs in chunks so the page keeps
  // drawing a progress bar, then lands as a single update, save and payout.
  const rollMany = async (requested) => {
    const total = Math.min(BATCH_MAX, Math.max(1, Math.floor(Number(requested)) || 0));
    if (!isOwnerRef.current || rolling || batchProgress || auto) return;
    setRolling(true);
    setBatchResult(null);
    setBatchProgress({ done: 0, total });

    const start = statsRef.current;
    const ctx = withOwnerLuck(start);
    let potion = start.potion ? { ...start.potion } : null;
    const hits = {};
    const top = []; // the 30 highest roll numbers
    let points = 0;
    let coins = 0;
    let rarest = null;
    const magnet = start.upgrades.magnet || 0;
    let sinceRare = start.sinceRare || 0;
    let pityRolls = 0;

    for (let done = 0; done < total;) {
      const end = Math.min(total, done + BATCH_CHUNK);
      for (; done < end; done += 1) {
        const n = start.rolls + done + 1;
        ctx.potion = potion;
        const { luck, lucky } = luckFor(ctx, n);
        let r = rollAura(luck);
        if (sinceRare + 1 >= PITY_AT && r.aura.chance < CUTSCENE_AT) { r = rollAura(luck * CUTSCENE_AT); pityRolls += 1; }
        sinceRare = r.aura.chance >= CUTSCENE_AT ? 0 : sinceRare + 1;
        hits[r.aura.id] = (hits[r.aura.id] || 0) + 1;
        const pts = pointsFor(r.aura);
        const cns = coinsFor(r.aura, magnet);
        points += pts;
        coins += cns;
        if (!rarest || r.roll > rarest.roll) rarest = { ...r, n, lucky, points: pts, coins: cns, luck };
        if (top.length < 30 || r.roll > top[top.length - 1].roll) {
          top.push({ ...r, n, lucky, points: pts, coins: cns, luck, spinning: false });
          top.sort((a, b) => b.roll - a.roll);
          if (top.length > 30) top.pop();
        }
        if (potion) {
          potion.rollsLeft -= 1;
          if (potion.rollsLeft <= 0) potion = null;
        }
      }
      setBatchProgress({ done, total });
      await wait(0);
    }

    const newAuras = AURAS.filter((a) => hits[a.id] && !start.counts[a.id]);
    const today = todayKey();
    const target = dailyTarget(today);
    const hitTarget = !!hits[target.id] && start.targetDay !== today;
    if (hitTarget) points += targetReward(target);
    const foundAt = Date.now();
    setStats((prev) => {
      const counts = { ...prev.counts };
      for (const [id, c] of Object.entries(hits)) counts[id] = (counts[id] || 0) + c;
      return {
        ...prev,
        rolls: prev.rolls + total,
        day: today,
        dayRolls: (prev.day === today ? prev.dayRolls || 0 : 0) + total,
        counts,
        best: rarest.aura.chance > auraById(prev.best).chance ? rarest.aura.id : prev.best,
        bestRoll: Math.max(prev.bestRoll || 1, rarest.roll),
        points: prev.points + points,
        pointsEarned: (prev.pointsEarned || 0) + points,
        coinsEarned: (prev.coinsEarned || 0) + coins,
        potion,
        sinceRare,
        found: { ...(prev.found || {}), ...Object.fromEntries(newAuras.filter((a) => !prev.counts[a.id]).map((a) => [a.id, foundAt])) },
        targetDay: hitTarget ? today : prev.targetDay
      };
    });
    dirty.current = true;
    saveNow();
    if (coins > 0) {
      payCoinsRef.current(coins, { ...rarest.aura, name: `${total.toLocaleString()} rolls, best ${rarest.aura.name}` });
    }

    const landed = { ...rarest, spinning: false, n: start.rolls + total, points, coins };
    noteSession(total, points, coins, rarest);
    if (hitTarget) flash(`Daily target hit! +${targetReward(target).toLocaleString()} points.`, 'good');
    if (pityRolls) setTimeout(() => flash(`${pityRolls.toLocaleString()} pity roll${pityRolls === 1 ? '' : 's'} kicked in.`), 2800);
    setShown(landed);
    setRecent((r) => [...top, ...r].slice(0, 30));
    setBatchProgress(null);
    setBatchResult({
      total,
      points,
      coins,
      rarest: landed,
      newAuras,
      hits: AURAS.filter((a) => hits[a.id]).reverse().map((a) => ({ aura: a, count: hits[a.id] }))
    });
    flash(`Rolled ${total.toLocaleString()} times. Best: ${rarest.aura.name}.`, 'good');
    const tier = tierOf(rarest.aura.chance);
    play(tier >= 2 ? 'epic' : tier === 1 ? 'rare' : 'good');
    if (tier >= 1 && !skipRef.current) {
      setCutscene({ ...landed, tier });
      await wait(CUTSCENE_MS[tier]);
      setCutscene(null);
    }
    setRolling(false);
  };

  // Applies a change to the saved progress and saves it straight away. Used by
  // Owner tools and by the hub's claims, purchases and settings.
  const ownerChange = (update, message, sound = 'good') => {
    setStats((prev) => ({ ...prev, ...update(prev) }));
    dirty.current = true;
    saveNow();
    if (message) flash(message, 'good');
    if (message) play(sound);
  };

  const equipAny = async (id) => {
    try {
      await updateDoc(doc(db, COL.accounts, accountId), { title: id });
      flash(id ? `${auraById(id).name} equipped as your title.` : 'Title removed.', 'good');
      play('good');
    } catch (err) { setSaveError(err.message); }
  };

  const giveAura = (id) => ownerChange((prev) => {
    const aura = auraById(id);
    return {
      counts: { ...prev.counts, [id]: (prev.counts[id] || 0) + 1 },
      best: aura.chance > auraById(prev.best).chance ? id : prev.best,
      bestRoll: Math.max(prev.bestRoll || 1, aura.chance)
    };
  }, `Added ${auraById(id).name} to your collection.`);

  // Recomputes "best" from whatever is left, and keeps the best roll number
  // below the next aura up so it still matches the best aura.
  const withBestFrom = (counts, prevBestRoll) => {
    const owned = AURAS.filter((a) => counts[a.id]);
    const best = owned.length ? owned[owned.length - 1] : AURAS[0];
    const above = AURAS[AURAS.indexOf(best) + 1];
    const cap = above ? above.chance - 1 : Number.MAX_SAFE_INTEGER;
    return { counts, best: best.id, bestRoll: Math.max(best.chance, Math.min(prevBestRoll || 1, cap)) };
  };

  const clearTitleIf = (ids) => {
    if (profile?.title && ids.includes(profile.title)) equipAny('');
  };

  const removeAura = (id) => {
    if (!stats.counts[id]) { flash(`You don't have ${auraById(id).name}.`); return; }
    ownerChange((prev) => {
      const counts = { ...prev.counts };
      delete counts[id];
      return withBestFrom(counts, prev.bestRoll);
    }, `Removed ${auraById(id).name} from your collection.`);
    clearTitleIf([id]);
  };

  const removeAll = () => {
    if (!window.confirm('Remove every aura from your collection? Your rolls, points and upgrades stay.')) return;
    ownerChange(() => ({ counts: {}, best: AURAS[0].id, bestRoll: 1 }), 'Collection cleared.');
    clearTitleIf(AURAS.map((a) => a.id));
  };

  // Everything from Common up to and including the picked aura.
  const unlockUpTo = (id) => {
    const cut = AURAS.findIndex((a) => a.id === id);
    const upTo = AURAS.slice(0, cut + 1);
    ownerChange((prev) => {
      const counts = { ...prev.counts };
      for (const a of upTo) counts[a.id] = Math.max(1, counts[a.id] || 0);
      return withBestFrom(counts, Math.max(prev.bestRoll || 1, auraById(id).chance));
    }, `Unlocked ${upTo.length} auras, up to ${auraById(id).name}.`);
  };

  // Drops every aura rarer than the picked one, keeping it and everything below.
  const removeAbove = (id) => {
    const cut = AURAS.findIndex((a) => a.id === id);
    const above = AURAS.slice(cut + 1).filter((a) => stats.counts[a.id]);
    if (!above.length) { flash(`Nothing rarer than ${auraById(id).name} to remove.`); return; }
    ownerChange((prev) => {
      const counts = { ...prev.counts };
      for (const a of above) delete counts[a.id];
      return withBestFrom(counts, prev.bestRoll);
    }, `Removed ${above.length} aura${above.length === 1 ? '' : 's'} rarer than ${auraById(id).name}.`);
    clearTitleIf(above.map((a) => a.id));
  };

  const unlockAll = () => ownerChange((prev) => ({
    counts: Object.fromEntries(AURAS.map((a) => [a.id, Math.max(1, prev.counts[a.id] || 0)])),
    best: AURAS[AURAS.length - 1].id,
    bestRoll: Math.max(prev.bestRoll || 1, AURAS[AURAS.length - 1].chance)
  }), `All ${AURAS.length} auras unlocked.`);

  const setPointsTo = (value) => {
    const n = Math.max(0, Math.floor(Number(value)));
    if (!Number.isFinite(n)) return;
    ownerChange(() => ({ points: n }), `Points set to ${n.toLocaleString()}.`);
    setOwnerPoints('');
  };

  const maxUpgrades = () => ownerChange(() => ({
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]))
  }), 'Every upgrade is maxed.');

  const freePotion = (potion) => ownerChange(() => ({
    potion: { id: potion.id, rollsLeft: potion.rolls }
  }), `${potion.name} active for ${potion.rolls} rolls.`);

  const ownerSpeed = isOwner ? clampSpeed(stats.ownerSpeed ?? 100) : 100;
  const setOwnerSpeed = (value) => {
    setStats((prev) => ({ ...prev, ownerSpeed: clampSpeed(value) }));
    dirty.current = true;
    saveNow();
  };

  const setOwnerLuck = (value) => {
    const v = clampOwnerLuck(value);
    setStats((prev) => ({ ...prev, ownerLuck: v }));
    dirty.current = true;
    saveNow();
  };
  const untilLucky = next.every - (stats.rolls % next.every);
  const activePotion = stats.potion ? POTIONS.find((p) => p.id === stats.potion.id) : null;
  const needle = auraSearch.trim().toLowerCase();
  const favorites = stats.favorites || [];
  const collection_ = AURAS.filter((a) => (
    (!needle || (stats.counts[a.id] && a.name.toLowerCase().includes(needle)) || String(a.chance).includes(needle.replace(/[, ]/g, '')))
    && (showFound === 'all'
      || (showFound === 'favorites' ? favorites.includes(a.id)
        : showFound === 'found' ? stats.counts[a.id] : !stats.counts[a.id]))
  ));
  const dupes = AURAS.reduce((n, a) => n + Math.max(0, (stats.counts[a.id] || 0) - 1), 0);
  const dupeValue = AURAS.reduce((n, a) => n + Math.max(0, (stats.counts[a.id] || 0) - 1) * sellValue(a), 0);

  const toggleFavorite = (a) => ownerChange((prev) => {
    const favs = prev.favorites || [];
    return { favorites: favs.includes(a.id) ? favs.filter((x) => x !== a.id) : [...favs, a.id] };
  }, null);

  const sellAura = (a, amount) => {
    const have = statsRef.current.counts[a.id] || 0;
    const qty = Math.min(amount, have - 1);
    if (qty <= 0) return;
    ownerChange((prev) => {
      const now = prev.counts[a.id] || 0;
      const q = Math.min(qty, now - 1);
      if (q <= 0) return {};
      const gain = q * sellValue(a);
      return {
        counts: { ...prev.counts, [a.id]: now - q },
        points: prev.points + gain,
        pointsEarned: (prev.pointsEarned || 0) + gain,
        sold: (prev.sold || 0) + q
      };
    }, `Sold ${qty.toLocaleString()} ${a.name} for ${(qty * sellValue(a)).toLocaleString()} points.`);
    play('coin');
  };

  const sellAllDupes = () => {
    if (!dupes) return;
    if (!window.confirm(`Sell ${dupes.toLocaleString()} duplicate auras for ${dupeValue.toLocaleString()} points? You keep one of each.`)) return;
    ownerChange((prev) => {
      let gain = 0;
      let q = 0;
      const counts = { ...prev.counts };
      for (const a of AURAS) {
        const extra = Math.max(0, (counts[a.id] || 0) - 1);
        if (extra) { gain += extra * sellValue(a); q += extra; counts[a.id] = 1; }
      }
      return { counts, points: prev.points + gain, pointsEarned: (prev.pointsEarned || 0) + gain, sold: (prev.sold || 0) + q };
    }, `Sold ${dupes.toLocaleString()} duplicates for ${dupeValue.toLocaleString()} points.`);
    play('coin');
  };

  const shareBest = async () => {
    const b = auraById(statsRef.current.best);
    const ok = await copyText(`I rolled ${b.name} (1 in ${(statsRef.current.bestRoll || b.chance).toLocaleString()}) on Astral RNG Roll ✨ ${window.location.origin}/rng`);
    flash(ok ? 'Brag text copied.' : "Couldn't copy.", ok ? 'good' : 'info');
  };

  if (auraSort === 'rarest') collection_.reverse();
  if (auraSort === 'count') collection_.sort((a, b) => (stats.counts[b.id] || 0) - (stats.counts[a.id] || 0));

  const equip = async (a) => {
    const next = profile?.title === a.id ? '' : a.id;
    try {
      await updateDoc(doc(db, COL.accounts, accountId), { title: next });
      flash(next ? `${a.name} equipped as your title.` : 'Title removed.', 'good');
      play('good');
    } catch (err) { setSaveError(err.message); }
  };

  const landedTier = shown && !shown.spinning ? tierOf(shown.aura.chance) : 0;
  const stageClass = [
    `felt rng-stage theme-${stats.theme || 'default'}`,
    shown && !shown.spinning && shown.aura.chance >= 32 ? 'rng-stage-rare' : '',
    suspense ? `rng-suspense rng-suspense-${suspense}` : '',
    landedTier ? `rng-landed-${landedTier}` : ''
  ].join(' ');

  return (
    <div className="stack">
      <PageHead
        eyebrow="Infinite free rolls"
        title="RNG Roll"
        actions={(
          <>
            <span className="chip chip-live"><Gem size={13} /> {fmt(stats.points)} points</span>
            <span className="chip chip-accent"><Coins size={13} /> {balance.toLocaleString()} coins</span>
          </>
        )}
      />

      <div className="card rng">
        <div className={stageClass} style={shown ? auraVars(shown.aura) : undefined}>
          {shown && !shown.spinning && shown.aura.chance >= 32 && (
            <Burst key={shown.n} count={10 + Math.min(20, Math.round(Math.log10(shown.aura.chance) * 4))} spread={90 + landedTier * 30} />
          )}
          {suspense > 0 && <span className="rng-suspense-text">something rare is coming…</span>}
          {shown ? (
            <>
              <span className={shown.spinning ? 'rng-number rng-spinning' : 'rng-number rng-pop'} key={shown.spinning ? 'spin' : `n${shown.n}`}>
                1 in <b>{shown.roll.toLocaleString()}</b>
              </span>
              <AuraName
                key={shown.spinning ? 'spin-name' : `a${shown.n}`}
                aura={shown.aura}
                as="strong"
                className={shown.spinning ? 'rng-name rng-spinning' : 'rng-name rng-pop'}
              />
              {shown.spinning ? (
                <span className="rng-odds">rolling…</span>
              ) : (
                <span className="rng-rewards">
                  <span className="chip"><Gem size={11} /> +{fmt(shown.points)}</span>
                  {shown.coins > 0 && <span className="chip chip-accent rng-coin-pop"><Coins size={11} /> +{fmt(shown.coins)} coins</span>}
                  {shown.lucky && <span className="chip chip-live"><Clover size={11} /> Lucky ×{LUCKY_BOOST}</span>}
                  {shown.combo > 1 && <span className="chip chip-combo">Combo ×{comboMult(shown.combo).toFixed(1)}</span>}
                  {shown.pity && <span className="chip chip-accent">Pity</span>}
                  {shown.autoSold && <span className="chip">Auto-sold</span>}
                  <span className="rng-odds">{shown.aura.name} is {formatChance(shown.aura.chance).toLowerCase()}</span>
                </span>
              )}
            </>
          ) : (
            <>
              <span className="rng-number">1 in <b>?</b></span>
              <strong className="rng-name rng-idle">Roll for an aura</strong>
              <span className="rng-odds">{AURAS.length} auras. Free, and the number has no ceiling.</span>
            </>
          )}
        </div>

        {activePotion && (
          <div className="rng-potion" style={{ '--potion': activePotion.color }}>
            <FlaskConical size={15} />
            <strong>{activePotion.name}</strong>
            <span>×{activePotion.luck} luck</span>
            <span className="rng-potion-bar">
              <i style={{ width: `${(stats.potion.rollsLeft / activePotion.rolls) * 100}%` }} />
            </span>
            <span className="faint">{stats.potion.rollsLeft} rolls left</span>
          </div>
        )}

        <div className="row rng-controls">
          <button className="btn btn-primary rng-roll" onClick={() => roll()} disabled={rolling || auto}>
            <Sparkles size={16} /> Roll
          </button>
          <button className={auto ? 'btn btn-primary' : 'btn'} onClick={() => setAuto((v) => !v)} aria-pressed={auto} disabled={!!batchProgress}>
            <Repeat size={15} /> Auto {auto ? 'on' : 'off'}
          </button>
          <button className={quick ? 'btn btn-primary' : 'btn'} onClick={() => setQuick((v) => !v)} aria-pressed={quick}>
            <Zap size={15} /> Quick {quick ? 'on' : 'off'}
          </button>
        </div>

        <div className="rng-stats">
          <span><small>Rolls</small>{stats.rolls.toLocaleString()}</span>
          <span><small>Luck</small>×{(() => { const l = next.luck / (next.lucky ? LUCKY_BOOST : 1); return l >= 1000 ? Math.round(l).toLocaleString() : l.toFixed(1); })()}</span>
          <span><small>Best aura</small><AuraName aura={best} /></span>
          <span><small>Best roll</small>1 in {(stats.bestRoll || 1).toLocaleString()}</span>
          <span><small>Found</small>{found} / {AURAS.length}</span>
          <span><small>Lucky roll</small>{untilLucky === 1 ? 'next!' : `in ${untilLucky}`}</span>
        </div>
        {saveError && <p className="faint">{saveError}</p>}
      </div>

      {isOwner && (
        <div className="card owner-tools">
          <div className="spread">
            <h2 className="rng-heading" style={{ margin: 0 }}><ShieldCheck size={16} /> Owner tools</h2>
            <span className={ownerLuck > 1 ? 'chip chip-accent' : 'chip'}>Owner luck ×{ownerLuck.toLocaleString()}</span>
          </div>
          <p className="faint" style={{ margin: '6px 0 12px' }}>Only you can see this. It multiplies your luck on top of charms, potions and lucky rolls.</p>
          <div className="owner-presets">
            {OWNER_PRESETS.map((n) => (
              <button key={n} type="button" className={ownerLuck === n ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setOwnerLuck(n)}>
                ×{shortNumber(n)}
              </button>
            ))}
          </div>
          <div className="row wrap" style={{ marginTop: 12, gap: 10 }}>
            <label className="row" style={{ gap: 8 }}>
              <span className="label">Custom</span>
              <input
                className="input bet-input owner-luck-input"
                type="number"
                min={1}
                max={OWNER_LUCK_MAX}
                value={ownerLuck}
                onChange={(e) => setOwnerLuck(e.target.value)}
                aria-label="Owner luck multiplier"
              />
            </label>
            <input
              className="owner-luck-slider grow"
              type="range"
              min={0}
              max={9}
              step={0.01}
              value={Math.log10(ownerLuck)}
              onChange={(e) => setOwnerLuck(Math.round(10 ** Number(e.target.value)))}
              aria-label="Owner luck (log scale)"
            />
          </div>
          <div className="owner-speed">
            <span className="label">
              Roll speed · {ownerSpeed === 0 ? 'Instant' : ownerSpeed === 100 ? 'Normal' : `${ownerSpeed}% of normal time`}
            </span>
            <div className="owner-presets">
              {SPEED_PRESETS.map((preset) => (
                <button key={preset.value} type="button" className={ownerSpeed === preset.value ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setOwnerSpeed(preset.value)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              className="owner-luck-slider"
              type="range"
              min={0}
              max={SPEED_MAX}
              step={5}
              value={ownerSpeed}
              onChange={(e) => setOwnerSpeed(e.target.value)}
              aria-label="Roll speed (percent of normal roll time)"
            />
            <span className="faint">Left is faster. Works with Roll, Auto and Quick; Instant skips the animation entirely.</span>
          </div>
          <div className="owner-speed owner-batch">
            <span className="label">Roll many at once</span>
            <div className="owner-presets">
              {BATCH_PRESETS.map((n) => (
                <button key={n} type="button" className="btn btn-sm" onClick={() => rollMany(n)} disabled={rolling || auto || !!batchProgress}>
                  ×{shortNumber(n)}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input
                className="input bet-input"
                type="number"
                min={1}
                max={BATCH_MAX}
                value={batchCount}
                onChange={(e) => setBatchCount(e.target.value)}
                aria-label="Number of rolls"
              />
              <button type="button" className="btn btn-sm btn-primary" onClick={() => rollMany(batchCount)} disabled={rolling || auto || !!batchProgress || !(Number(batchCount) >= 1)}>
                <Sparkles size={13} /> Roll {Math.min(BATCH_MAX, Math.max(1, Math.floor(Number(batchCount)) || 1)).toLocaleString()} times
              </button>
            </div>
            {batchProgress && (
              <div className="batch-progress" role="progressbar" aria-valuenow={batchProgress.done} aria-valuemax={batchProgress.total}>
                <i style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
                <span>{batchProgress.done.toLocaleString()} / {batchProgress.total.toLocaleString()}</span>
              </div>
            )}
            {batchResult && !batchProgress && (
              <div className="batch-result">
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="chip">{batchResult.total.toLocaleString()} rolls</span>
                  <span className="chip chip-live"><Gem size={11} /> +{fmt(batchResult.points)}</span>
                  {batchResult.coins > 0 && <span className="chip chip-accent"><Coins size={11} /> +{fmt(batchResult.coins)}</span>}
                  <span className="chip">Best <AuraName aura={batchResult.rarest.aura} /> · 1 in {batchResult.rarest.roll.toLocaleString()}</span>
                </div>
                {!!batchResult.newAuras.length && (
                  <p className="faint">
                    {batchResult.newAuras.length} new: {batchResult.newAuras.slice(-8).reverse().map((a) => a.name).join(', ')}
                    {batchResult.newAuras.length > 8 ? ' and more' : ''}
                  </p>
                )}
                <div className="batch-hits">
                  {batchResult.hits.slice(0, 24).map((h) => (
                    <span key={h.aura.id} className="batch-hit" style={auraVars(h.aura)}>
                      <AuraName aura={h.aura} /> <b>×{h.count.toLocaleString()}</b>
                    </span>
                  ))}
                  {batchResult.hits.length > 24 && <span className="faint">+{batchResult.hits.length - 24} more</span>}
                </div>
              </div>
            )}
          </div>
          <label className="row faint" style={{ marginTop: 10, gap: 8 }}>
            <input type="checkbox" checked={skipReveals} onChange={(e) => setSkipReveals(e.target.checked)} />
            Skip full-screen reveals (handy with high luck)
          </label>
          {ownerLuck > 1 && (
            <p className="faint" style={{ marginTop: 8 }}>
              Heads up: rolls made with boosted luck still count for rankings, and rare finds still pay coins.
            </p>
          )}

          <div className="owner-grid">
            <div className="owner-block">
              <span className="label">Title and auras</span>
              <select className="input" value={ownerAura} onChange={(e) => setOwnerAura(e.target.value)} aria-label="Pick an aura">
                {[...AURAS].reverse().map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {formatChance(a.chance)}{stats.counts[a.id] ? ' ✓' : ''}</option>
                ))}
              </select>
              <div className="owner-aura-preview"><AuraName aura={auraById(ownerAura)} as="strong" /></div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => equipAny(ownerAura)}>
                  <BadgeCheck size={13} /> {profile?.title === ownerAura ? 'Equipped' : 'Equip as title'}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => giveAura(ownerAura)}>Give me this aura</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => removeAura(ownerAura)} disabled={!stats.counts[ownerAura]}>Remove this aura</button>
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => unlockUpTo(ownerAura)}>
                  Unlock everything up to {auraById(ownerAura).name}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => removeAbove(ownerAura)}
                  disabled={!AURAS.slice(AURAS.findIndex((a) => a.id === ownerAura) + 1).some((a) => stats.counts[a.id])}
                >
                  Remove everything rarer
                </button>
                {profile?.title && <button type="button" className="btn btn-sm btn-ghost" onClick={() => equipAny('')}>Remove title</button>}
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={unlockAll}>Unlock all {AURAS.length} auras</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={removeAll} disabled={!Object.keys(stats.counts).length}>Remove all auras</button>
              </div>
            </div>

            <div className="owner-block">
              <span className="label">Points · {fmt(stats.points)}</span>
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input bet-input"
                  type="number"
                  min={0}
                  value={ownerPoints}
                  onChange={(e) => setOwnerPoints(e.target.value)}
                  placeholder="Amount"
                  aria-label="Set points"
                />
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setPointsTo(ownerPoints)} disabled={ownerPoints === ''}>Set</button>
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                {[10_000, 1_000_000, 1_000_000_000].map((n) => (
                  <button key={n} type="button" className="btn btn-sm" onClick={() => setPointsTo(stats.points + n)}>+{shortNumber(n)}</button>
                ))}
              </div>
              <span className="label" style={{ marginTop: 6 }}>Upgrades and potions</span>
              <button type="button" className="btn btn-sm" onClick={maxUpgrades}>Max all upgrades</button>
              <div className="row wrap" style={{ gap: 6 }}>
                {POTIONS.map((potion) => (
                  <button key={potion.id} type="button" className="btn btn-sm" onClick={() => freePotion(potion)} style={{ '--potion': potion.color }}>
                    <FlaskConical size={12} /> {potion.name.replace(' Potion', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={bonusReady ? 'card rng-bonus ready' : 'card rng-bonus'}>
        <span className="rng-bonus-icon"><Gift size={22} /></span>
        <span className="grow">
          <strong>Daily bonus</strong>
          <span className="muted">
            {bonusReady
              ? ` +${bonus.toLocaleString()} points waiting for you.`
              : ' Claimed today. Come back tomorrow.'}
            {' '}<Flame size={12} /> {streak}-day streak · a longer streak pays more, up to {dailyBonusFor(20).toLocaleString()}.
          </span>
        </span>
        <button className="btn btn-primary" onClick={claimBonus} disabled={!bonusReady}>
          <Gift size={15} /> {bonusReady ? `Claim ${bonus.toLocaleString()}` : 'Claimed'}
        </button>
      </div>

      <RngHub
        stats={stats}
        update={ownerChange}
        luck={next.luck / (next.lucky ? LUCKY_BOOST : 1)}
        session={session}
        stopTarget={stopTarget}
        setStopTarget={setStopTarget}
        stopAfter={stopAfter}
        setStopAfter={setStopAfter}
        autoSell={stats.autoSellBelow || 0}
        setAutoSell={(v) => ownerChange(() => ({ autoSellBelow: v }), v ? 'Auto-sell on.' : 'Auto-sell off.')}
        onShare={shareBest}
      />

      <section className="card">
        <div className="spread rng-heading">
          <h2 className="rng-heading" style={{ margin: 0 }}><Store size={15} /> Shop</h2>
          <Tabs
            value={shopTab}
            onChange={setShopTab}
            options={[{ value: 'potions', label: 'Potions' }, { value: 'upgrades', label: 'Upgrades' }]}
          />
        </div>
        <p className="faint rng-shop-note">
          Every roll earns points, and rarer auras earn more. Auras of {formatChance(CUTSCENE_AT)} or rarer also pay coins
          into your wallet. You've earned {fmt(stats.pointsEarned || 0)} points and {fmt(stats.coinsEarned || 0)} coins here.
        </p>

        {shopTab === 'potions' ? (
          <div className="rng-shop">
            {POTIONS.map((p) => (
              <div key={p.id} className="rng-item" style={{ '--potion': p.color }}>
                <span className="rng-item-icon"><FlaskConical size={20} /></span>
                <strong>{p.name}</strong>
                <span className="rng-item-desc">×{p.luck} luck for {p.rolls} rolls</span>
                <button className="btn btn-sm btn-primary" onClick={() => buyPotion(p)} disabled={stats.points < p.cost}>
                  <Gem size={12} /> {fmt(p.cost)}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rng-shop">
            {UPGRADES.map((up) => {
              const level = stats.upgrades[up.id] || 0;
              const maxed = level >= up.max;
              const cost = upgradeCost(up, level);
              return (
                <div key={up.id} className="rng-item">
                  <span className="rng-item-icon"><ArrowUpCircle size={20} /></span>
                  <strong>{up.name}</strong>
                  <span className="rng-item-desc">
                    {maxed ? up.describe(level) : `Next: ${up.describe(level + 1)}`}
                  </span>
                  <span className="rng-pips" aria-label={`Level ${level} of ${up.max}`}>
                    {Array.from({ length: up.max }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}
                  </span>
                  <button className="btn btn-sm btn-primary" onClick={() => buyUpgrade(up)} disabled={maxed || stats.points < cost}>
                    {maxed ? 'Maxed' : <><Gem size={12} /> {fmt(cost)}</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="rng-columns">
        <section className="card">
          <h2 className="rng-heading"><History size={15} /> Recent rolls</h2>
          {recent.length ? (
            <ol className="rng-recent">
              {recent.map((r) => (
                <li key={r.n} className={r.aura.chance >= CUTSCENE_AT ? 'rng-recent-rare' : ''} style={auraVars(r.aura)}>
                  <span className="rng-recent-n">#{r.n.toLocaleString()}</span>
                  <AuraName aura={r.aura} />
                  <span className="rng-recent-roll">
                    {r.lucky && <Clover size={11} />}
                    <span className="rng-recent-pts">+{fmt(r.points)}</span>
                    {r.coins > 0 && <span className="rng-recent-coins">+{fmt(r.coins)}c</span>}
                    1 in {r.roll.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="faint">Your rolls show up here. Press Roll or hit space.</p>}
        </section>

        <section className="card">
          <div className="spread rng-heading">
            <h2 className="rng-heading" style={{ margin: 0 }}>
              <Trophy size={15} /> Rankings <small className="faint">top {RANK_LIMIT}</small>
            </h2>
            <Tabs
              value={board}
              onChange={setBoard}
              options={[{ value: 'rarest', label: 'Rarest' }, { value: 'rolls', label: 'Most rolls' }]}
            />
          </div>
          {leaders.length ? (
            <>
              <ol className="rng-leaders">
                {leaders.map((a) => <RankRow key={a.id} player={a} me={a.id === accountId} board={board} />)}
              </ol>
              {myRank && myRank.rank > RANK_LIMIT && (
                <ol className="rng-leaders rng-pinned">
                  <RankRow player={myRank} me board={board} />
                </ol>
              )}
              <p className="faint rng-total">{ranked.length.toLocaleString()} ranked {ranked.length === 1 ? 'player' : 'players'}</p>
            </>
          ) : <p className="faint">Nobody has rolled yet.</p>}
        </section>
      </div>

      <section className="card">
        <div className="spread rng-heading">
          <h2 className="rng-heading" style={{ margin: 0 }}>
            Collection <small className="faint">{found} / {AURAS.length}</small>
          </h2>
          <Tabs
            value={showFound}
            onChange={setShowFound}
            options={[{ value: 'all', label: 'All' }, { value: 'found', label: 'Found' }, { value: 'missing', label: 'Missing' }, { value: 'favorites', label: '★ Favourites' }]}
          />
        </div>
        <div className="rng-progress"><i style={{ width: `${(found / AURAS.length) * 100}%` }} /></div>
        <RarityChart stats={stats} />
        <div className="row wrap rng-collection-tools">
          <span className="search" style={{ flex: 1, minWidth: 180 }}>
            <Search size={14} />
            <input value={auraSearch} onChange={(e) => setAuraSearch(e.target.value)} placeholder="Search found auras or odds…" aria-label="Search auras" />
          </span>
          <select className="input" value={auraSort} onChange={(e) => setAuraSort(e.target.value)} aria-label="Sort auras">
            <option value="rarity">Commonest first</option>
            <option value="rarest">Rarest first</option>
            <option value="count">Most rolled</option>
          </select>
          <button type="button" className="btn btn-sm" onClick={sellAllDupes} disabled={!dupes}>
            <Gem size={12} /> Sell {dupes.toLocaleString()} duplicates{dupes ? ` · +${fmt(dupeValue)}` : ''}
          </button>
          <span className="faint">Tap an aura for details, favourites, selling and titles.</span>
        </div>
        <div className="rng-grid">
          {collection_.map((a) => {
            const count = stats.counts[a.id] || 0;
            return (
              <div
                key={a.id}
                className={`${count ? 'rng-cell' : 'rng-cell rng-locked'}${profile?.title === a.id ? ' equipped' : ''}`}
                style={count ? auraVars(a) : undefined}
                onClick={() => setDetail(a)}
                onKeyDown={(e) => { if (e.key === 'Enter') setDetail(a); }}
                role="button"
                tabIndex={0}
                title="Details"
              >
                {favorites.includes(a.id) && <span className="rng-fav" aria-label="Favourite">★</span>}
                {profile?.title === a.id && <span className="rng-equipped"><BadgeCheck size={12} /> Title</span>}
                {count ? <AuraName aura={a} as="strong" /> : <strong>???</strong>}
                <small>{formatChance(a.chance)}</small>
                <span className="rng-cell-rewards">
                  <span className="rng-cell-pts"><Gem size={10} /> {fmt(pointsFor(a))}</span>
                  {coinsFor(a) > 0 && <span className="rng-cell-coins"><Coins size={10} /> {fmt(coinsFor(a))}</span>}
                </span>
                {count > 0 && <small className="rng-count">×{count.toLocaleString()}</small>}
              </div>
            );
          })}
        </div>
      </section>

      {detail && (
        <AuraDetail
          aura={detail}
          stats={stats}
          luck={next.luck / (next.lucky ? LUCKY_BOOST : 1)}
          magnet={stats.upgrades.magnet || 0}
          titleId={profile?.title}
          onClose={() => setDetail(null)}
          onEquip={() => equip(detail)}
          onFavorite={() => toggleFavorite(detail)}
          onSell={(qty) => sellAura(detail, qty)}
        />
      )}

      {toast && createPortal(
        <div key={toast.key} className={`rng-toast rng-toast-${toast.tone}`} role="status">{toast.text}</div>,
        document.body
      )}

      {/* Portalled out: the card's clip-path and backdrop blur would otherwise
          trap a fixed overlay inside it. */}
      {cutscene && createPortal(
        <div
          className={`rng-cutscene rng-cutscene-t${cutscene.tier}`}
          style={{ ...auraVars(cutscene.aura), '--hold': `${CUTSCENE_MS[cutscene.tier]}ms` }}
          onClick={() => setCutscene(null)}
          role="alert"
        >
          {cutscene.tier >= 3 && <span className="rng-rays" />}
          {cutscene.tier >= 2 && <span className="rng-flash" />}
          <span className="rng-cutscene-ring" />
          {cutscene.tier >= 2 && <span className="rng-cutscene-ring rng-ring-2" />}
          {cutscene.tier >= 3 && <span className="rng-cutscene-ring rng-ring-3" />}
          {cutscene.tier >= 4 && <span className="rng-blackout"><em>reality is breaking…</em></span>}
          <div className="rng-cutscene-body">
            <Burst count={14 + cutscene.tier * 10} spread={160 + cutscene.tier * 70} size={7 + cutscene.tier * 2} />
            <span className="rng-number">1 in <b>{cutscene.roll.toLocaleString()}</b></span>
            <AuraName aura={cutscene.aura} as="strong" className="rng-cutscene-name" reveal={cutscene.tier >= 3} />
            <span className="rng-odds">{formatChance(cutscene.aura.chance)} aura</span>
            <span className="rng-rewards">
              <span className="chip"><Gem size={12} /> +{fmt(cutscene.points)} points</span>
              {cutscene.coins > 0 && <span className="chip chip-accent"><Coins size={12} /> +{fmt(cutscene.coins)} coins</span>}
            </span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
