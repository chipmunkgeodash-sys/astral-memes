import { useEffect, useMemo, useState } from 'react';
import { Trophy, Coins, Heart, Rss, Users, Sparkles, Flame } from 'lucide-react';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Loader, Tabs, Empty, UserLink } from '../components/ui';
import { useAccounts, followersOf, isOnline, currentStreak } from '../lib/social';
import { auraById } from '../lib/rng';
import Avatar from '../components/Avatar';

const BOARDS = [
  { value: 'coins', label: 'Coins', icon: Coins, unit: 'coins' },
  { value: 'likes', label: 'Likes', icon: Heart, unit: 'likes' },
  { value: 'posts', label: 'Posts', icon: Rss, unit: 'posts' },
  { value: 'followers', label: 'Followers', icon: Users, unit: 'followers' },
  { value: 'rng', label: 'RNG', icon: Sparkles, unit: '' },
  { value: 'streak', label: 'Streak', icon: Flame, unit: 'days' }
];

export default function LeaderboardPage() {
  const { accountId } = useSession();
  const accounts = useAccounts();
  const [wallets, setWallets] = useState({});
  const [posts, setPosts] = useState([]);
  const [board, setBoard] = useState('coins');

  useEffect(() => onSnapshot(
    collection(db, COL.wallets),
    (snap) => setWallets(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().balance || 0]))),
    () => setWallets({})
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, COL.posts), limit(1000)),
    (snap) => setPosts(snap.docs.map((d) => d.data())),
    () => setPosts([])
  ), []);

  const rows = useMemo(() => {
    if (!accounts) return [];
    const postCount = new Map();
    const likeCount = new Map();
    for (const p of posts) {
      postCount.set(p.uid, (postCount.get(p.uid) || 0) + 1);
      likeCount.set(p.uid, (likeCount.get(p.uid) || 0) + (p.likes || []).length);
    }
    const valueOf = (a) => {
      switch (board) {
        case 'coins': return wallets[a.id] || 0;
        case 'likes': return likeCount.get(a.id) || 0;
        case 'posts': return postCount.get(a.id) || 0;
        case 'followers': return followersOf(accounts, a.id).length;
        case 'rng': return a.rng?.bestRoll || a.rng?.bestChance || 0;
        case 'streak': return currentStreak(a);
        default: return 0;
      }
    };
    return accounts
      .map((a) => ({ account: a, value: valueOf(a) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 100)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [accounts, wallets, posts, board]);

  if (accounts === null) return <Loader label="Loading rankings…" />;

  const def = BOARDS.find((b) => b.value === board);
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const label = (r) => (board === 'rng'
    ? `1 in ${r.value.toLocaleString()}`
    : `${r.value.toLocaleString()} ${def.unit}`);

  return (
    <div className="stack">
      <PageHead eyebrow="Who's on top" title="Leaderboards" actions={<span className="chip chip-accent"><Trophy size={13} /> Top 100</span>} />

      <div className="tabs-scroll">
        <Tabs value={board} onChange={setBoard} options={BOARDS.map((b) => ({ value: b.value, label: b.label }))} />
      </div>

      {!rows.length ? (
        <Empty icon={def.icon} title="No rankings yet." body="Nobody has a score on this board so far." />
      ) : (
        <>
          <div className="podium">
            {[podium[1], podium[0], podium[2]].map((r, i) => r && (
              <div key={r.account.id} className={`podium-spot podium-${r.rank}`} style={{ order: i }}>
                <span className="podium-medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
                <Avatar profile={r.account} size={r.rank === 1 ? 68 : 54} online={isOnline(r.account)} />
                <UserLink to={r.account.id}>{r.account.displayName || 'Astral member'}</UserLink>
                <strong className="podium-value">{label(r)}</strong>
                {board === 'rng' && r.account.rng?.best && <small className="faint">{auraById(r.account.rng.best).name}</small>}
                <span className="podium-block">#{r.rank}</span>
              </div>
            ))}
          </div>

          {!!rest.length && (
            <ol className="board">
              {rest.map((r) => (
                <li key={r.account.id} className={r.account.id === accountId ? 'board-row me' : 'board-row'}>
                  <span className="board-rank">#{r.rank}</span>
                  <Avatar profile={r.account} size={30} online={isOnline(r.account)} />
                  <UserLink to={r.account.id}>{r.account.displayName || 'Astral member'}</UserLink>
                  <span className="grow" />
                  {board === 'rng' && r.account.rng?.best && <small className="faint">{auraById(r.account.rng.best).name}</small>}
                  <strong className="board-value">{label(r)}</strong>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
