import { useEffect, useState } from 'react';
import {
  Rss, Vote, Gamepad2, Store, MessageCircle, Hash, Dices,
  Megaphone, Coins, Users, Heart, Gift, Clock, Sparkles, Trophy, Award, Flame, Wifi, Clapperboard
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { COL, DAILY_POINTS } from '../lib/schema';
import { useSession } from '../lib/session';
import { msUntilNextClaim, formatCountdown } from '../lib/daily';
import { PageHead, SectionHead, UserLink } from '../components/ui';
import Avatar from '../components/Avatar';
import { isOnline, currentStreak, useAccounts } from '../lib/social';
import { KEYS, useLocal } from '../lib/local';
import { hasUnseenRelease } from './WhatsNewPage';
import { DailyQuests, SuggestedPeople } from '../components/HomeWidgets';
import {
  ActivityCard, BirthdaysCard, ClockCard, FriendsOnlineCard, GoalCard, QuickPostCard, QuoteCard, RewardsCard,
  SpotlightCard, TopPostCard, WidgetPicker
} from '../components/HomeExtras';

const TILES = [
  { to: '/studio', label: 'Studio · 50 tools', body: 'Create, plan and play together', icon: Sparkles },
  { to: '/assistant', label: 'Astral Guide', body: 'Private AI-style help for your workspace', icon: Sparkles },
  { to: '/shorts', label: 'Shorts', body: 'Swipe through quick videos', icon: Clapperboard },
  { to: '/rng', label: 'RNG Roll', body: 'Roll for rare auras', icon: Sparkles },
  { to: '/members', label: 'Members', body: 'Find and follow people', icon: Users },
  { to: '/leaderboard', label: 'Leaderboards', body: "See who's on top", icon: Trophy },
  { to: '/achievements', label: 'Achievements', body: 'Unlock badges', icon: Award },
  { to: '/games', label: 'Games', body: 'Jump into the library', icon: Gamepad2 },
  { to: '/chat', label: 'Global chat', body: 'Everyone, all at once', icon: Hash },
  { to: '/casino', label: 'Casino', body: 'Bet your coins', icon: Dices },
  { to: '/messages', label: 'Messages', body: 'Private conversations', icon: MessageCircle },
  { to: '/polls', label: 'Polls', body: 'One vote each', icon: Vote },
  { to: '/store', label: 'Store', body: 'Spend what you earn', icon: Store }
];

export default function HomePage({ router }) {
  const { profile, wallet, balance, isOwner, justClaimed } = useSession();
  const accounts = useAccounts();
  const [announcements, setAnnouncements] = useState([]);
  const [posts, setPosts] = useState([]);
  const [shorts, setShorts] = useState([]);
  const [comments, setComments] = useState([]);
  const [gameCount, setGameCount] = useState(0);
  const [hidden, setHidden] = useLocal(KEYS.homeWidgets, {});
  const [, tick] = useState(0);
  const show = (id) => !hidden?.[id];

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
    query(collection(db, COL.posts), orderBy('createdAt', 'desc'), limit(150)),
    (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setPosts([])
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, COL.shorts), orderBy('createdAt', 'desc'), limit(100)),
    (snap) => setShorts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setShorts([])
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, COL.comments), orderBy('createdAt', 'desc'), limit(400)),
    (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setComments([])
  ), []);

  useEffect(() => {
    let alive = true;
    fetch('/games/manifest.json')
      .then((r) => r.json())
      .then((m) => { if (alive) setGameCount((m.games || []).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const wait = msUntilNextClaim(wallet);
  const streak = currentStreak(profile);
  const memberCount = (accounts || []).length;
  const onlineCount = (accounts || []).filter(isOnline).length;
  const muted = profile?.muted || [];
  const latest = posts.filter((p) => !muted.includes(p.uid)).slice(0, 3);

  return (
    <div className="stack">
      <PageHead
        eyebrow={greeting()}
        title={`Hey, ${profile?.displayName || 'there'}.`}
        actions={(
          <>
            {isOwner && <span className="chip chip-accent">Owner</span>}
            <WidgetPicker hidden={hidden} setHidden={setHidden} />
          </>
        )}
      />

      <div className="stat-row">
        <Stat icon={Coins} value={balance.toLocaleString()} label="Astral Coins" />
        <Stat icon={Users} value={memberCount} label={memberCount === 1 ? 'member' : 'members'} />
        <Stat icon={Wifi} value={onlineCount} label="online now" live />
        <Stat icon={Flame} value={streak} label="day streak" />
        <Stat icon={Gamepad2} value={gameCount ? gameCount.toLocaleString() : '—'} label="games" />
      </div>

      {(show('clock') || show('quote')) && (
        <div className="home-columns">
          {show('clock') && <ClockCard />}
          {show('quote') && <QuoteCard />}
        </div>
      )}

      {show('quickpost') && <QuickPostCard />}

      <div className={justClaimed ? 'card feature daily-ready' : 'card feature'}>
        <span className="tile-icon">{justClaimed ? <Gift size={18} /> : <Clock size={18} />}</span>
        <span className="feature-text">
          <span className="eyebrow" style={{ margin: 0 }}>Daily coins</span>
          <strong>
            {justClaimed ? `+${justClaimed} coins added` : `${DAILY_POINTS} coins, every day`}
          </strong>
          <span className="muted">
            {justClaimed
              ? 'Added to your balance automatically.'
              : `They land on their own when you open the site. Next lot in ${formatCountdown(wait)}.`}
          </span>
        </span>
      </div>

      {hasUnseenRelease() && (
        <button className="card feature whats-new-banner" onClick={() => router.navigate('/whats-new')}>
          <span className="tile-icon"><Megaphone size={18} /></span>
          <span className="feature-text">
            <span className="eyebrow" style={{ margin: 0 }}>Just landed</span>
            <strong>120 new features</strong>
            <span className="muted">20 for RNG Roll and 100 across the site: quote posts, guestbooks, chat commands, Limbo, scratch cards, themes and more.</span>
          </span>
        </button>
      )}

      {show('birthdays') && <BirthdaysCard />}

      <div className="home-columns">
        {show('rewards') && <RewardsCard />}
        {show('spotlight') && <SpotlightCard />}
      </div>

      {(show('quests') || show('people')) && (
        <div className="home-columns">
          {show('quests') && <DailyQuests />}
          {show('people') && <SuggestedPeople />}
        </div>
      )}

      <div className="home-columns">
        {show('friends') && <FriendsOnlineCard />}
        {show('activity') && <ActivityCard posts={posts} shorts={shorts} comments={comments} />}
      </div>

      {(show('goal') || show('toppost')) && (
        <div className="home-columns">
          {show('goal') && <GoalCard posts={posts} />}
          {show('toppost') && <TopPostCard posts={posts} comments={comments} />}
        </div>
      )}

      {show('announcements') && !!announcements.length && (
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

      {show('latest') && !!latest.length && (
        <section>
          <SectionHead
            title="Latest from the feed"
            actions={<button className="btn btn-sm" onClick={() => router.navigate('/feed')}><Rss size={13} /> See all</button>}
          />
          <div className="list">
            {latest.map((p) => (
              <article key={p.id} className="card clickable" onClick={() => router.navigate(`/post/${p.id}`)}>
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
    </div>
  );
}

function Stat({ icon: Icon, value, label, live }) {
  return (
    <div className={live ? 'stat stat-live' : 'stat'}>
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
