import { useEffect, useMemo, useState } from 'react';
import {
  Clock, Quote, Cake, Activity, Users, Star, Gift, Target, Flame, Send, Crown, Heart, Settings2, Check
} from 'lucide-react';
import {
  addDoc, collection, doc, increment, serverTimestamp, updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { currentStreak, followersOf, isOnline, isToday, millis, todayKey, useAccounts } from '../lib/social';
import { levelFor, levelTitle, xpFor, LEVEL_REWARDS, weekKey, WEEKLY_STREAK_DAYS, WEEKLY_STREAK_COINS, bumpActivity } from '../lib/levels';
import { isBirthdayToday } from '../pages/UserPage';
import { engagement } from './PostCard';
import { confettiFrom } from '../lib/confetti';
import { play } from '../lib/sound';
import { UserLink, navigateTo } from './ui';
import Avatar from './Avatar';
import RichText, { myHandles } from './RichText';

const QUOTES = [
  ['The best way to predict the future is to create it.', 'Peter Drucker'],
  ['Stay hungry, stay foolish.', 'Anonymous'],
  ['Luck is what happens when preparation meets opportunity.', 'Seneca'],
  ['Do or do not. There is no try.', 'Yoda'],
  ['It always seems impossible until it is done.', 'Nelson Mandela'],
  ['Be yourself; everyone else is already taken.', 'Oscar Wilde'],
  ['Every expert was once a beginner.', 'Helen Hayes'],
  ['Dream big. Start small. Act now.', 'Robin Sharma'],
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['Fortune favours the bold.', 'Virgil'],
  ['Small steps every day.', 'Anonymous'],
  ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
  ['Keep your face always toward the sunshine.', 'Walt Whitman'],
  ['What we think, we become.', 'Buddha']
];

const hashString = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const HOME_WIDGETS = [
  { id: 'clock', label: 'Clock' },
  { id: 'quote', label: 'Quote of the day' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'quests', label: 'Daily quests' },
  { id: 'people', label: 'People to follow' },
  { id: 'spotlight', label: 'Member of the day' },
  { id: 'friends', label: 'Friends online' },
  { id: 'birthdays', label: 'Birthdays' },
  { id: 'activity', label: 'Site activity' },
  { id: 'goal', label: 'Community goal' },
  { id: 'toppost', label: 'Top post today' },
  { id: 'quickpost', label: 'Quick post' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'latest', label: 'Latest from the feed' }
];

export function WidgetPicker({ hidden, setHidden }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-wrap">
      <button className="btn btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}><Settings2 size={14} /> Customize</button>
      {open && (
        <div className="menu widget-menu" onMouseLeave={() => setOpen(false)}>
          {HOME_WIDGETS.map((w) => (
            <button key={w.id} type="button" onClick={() => setHidden((h) => ({ ...h, [w.id]: !h?.[w.id] }))}>
              <span className={hidden?.[w.id] ? 'widget-check' : 'widget-check on'}>{!hidden?.[w.id] && <Check size={11} />}</span>
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClockCard() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="card home-clock">
      <Clock size={16} className="faint" />
      <strong>{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</strong>
      <span className="muted">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
    </div>
  );
}

export function QuoteCard() {
  const [text, who] = QUOTES[hashString(todayKey()) % QUOTES.length];
  return (
    <div className="card home-quote">
      <Quote size={18} className="faint" />
      <blockquote>{text}</blockquote>
      <small className="faint">— {who}</small>
    </div>
  );
}

// Level milestone coins and the weekly streak bonus.
export function RewardsCard() {
  const { accountId, profile } = useSession();
  const accounts = useAccounts();
  const [error, setError] = useState('');
  const followers = followersOf(accounts, accountId).length;
  const lvl = levelFor(xpFor(profile, followers));
  const claimed = profile?.levelRewards || [];
  const ready = LEVEL_REWARDS.filter(([level]) => lvl.level >= level && !claimed.includes(level));
  const nextReward = LEVEL_REWARDS.find(([level]) => lvl.level < level);
  const streak = currentStreak(profile);
  const week = weekKey();
  const weeklyReady = streak >= WEEKLY_STREAK_DAYS && profile?.weeklyBonusWeek !== week;

  const payCoins = async (amount, note, accountPatch, target) => {
    setError('');
    try {
      await updateDoc(doc(db, COL.accounts, accountId), accountPatch);
      await updateDoc(doc(db, COL.wallets, accountId), { balance: increment(amount), updatedAt: serverTimestamp() });
      await addDoc(collection(db, COL.redemptions), { type: 'reward', uid: accountId, displayName: profile?.displayName || null, amount, note, createdAt: serverTimestamp() });
      confettiFrom(target, 70);
      play('rare');
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card rewards-card">
      <h2 className="rng-heading"><Gift size={15} /> Rewards</h2>
      <div className="xp-card">
        <span className="level-badge">Lv {lvl.level}<em>{levelTitle(lvl.level)}</em></span>
        <div className="xp-bar" style={{ maxWidth: 'none', flex: 1 }}><i style={{ width: `${lvl.progress * 100}%` }} /></div>
        <small className="faint">{(lvl.to - lvl.xp).toLocaleString()} XP to level {lvl.level + 1}</small>
      </div>
      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        {ready.map(([level, coins]) => (
          <div key={level} className="reward-row ready">
            <Star size={15} />
            <span className="grow">Reached level {level}</span>
            <button className="btn btn-sm btn-primary" onClick={(e) => payCoins(coins, `Level ${level} reward`, { levelRewards: [...claimed, level] }, e.currentTarget)}>
              Claim {coins.toLocaleString()} coins
            </button>
          </div>
        ))}
        {!ready.length && nextReward && (
          <div className="reward-row"><Star size={15} /><span className="grow">Next: level {nextReward[0]} pays {nextReward[1].toLocaleString()} coins</span></div>
        )}
        <div className={weeklyReady ? 'reward-row ready' : 'reward-row'}>
          <Flame size={15} />
          <span className="grow">
            Weekly streak bonus · {Math.min(streak, WEEKLY_STREAK_DAYS)}/{WEEKLY_STREAK_DAYS} days
            {profile?.weeklyBonusWeek === week && ' · claimed this week'}
          </span>
          <button
            className="btn btn-sm btn-primary"
            disabled={!weeklyReady}
            onClick={(e) => payCoins(WEEKLY_STREAK_COINS, 'Weekly streak bonus', { weeklyBonusWeek: week }, e.currentTarget)}
          >
            {WEEKLY_STREAK_COINS.toLocaleString()} coins
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// One member featured each day, the same for everyone.
export function useMemberOfTheDay() {
  const accounts = useAccounts();
  return useMemo(() => {
    const pool = (accounts || []).filter((a) => a.displayName).sort((a, b) => a.id.localeCompare(b.id));
    return pool.length ? pool[hashString(`motd:${todayKey()}`) % pool.length] : null;
  }, [accounts]);
}

export function SpotlightCard() {
  const member = useMemberOfTheDay();
  const accounts = useAccounts();
  if (!member) return null;
  const lvl = levelFor(xpFor(member, followersOf(accounts, member.id).length));
  return (
    <div className="card spotlight" style={member.banner ? { '--banner': member.banner } : undefined}>
      <span className="spotlight-label"><Crown size={13} /> Member of the day</span>
      <div className="row" style={{ gap: 12 }}>
        <Avatar profile={member} size={52} online={isOnline(member)} />
        <div className="me-text grow">
          <UserLink to={member.username || member.id}>{member.displayName}</UserLink>
          <small>Lv {lvl.level} · {followersOf(accounts, member.id).length} followers</small>
          {member.status && <small>{member.status}</small>}
        </div>
      </div>
      {member.bio && <p className="muted spotlight-bio">{member.bio}</p>}
    </div>
  );
}

export function FriendsOnlineCard() {
  const { profile } = useSession();
  const accounts = useAccounts();
  const friends = (accounts || []).filter((a) => (profile?.following || []).includes(a.id) && isOnline(a));
  return (
    <div className="card">
      <h2 className="rng-heading"><Users size={15} /> Friends online <small className="faint">{friends.length}</small></h2>
      {friends.length ? (
        <div className="friends-online">
          {friends.slice(0, 12).map((a) => (
            <button key={a.id} type="button" className="friend-online" onClick={() => navigateTo(`/u/${encodeURIComponent(a.username || a.id)}`)}>
              <Avatar profile={a} size={36} online />
              <small className="truncate">{a.displayName}</small>
            </button>
          ))}
        </div>
      ) : <p className="faint">Nobody you follow is online right now.</p>}
    </div>
  );
}

export function BirthdaysCard() {
  const accounts = useAccounts();
  const today = (accounts || []).filter(isBirthdayToday);
  if (!today.length) return null;
  return (
    <div className="card birthdays">
      <h2 className="rng-heading"><Cake size={15} /> Birthdays today 🎉</h2>
      <div className="wrap">
        {today.map((a) => (
          <span key={a.id} className="chip"><Avatar profile={a} size={20} /> <UserLink to={a.username || a.id}>{a.displayName}</UserLink></span>
        ))}
      </div>
    </div>
  );
}

export function ActivityCard({ posts, shorts, comments }) {
  const counts = [
    ['Posts', posts.filter((p) => isToday(p.createdAt)).length],
    ['Shorts', shorts.filter((s) => isToday(s.createdAt)).length],
    ['Comments', comments.filter((c) => isToday(c.createdAt)).length]
  ];
  return (
    <div className="card">
      <h2 className="rng-heading"><Activity size={15} /> Today on Astral</h2>
      <div className="hub-stats">
        {counts.map(([label, n]) => <span key={label}><small>{label}</small>{n.toLocaleString()}</span>)}
      </div>
    </div>
  );
}

export const COMMUNITY_GOAL = 50;

export function GoalCard({ posts }) {
  const weekStart = (() => {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d.getTime();
  })();
  const count = posts.filter((p) => millis(p.createdAt) >= weekStart).length;
  const done = count >= COMMUNITY_GOAL;
  return (
    <div className={done ? 'card goal-card done' : 'card goal-card'}>
      <h2 className="rng-heading"><Target size={15} /> Community goal</h2>
      <p className="muted">{done ? 'Goal smashed this week! 🎉' : `Together, share ${COMMUNITY_GOAL} posts this week.`}</p>
      <div className="hub-bar" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(1, count / COMMUNITY_GOAL) * 100}%` }} /></div>
      <small className="faint">{count} / {COMMUNITY_GOAL} posts · resets Monday</small>
    </div>
  );
}

export function TopPostCard({ posts, comments }) {
  const { profile } = useSession();
  const top = useMemo(() => {
    const dayAgo = Date.now() - 86400000;
    const byPost = new Map();
    comments.forEach((c) => byPost.set(c.postId, (byPost.get(c.postId) || 0) + 1));
    return posts
      .filter((p) => millis(p.createdAt) >= dayAgo)
      .map((p) => ({ p, score: engagement(p, byPost.get(p.id) || 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.p;
  }, [posts, comments]);
  if (!top) return null;
  return (
    <div className="card top-post" role="link" tabIndex={0} onClick={() => navigateTo(`/post/${top.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigateTo(`/post/${top.id}`); }}>
      <span className="spotlight-label"><Heart size={13} /> Top post today</span>
      <span className="row" style={{ gap: 8 }}>
        <Avatar profile={{ id: top.uid, displayName: top.displayName }} size={26} />
        <strong>{top.displayName || 'Astral member'}</strong>
      </span>
      {top.text && <p className="post-body"><RichText text={top.text.slice(0, 280)} me={myHandles(profile)} /></p>}
      {top.imageUrl && <img className="post-image" src={top.imageUrl} alt="" loading="lazy" />}
      <small className="faint"><Heart size={11} /> {(top.likes || []).length}</small>
    </div>
  );
}

export function QuickPostCard() {
  const { accountId, profile } = useSession();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const post = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, COL.posts), {
        uid: accountId, displayName: profile?.displayName || 'Astral member', text: body.slice(0, 1000),
        imageUrl: null, likes: [], createdAt: serverTimestamp()
      });
      bumpActivity(accountId, 'posts');
      setText(''); setDone(true); setTimeout(() => setDone(false), 2000);
      play('good');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="card quick-post">
      <Avatar profile={profile} size={34} />
      <input
        className="input grow"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') post(); }}
        placeholder={done ? 'Posted! ✨' : `What's on your mind, ${profile?.displayName?.split(' ')[0] || 'friend'}?`}
        maxLength={1000}
      />
      <button className="btn btn-primary" onClick={post} disabled={busy || !text.trim()}><Send size={15} /> Post</button>
      {error && <p className="error" style={{ width: '100%' }}>{error}</p>}
    </div>
  );
}
