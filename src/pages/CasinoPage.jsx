import { useEffect, useState } from 'react';
import { Coins, Gift, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import {
  doc, updateDoc, increment, serverTimestamp, collection,
  query, onSnapshot, addDoc, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, DAILY_POINTS } from '../lib/schema';
import { useSession } from '../lib/session';
import { msUntilNextClaim, formatCountdown } from '../lib/daily';
import { PageHead, Empty, ErrorNote, Tabs, UserLink } from '../components/ui';
import Arcade from '../components/Arcade';
import Avatar from '../components/Avatar';

export default function CasinoPage() {
  const { accountId, wallet, balance, profile, justClaimed } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bets, setBets] = useState([]);
  const [tab, setTab] = useState('mine');
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // One listener for the whole ledger; split by account in the view. Bets are
  // visible to every member — it's a casino, the wins are the fun part.
  useEffect(() => onSnapshot(
    query(collection(db, COL.redemptions), limit(400)),
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.type === 'bet')
        .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      setBets(rows);
    },
    () => setBets([])
  ), []);

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

  const wait = msUntilNextClaim(wallet);
  const mine = bets.filter((b) => b.uid === accountId).slice(0, 20);
  const everyone = bets.slice(0, 40);
  const shown = tab === 'mine' ? mine : everyone;

  return (
    <div className="stack">
      <PageHead
        eyebrow="Bet your coins"
        title="Casino"
        actions={<span className="chip chip-accent"><Coins size={13} /> {balance.toLocaleString()}</span>}
      />

      <div className={justClaimed ? 'card feature daily-ready' : 'card feature'}>
        <span className="tile-icon">{justClaimed ? <Gift size={18} /> : <Clock size={18} />}</span>
        <span className="feature-text">
          <span className="eyebrow" style={{ margin: 0 }}>Daily coins</span>
          <strong>{justClaimed ? `+${justClaimed} coins added` : `${DAILY_POINTS} coins, every day`}</strong>
          <span className="muted">
            {justClaimed
              ? 'Added automatically — no button to press.'
              : `Next lot arrives on its own in ${formatCountdown(wait)}.`}
          </span>
        </span>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {balance < 1 ? (
        <Empty
          icon={Coins}
          title="You're out of coins."
          body={`More arrive automatically in ${formatCountdown(wait)}.`}
        />
      ) : (
        <Arcade points={balance} settle={settle} busy={busy} />
      )}

      <section>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2>Results</h2>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'mine', label: `Yours ${mine.length}` },
              { value: 'all', label: 'Everyone' }
            ]}
          />
        </div>

        {!shown.length ? (
          <Empty
            icon={Dice}
            title={tab === 'mine' ? 'No rounds yet.' : 'Nobody has played yet.'}
            body={tab === 'mine' ? 'Play a hand and it shows up here.' : 'Be the first at the tables.'}
          />
        ) : (
          <div className="list">
            {shown.map((b) => (
              <div key={b.id} className="row-item">
                {tab === 'all' && (
                  <Avatar profile={{ id: b.uid, displayName: b.displayName }} size={26} />
                )}
                <span className="me-text grow">
                  {tab === 'all' && (
                    <UserLink to={b.uid}>{b.displayName || 'Astral member'}</UserLink>
                  )}
                  <small className="truncate">{b.note || 'Round'}</small>
                </span>
                <span className={b.amount > 0 ? 'chip chip-live' : 'chip'}>
                  {b.amount > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {b.amount > 0 ? `+${b.amount.toLocaleString()}` : b.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="faint">
        Astral Coins are virtual points inside this site. They have no real-world value
        and can't be bought or cashed out. Results are visible to everyone.
      </p>
    </div>
  );
}

// Small inline die so the empty state doesn't need another icon import.
function Dice(props) {
  return (
    <svg viewBox="0 0 24 24" width={props.size || 20} height={props.size || 20}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function ms(ts) {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}
