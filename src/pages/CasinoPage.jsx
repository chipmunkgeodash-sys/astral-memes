import { useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Gift, Clock, TrendingUp, TrendingDown, ShieldAlert, BarChart3, Trophy } from 'lucide-react';
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
import { LuckyWheel, BigWins } from '../components/CasinoExtras';
import Avatar from '../components/Avatar';
import { KEYS, useLocal } from '../lib/local';
import { isToday } from '../lib/social';

// Matches isPlausibleRound in firestore.rules.
const MAX_WIN_WRITE = 100000;

export default function CasinoPage() {
  const { accountId, wallet, balance, profile, justClaimed } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bets, setBets] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [tab, setTab] = useState('mine');
  const [session, setSession] = useState({ net: 0, rounds: 0, peak: 0, low: 0 });
  const [lossLimit, setLossLimit] = useLocal(KEYS.casinoLimit, 0);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const limitRef = useRef(lossLimit);
  limitRef.current = lossLimit;
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
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLedger(all);
      const rows = all
        .filter((r) => r.type === 'bet')
        .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      setBets(rows);
    },
    () => setBets([])
  ), []);

  // Moves `delta` coins and, when there's a note, writes a results row showing
  // `logged` — the round's net, which differs from the delta once the stake
  // has already been taken. Resolves false if the wallet refused the write.
  const settle = async (delta, note, logged = delta) => {
    if (!accountId) return false;
    // A stake that would take this session past the loss limit is refused.
    if (delta < 0 && !note && limitRef.current > 0 && -(sessionRef.current.net + delta) > limitRef.current) {
      setError(`Loss limit reached: you've set a limit of ${Number(limitRef.current).toLocaleString()} coins this session.`);
      return false;
    }
    setBusy(true); setError('');
    try {
      // The wallet rule caps how far one write can raise the balance, so a
      // large win lands in instalments.
      let left = delta;
      while (left !== 0) {
        const step = left > 0 ? Math.min(left, MAX_WIN_WRITE) : left;
        await updateDoc(doc(db, COL.wallets, accountId), {
          balance: increment(step),
          updatedAt: serverTimestamp()
        });
        left -= step;
      }
      // Session numbers move with every stake and payout.
      setSession((s) => {
        const net = s.net + delta;
        return { net, rounds: s.rounds + (note ? 1 : 0), peak: Math.max(s.peak, net), low: Math.min(s.low, net) };
      });
      if (note) {
        await addDoc(collection(db, COL.redemptions), {
          type: 'bet',
          uid: accountId,
          displayName: profile?.displayName || null,
          amount: logged,
          note,
          createdAt: serverTimestamp()
        });
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally { setBusy(false); }
  };

  const wait = msUntilNextClaim(wallet);

  // Per-game breakdown from the game name at the start of each result note.
  const perGame = useMemo(() => {
    const map = new Map();
    for (const b of bets.filter((r) => r.uid === accountId)) {
      const game = (b.note || 'Round').split(' · ')[0];
      const g = map.get(game) || { game, rounds: 0, wins: 0, net: 0 };
      g.rounds += 1;
      g.net += b.amount || 0;
      if (b.amount > 0) g.wins += 1;
      map.set(game, g);
    }
    return [...map.values()].sort((a, b) => b.rounds - a.rounds);
  }, [bets, accountId]);

  const todayBest = useMemo(() => ledger
    .filter((r) => ['bet', 'rng', 'wheel'].includes(r.type) && r.amount > 0 && isToday(r.createdAt))
    .sort((a, b) => b.amount - a.amount)[0], [ledger]);
  const mine = bets.filter((b) => b.uid === accountId).slice(0, 20);
  const everyone = bets.slice(0, 40);
  const shown = tab === 'mine' ? mine : everyone;

  // Lifetime numbers from this member's rows in the ledger (the newest 400
  // rows site-wide, so very old rounds eventually drop out).
  const stats = useMemo(() => {
    const rows = bets.filter((b) => b.uid === accountId).reverse();
    let wins = 0; let net = 0; let biggest = 0; let run = 0; let bestStreak = 0;
    for (const r of rows) {
      net += r.amount || 0;
      if (r.amount > 0) { wins += 1; run += 1; biggest = Math.max(biggest, r.amount); }
      else if (r.amount < 0) run = 0;
      bestStreak = Math.max(bestStreak, run);
    }
    return { rounds: rows.length, wins, net, biggest, bestStreak };
  }, [bets, accountId]);

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

      <BigWins rows={ledger.filter((r) => ['bet', 'rng', 'wheel'].includes(r.type))} />
      {todayBest && (
        <div className="card today-best">
          <Trophy size={18} />
          <span className="grow">
            <small className="eyebrow" style={{ margin: 0 }}>Biggest win today</small>
            <strong><UserLink to={todayBest.uid}>{todayBest.displayName || 'Someone'}</UserLink> won +{todayBest.amount.toLocaleString()}</strong>
            <small className="faint">{todayBest.note}</small>
          </span>
        </div>
      )}

      <div className="card session-bar">
        <div className="spread wrap">
          <span className="row" style={{ gap: 8 }}>
            <span className="label">This session</span>
            <strong className={session.net >= 0 ? 'pos' : 'neg'}>{session.net >= 0 ? '+' : ''}{session.net.toLocaleString()}</strong>
            <small className="faint">{session.rounds} rounds · best +{session.peak.toLocaleString()} · worst {session.low.toLocaleString()}</small>
          </span>
          <label className="row" style={{ gap: 6 }}>
            <ShieldAlert size={14} className="faint" />
            <span className="label">Loss limit</span>
            <input className="input bet-input" type="number" min={0} value={lossLimit || ''} placeholder="Off" onChange={(e) => setLossLimit(Math.max(0, Math.floor(Number(e.target.value)) || 0))} style={{ width: 100 }} aria-label="Session loss limit" />
          </label>
        </div>
        {lossLimit > 0 && (
          <div className="hub-bar" style={{ marginTop: 8 }} title="Losses this session against your limit">
            <i style={{ width: `${Math.min(1, Math.max(0, -session.net) / lossLimit) * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #ef4444)' }} />
          </div>
        )}
      </div>
      <LuckyWheel />

      <ErrorNote>{error}</ErrorNote>

      {stats.rounds > 0 && (
        <div className="casino-stats">
          <div className="stat"><small>Rounds</small><strong>{stats.rounds.toLocaleString()}</strong></div>
          <div className="stat"><small>Win rate</small><strong>{Math.round((stats.wins / stats.rounds) * 100)}%</strong></div>
          <div className="stat">
            <small>Net</small>
            <strong className={stats.net >= 0 ? 'pos' : 'neg'}>{stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}</strong>
          </div>
          <div className="stat"><small>Biggest win</small><strong className="pos">+{stats.biggest.toLocaleString()}</strong></div>
          <div className="stat"><small>Best streak</small><strong>{stats.bestStreak} wins</strong></div>
        </div>
      )}

      {balance < 1 && (
        <Empty
          icon={Coins}
          title="You're out of coins."
          body={`More arrive automatically in ${formatCountdown(wait)}.`}
        />
      )}
      {/* Stays mounted at zero: going all in empties the wallet mid-round. */}
      <Arcade points={balance} settle={settle} busy={busy} />

      {!!perGame.length && (
        <section className="card">
          <h2 className="rng-heading"><BarChart3 size={15} /> Your games</h2>
          <div className="per-game">
            <div className="per-game-row head"><span>Game</span><span>Rounds</span><span>Win rate</span><span>Net</span></div>
            {perGame.map((g) => (
              <div key={g.game} className="per-game-row">
                <span>{g.game}</span>
                <span>{g.rounds}</span>
                <span>{Math.round((g.wins / g.rounds) * 100)}%</span>
                <span className={g.net >= 0 ? 'pos' : 'neg'}>{g.net >= 0 ? '+' : ''}{g.net.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
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
