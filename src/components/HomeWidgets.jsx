import { useEffect, useMemo, useState } from 'react';
import { Target, Check, Gem, UserPlus, Sparkles } from 'lucide-react';
import { collection, doc, increment, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LOUNGE_THREAD } from '../lib/schema';
import { useSession } from '../lib/session';
import { followersOf, isOnline, isToday, setFollowing, todayKey, useAccounts } from '../lib/social';
import { questsForDay } from '../lib/quests';
import { confettiFrom } from '../lib/confetti';
import { play } from '../lib/sound';
import { navigateTo, UserLink } from './ui';
import Avatar from './Avatar';
import LevelBadge from './LevelBadge';

const useMine = (col, accountId, extra = []) => {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!accountId) return undefined;
    return onSnapshot(query(collection(db, col), where('uid', '==', accountId), ...extra),
      (s) => setRows(s.docs.map((d) => d.data())), () => setRows([]));
  }, [accountId]);
  return rows;
};

export function DailyQuests() {
  const { accountId, profile } = useSession();
  const posts = useMine(COL.posts, accountId);
  const comments = useMine(COL.comments, accountId);
  const shorts = useMine(COL.shorts, accountId);
  const bets = useMine(COL.redemptions, accountId);
  const [chat, setChat] = useState([]);
  const [error, setError] = useState('');

  // Chat rules only allow reading a thread at a time, so count the lounge.
  useEffect(() => onSnapshot(
    query(collection(db, COL.messages), where('thread', '==', LOUNGE_THREAD), limit(300)),
    (s) => setChat(s.docs.map((d) => d.data())), () => setChat([])
  ), []);

  const today = todayKey();
  const progress = useMemo(() => {
    const todayBets = bets.filter((b) => b.type === 'bet' && isToday(b.createdAt));
    return {
      postsToday: posts.filter((p) => isToday(p.createdAt)).length,
      commentsToday: comments.filter((c) => isToday(c.createdAt)).length,
      shortsToday: shorts.filter((s) => isToday(s.createdAt)).length,
      rollsToday: profile?.rng?.day === today ? profile.rng.dayRolls || 0 : 0,
      roundsToday: todayBets.length,
      winsToday: todayBets.filter((b) => b.amount > 0).length,
      wheelToday: profile?.wheelDay === today ? 1 : 0,
      chatToday: chat.filter((m) => m.uid === accountId && isToday(m.createdAt)).length
    };
  }, [posts, comments, shorts, bets, chat, profile, today, accountId]);

  const quests = questsForDay(today);
  const claimed = profile?.quests?.day === today ? profile.quests.claimed || [] : [];

  const claim = async (q, e) => {
    const target = e.currentTarget;
    setError('');
    try {
      await updateDoc(doc(db, COL.accounts, accountId), {
        'rng.points': increment(q.reward),
        'rng.pointsEarned': increment(q.reward),
        quests: { day: today, claimed: [...claimed, q.id] },
        questsDone: increment(1)
      });
      confettiFrom(target, 50);
      play('rare');
    } catch (err) { setError(err.message); }
  };

  const done = quests.filter((q) => claimed.includes(q.id)).length;

  return (
    <div className="card quests">
      <div className="spread">
        <h2 className="rng-heading" style={{ margin: 0 }}><Target size={16} /> Daily quests</h2>
        <span className="chip">{done} / 3 done · resets at midnight</span>
      </div>
      <div className="quest-list">
        {quests.map((q) => {
          const have = Math.min(progress[q.key] || 0, q.goal);
          const complete = have >= q.goal;
          const isClaimed = claimed.includes(q.id);
          return (
            <div key={q.id} className={isClaimed ? 'quest claimed' : complete ? 'quest complete' : 'quest'}>
              <span className="quest-icon" aria-hidden="true">{q.icon}</span>
              <div className="grow">
                <button type="button" className="link-quiet quest-name" onClick={() => navigateTo(q.to)}>{q.name}</button>
                <small className="faint">{q.desc}</small>
                <div className="achieve-bar"><i style={{ width: `${(have / q.goal) * 100}%` }} /></div>
              </div>
              {isClaimed ? (
                <span className="chip chip-live"><Check size={12} /> Claimed</span>
              ) : (
                <button className="btn btn-sm btn-primary" disabled={!complete} onClick={(e) => claim(q, e)}>
                  <Gem size={12} /> {complete ? `Claim ${q.reward}` : `${have}/${q.goal}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="error">{error}</p>}
      <p className="faint" style={{ marginTop: 8 }}>Rewards are RNG Roll points.</p>
    </div>
  );
}

// People you might want to follow: followed by people you follow first, then
// the most followed and most recently active.
export function SuggestedPeople() {
  const { accountId, profile } = useSession();
  const accounts = useAccounts();
  const [error, setError] = useState('');

  const picks = useMemo(() => {
    if (!accounts) return [];
    const mine = new Set(profile?.following || []);
    const muted = new Set(profile?.muted || []);
    const friendsOfFriends = new Map();
    for (const a of accounts) {
      if (!mine.has(a.id)) continue;
      for (const f of a.following || []) friendsOfFriends.set(f, (friendsOfFriends.get(f) || 0) + 1);
    }
    return accounts
      .filter((a) => a.id !== accountId && !mine.has(a.id) && !muted.has(a.id))
      .map((a) => ({
        account: a,
        mutual: friendsOfFriends.get(a.id) || 0,
        score: (friendsOfFriends.get(a.id) || 0) * 10 + followersOf(accounts, a.id).length * 2 + (isOnline(a) ? 3 : 0) + ((a.following || []).includes(accountId) ? 8 : 0)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [accounts, profile, accountId]);

  if (!picks.length) return null;

  return (
    <div className="card">
      <h2 className="rng-heading"><Sparkles size={15} /> People to follow</h2>
      <div className="suggest-list">
        {picks.map(({ account: a, mutual }) => (
          <div key={a.id} className="suggest">
            <Avatar profile={a} size={36} online={isOnline(a)} />
            <div className="grow me-text">
              <span className="row" style={{ gap: 6 }}>
                <UserLink to={a.username || a.id}>{a.displayName || 'Astral member'}</UserLink>
                <LevelBadge account={a} followers={followersOf(accounts, a.id).length} compact />
              </span>
              <small>
                {(a.following || []).includes(accountId) ? 'Follows you' : mutual ? `${mutual} ${mutual === 1 ? 'friend follows' : 'friends follow'}` : a.status || `@${a.username || 'member'}`}
              </small>
            </div>
            <button className="btn btn-sm" onClick={() => setFollowing(accountId, a.id, true).catch((err) => setError(err.message))}>
              <UserPlus size={13} /> Follow
            </button>
          </div>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
