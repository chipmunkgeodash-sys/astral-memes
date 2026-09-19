import { useMemo, useRef, useState } from 'react';
import { Gift, TrendingUp } from 'lucide-react';
import { addDoc, collection, doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { WHEEL_PRIZES, spinWheel } from '../lib/casino';
import { millis, todayKey } from '../lib/social';
import { confettiFrom } from '../lib/confetti';
import { play } from '../lib/sound';

const SLICE = 360 / WHEEL_PRIZES.length;
const wheelBackground = `conic-gradient(${WHEEL_PRIZES.map((p, i) => `${p.color} ${i * SLICE}deg ${(i + 1) * SLICE}deg`).join(', ')})`;

// A free spin every day. The day is recorded on the account before the prize
// is paid, so refreshing mid-spin can't earn a second go.
export function LuckyWheel() {
  const { accountId, profile } = useSession();
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [prize, setPrize] = useState(null);
  const [error, setError] = useState('');
  const wheelRef = useRef(null);

  const today = todayKey();
  const used = profile?.wheelDay === today;

  const spin = async () => {
    if (used || spinning || !accountId) return;
    setSpinning(true); setError(''); setPrize(null);
    try {
      await updateDoc(doc(db, COL.accounts, accountId), { wheelDay: today });
    } catch (err) { setError(err.message); setSpinning(false); return; }

    const index = spinWheel();
    // Land the pointer (at the top) in the middle of the chosen slice.
    const target = 360 * 6 + (360 - (index * SLICE + SLICE / 2));
    setAngle((a) => a - (a % 360) + target);
    play('tick');

    setTimeout(async () => {
      const coins = WHEEL_PRIZES[index].coins;
      try {
        await updateDoc(doc(db, COL.wallets, accountId), { balance: increment(coins), updatedAt: serverTimestamp() });
        await addDoc(collection(db, COL.redemptions), {
          type: 'wheel', uid: accountId, displayName: profile?.displayName || null,
          amount: coins, note: `Lucky wheel · ${coins} coins`, createdAt: serverTimestamp()
        });
        setPrize(coins);
        confettiFrom(wheelRef.current, coins >= 500 ? 120 : 60);
        play(coins >= 500 ? 'epic' : 'win');
      } catch (err) { setError(err.message); }
      setSpinning(false);
    }, 4200);
  };

  return (
    <div className={used ? 'card wheel-card' : 'card wheel-card ready'}>
      <div className="wheel-wrap" ref={wheelRef}>
        <span className="wheel-pointer" />
        <div className="wheel" style={{ background: wheelBackground, transform: `rotate(${angle}deg)` }}>
          {WHEEL_PRIZES.map((p, i) => (
            <span key={p.coins} className="wheel-label" style={{ transform: `rotate(${i * SLICE + SLICE / 2}deg) translateY(-62px)` }}>
              {p.coins}
            </span>
          ))}
        </div>
        <span className="wheel-hub" />
      </div>
      <div className="grow stack" style={{ gap: 6 }}>
        <span className="eyebrow" style={{ margin: 0 }}>Free daily spin</span>
        <strong className="wheel-title">{prize ? `You won ${prize.toLocaleString()} coins!` : used ? 'Spun today — back tomorrow' : 'Spin the lucky wheel'}</strong>
        <span className="muted">Win 25 to 1,000 coins, once a day.</span>
        {error && <span className="error">{error}</span>}
        <div>
          <button className="btn btn-primary" onClick={spin} disabled={used || spinning}>
            <Gift size={15} /> {spinning ? 'Spinning…' : used ? 'Come back tomorrow' : 'Spin'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Scrolling ticker of recent big wins across the whole site.
export function BigWins({ rows }) {
  const wins = useMemo(() => rows
    .filter((r) => r.amount >= 200)
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
    .slice(0, 16), [rows]);

  if (!wins.length) return null;
  const items = [...wins, ...wins];
  return (
    <div className="ticker" aria-label="Recent big wins">
      <span className="ticker-label"><TrendingUp size={13} /> Big wins</span>
      <div className="ticker-track">
        <div className="ticker-items" style={{ '--count': wins.length }}>
          {items.map((w, i) => (
            <span key={`${w.id}-${i}`} className="ticker-item" aria-hidden={i >= wins.length}>
              <b>{w.displayName || 'Someone'}</b> won <em>+{w.amount.toLocaleString()}</em>
              <small>{(w.note || '').split('·')[0].trim()}</small>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
