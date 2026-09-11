import { useEffect, useState } from 'react';
import { Coins, Gift, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import {
  doc, updateDoc, increment, serverTimestamp, collection, query, where, onSnapshot, addDoc, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, DAILY_POINTS } from '../lib/schema';
import { useSession } from '../lib/session';
import { canClaim, msUntilNextClaim, formatCountdown, claimDaily } from '../lib/daily';
import { PageHead, Empty, ErrorNote, Toast } from '../components/ui';
import Arcade from '../components/Arcade';

export default function CasinoPage() {
  const { accountId, wallet, balance, profile } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [history, setHistory] = useState([]);
  const [, tick] = useState(0);

  // Keep the countdown moving without re-reading the wallet.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!accountId) return undefined;
    return onSnapshot(
      query(collection(db, COL.redemptions), where('uid', '==', accountId), limit(100)),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => r.type === 'bet')
          .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
          .slice(0, 12);
        setHistory(rows);
      },
      () => setHistory([])
    );
  }, [accountId]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const claim = async () => {
    if (!accountId) return;
    setBusy(true); setError('');
    try {
      await claimDaily(accountId);
      flash(`+${DAILY_POINTS} coins`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  // Every round resolves to one net change on the wallet, plus a ledger row.
  const settle = async (delta, note) => {
    if (!accountId || !delta) return;
    setBusy(true); setError('');
    try {
      await updateDoc(doc(db, COL.wallets, accountId), {
        balance: increment(delta),
        updatedAt: serverTimestamp()
      });
      await addDoc(collection(db, COL.redemptions), {
        type: 'bet',
        uid: accountId,
        displayName: profile?.displayName || null,
        amount: delta,
        note: note || null,
        createdAt: serverTimestamp()
      });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const ready = canClaim(wallet);
  const wait = msUntilNextClaim(wallet);

  return (
    <div className="stack">
      <PageHead
        eyebrow="Spend what you earn"
        title="Casino"
        actions={<span className="chip chip-accent"><Coins size={13} /> {balance.toLocaleString()}</span>}
      />

      <div className={ready ? 'card feature daily-ready' : 'card feature'}>
        <span className="tile-icon">{ready ? <Gift size={18} /> : <Clock size={18} />}</span>
        <span className="feature-text">
          <span className="eyebrow" style={{ margin: 0 }}>Daily coins</span>
          <strong>{ready ? `${DAILY_POINTS} coins are waiting` : 'Already claimed'}</strong>
          <span className="muted">
            {ready
              ? 'Free every day, whatever happens at the tables.'
              : `Come back in ${formatCountdown(wait)}.`}
          </span>
        </span>
        <button className="btn btn-primary" onClick={claim} disabled={!ready || busy || !accountId}>
          {busy ? 'Claiming…' : ready ? 'Claim' : 'Claimed'}
        </button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {balance < 1 ? (
        <Empty
          icon={Coins}
          title="You're out of coins."
          body={ready ? 'Claim your daily coins above to keep playing.' : `More arrive in ${formatCountdown(wait)}.`}
        />
      ) : (
        <Arcade points={balance} settle={settle} busy={busy} />
      )}

      {!!history.length && (
        <section>
          <h2 style={{ marginBottom: 12 }}>Recent rounds</h2>
          <div className="list">
            {history.map((h) => (
              <div key={h.id} className="row-item">
                <span className={h.amount > 0 ? 'stat-icon' : 'stat-icon lose'}>
                  {h.amount > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                </span>
                <span className="grow truncate">{h.note || 'Round'}</span>
                <span className={h.amount > 0 ? 'chip chip-live' : 'chip'}>
                  {h.amount > 0 ? `+${h.amount.toLocaleString()}` : h.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="faint">
        Astral Coins are virtual points inside this site. They have no real-world value
        and can't be bought or cashed out.
      </p>

      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function ms(ts) {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}
