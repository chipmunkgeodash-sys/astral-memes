import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { COL, DAILY_POINTS, DAILY_COOLDOWN_MS } from './schema';

// Everyone gets a fixed top-up once a day. The rules enforce the cooldown and
// the exact amount, so this can't be replayed by hammering the button.

export function msUntilNextClaim(wallet) {
  const last = wallet?.lastClaimAt;
  if (!last) return 0;
  const at = typeof last.toMillis === 'function' ? last.toMillis() : 0;
  if (!at) return 0;
  return Math.max(0, at + DAILY_COOLDOWN_MS - Date.now());
}

export function canClaim(wallet) {
  return msUntilNextClaim(wallet) === 0;
}

export function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

export async function claimDaily(accountId) {
  const ref = doc(db, COL.wallets, accountId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      balance: DAILY_POINTS,
      lastClaimAt: serverTimestamp(),
      lastRedemptionId: '',
      updatedAt: serverTimestamp()
    });
    return DAILY_POINTS;
  }

  if (!canClaim(snap.data())) throw new Error('You have already claimed today.');

  await updateDoc(ref, {
    balance: increment(DAILY_POINTS),
    lastClaimAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return DAILY_POINTS;
}
