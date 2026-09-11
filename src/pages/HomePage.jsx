import { useEffect, useState } from 'react';
import {
  Rss, Vote, Gamepad2, Store, MessageCircle, Hash, Dices,
  Megaphone, Coins, Users, Heart, Gift, Clock
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { COL, DAILY_POINTS } from '../lib/schema';
import { useSession } from '../lib/session';
import { canClaim, msUntilNextClaim, formatCountdown, claimDaily } from '../lib/daily';
import { PageHead, SectionHead, UserLink, ErrorNote, Toast } from '../components/ui';
import Avatar from '../components/Avatar';

const TILES = [
  { to: '/games', label: 'Games', body: 'Jump into the library', icon: Gamepad2 },
  { to: '/chat', label: 'Global chat', body: 'Everyone, all at once', icon: Hash },
  { to: '/casino', label: 'Casino', body: 'Bet your coins', icon: Dices },
  { to: '/messages', label: 'Messages', body: 'Private conversations', icon: MessageCircle },
  { to: '/polls', label: 'Polls', body: 'One vote each', icon: Vote },
  { to: '/store', label: 'Store', body: 'Spend what you earn', icon: Store }
];

export default function HomePage({ router }) {
  const { accountId, profile, wallet, balance, isOwner } = useSession();
  const [announcements, setAnnouncements] = useState([]);
  const [posts, setPosts] = useState([]);
  const [memberCount, setMemberCount] = useState(0);
  const [gameCount, setGameCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => onSnapshot(
    query(collection(db, COL.announcements), orderBy('createdAt', 'desc'), limit(2)),
    (snap) => setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setAnnouncements([])
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, COL.posts), orderBy('createdAt', 'desc'), limit(3)),
    (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setPosts([])
  ), []);

  useEffect(() => onSnapshot(
    collection(db, COL.accounts),
    (snap) => setMemberCount(snap.size),
    () => setMemberCount(0)
  ), []);

  useEffect(() => {
    let alive = true;
    fetch('/games/manifest.json')
      .then((r) => r.json())
      .then((m) => { if (alive) setGameCount((m.games || []).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const ready = canClaim(wallet);
  const wait = msUntilNextClaim(wallet);

  const claim = async () => {
    if (!accountId) return;
    setBusy(true); setError('');
    try {
      await claimDaily(accountId);
      setToast(`+${DAILY_POINTS} coins`);
      setTimeout(() => setToast(''), 2200);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <PageHead
        eyebrow={greeting()}
        title={`Hey, ${profile?.displayName || 'there'}.`}
        actions={isOwner && <span className="chip chip-accent">Owner</span>}
      />

      <div className="stat-row">
        <Stat icon={Coins} value={balance.toLocaleString()} label="Astral Coins" />
        <Stat icon={Users} value={memberCount} label={memberCount === 1 ? 'member' : 'members'} />
        <Stat icon={Gamepad2} value={gameCount ? gameCount.toLocaleString() : '—'} label="games" />
      </div>

      <div className={ready ? 'card feature daily-ready' : 'card feature'}>
        <span className="tile-icon">{ready ? <Gift size={18} /> : <Clock size={18} />}</span>
        <span className="feature-text">
          <span className="eyebrow" style={{ margin: 0 }}>Daily coins</span>
          <strong>{ready ? `${DAILY_POINTS} coins are waiting` : 'Claimed for today'}</strong>
          <span className="muted">
            {ready ? 'Free every day — spend them in the casino or the store.' : `Back in ${formatCountdown(wait)}.`}
          </span>
        </span>
        <button className="btn btn-primary" onClick={claim} disabled={!ready || busy || !accountId}>
          {busy ? 'Claiming…' : ready ? 'Claim' : 'Claimed'}
        </button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {!!announcements.length && (
        <section>
          <SectionHead title="Announcements" />
          <div className="list">
            {announcements.map((a) => (
              <article key={a.id} className="card">
                <div className="row" style={{ marginBottom: 6 }}>
                  <Megaphone size={15} className="muted" />
                  <strong>{a.title}</strong>
                </div>
                <p className="muted">{a.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {!!posts.length && (
        <section>
          <SectionHead
            title="Latest from the feed"
            actions={<button className="btn btn-sm" onClick={() => router.navigate('/feed')}>See all</button>}
          />
          <div className="list">
            {posts.map((p) => (
              <article key={p.id} className="card">
                <div className="row" style={{ marginBottom: 6 }}>
                  <Avatar profile={{ id: p.uid, displayName: p.displayName }} size={26} />
                  <UserLink to={p.uid}>{p.displayName || 'Astral member'}</UserLink>
                </div>
                {p.text && <p className="post-body" style={{ margin: '0 0 8px' }}>{p.text}</p>}
                {p.imageUrl && <img className="post-image" src={p.imageUrl} alt="" loading="lazy" />}
                <div className="row faint"><Heart size={12} /> {(p.likes || []).length}</div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Jump in" />
        <div className="grid">
          {TILES.map(({ to, label, body, icon: Icon }) => (
            <button key={to} className="tile" onClick={() => router.navigate(to)}>
              <span className="tile-icon"><Icon size={18} /></span>
              <strong>{label}</strong>
              <span>{body}</span>
            </button>
          ))}
        </div>
      </section>

      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="stat">
      <span className="stat-icon"><Icon size={15} /></span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
