import { useEffect, useMemo, useState } from 'react';
import { Award } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Tabs } from '../components/ui';
import { useAccounts, followersOf } from '../lib/social';
import { ACHIEVEMENTS, evaluate, statsFor } from '../lib/achievements';

export default function AchievementsPage() {
  const { accountId, profile, balance } = useSession();
  const accounts = useAccounts();
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!accountId) return undefined;
    return onSnapshot(
      query(collection(db, COL.posts), where('uid', '==', accountId)),
      (snap) => setPosts(snap.docs.map((d) => d.data())),
      () => setPosts([])
    );
  }, [accountId]);

  const results = useMemo(() => evaluate(statsFor({
    account: profile,
    posts,
    coins: balance,
    followers: followersOf(accounts, accountId).length
  })), [profile, posts, balance, accounts, accountId]);

  // How many members have each one, for a rarity hint.
  const holders = useMemo(() => {
    const counts = {};
    for (const a of accounts || []) {
      // Only what can be judged from the account alone — posts and coins
      // aren't loaded for everyone, so those badges skip the hint.
      const r = evaluate(statsFor({ account: a, followers: followersOf(accounts, a.id).length }));
      for (const x of r) if (x.unlocked) counts[x.id] = (counts[x.id] || 0) + 1;
    }
    return counts;
  }, [accounts]);

  const unlocked = results.filter((r) => r.unlocked).length;
  const shown = results.filter((r) => (filter === 'all' ? true : filter === 'unlocked' ? r.unlocked : !r.unlocked));
  const partial = new Set(['post-1', 'post-10', 'post-50', 'likes-10', 'likes-100', 'coins-1k', 'coins-10k', 'coins-1m']);

  return (
    <div className="stack">
      <PageHead
        eyebrow="Show off"
        title="Achievements"
        actions={<span className="chip chip-accent"><Award size={13} /> {unlocked} / {ACHIEVEMENTS.length}</span>}
      />

      <div className="card achieve-summary">
        <div className="spread">
          <strong>{Math.round((unlocked / ACHIEVEMENTS.length) * 100)}% complete</strong>
          <Tabs
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all', label: 'All' }, { value: 'unlocked', label: 'Unlocked' }, { value: 'locked', label: 'Locked' }]}
          />
        </div>
        <div className="rng-progress" style={{ marginTop: 12, marginBottom: 0 }}>
          <i style={{ width: `${(unlocked / ACHIEVEMENTS.length) * 100}%` }} />
        </div>
      </div>

      <div className="achieve-grid">
        {shown.map((a) => (
          <div key={a.id} className={`achieve achieve-${a.tier}${a.unlocked ? ' unlocked' : ''}`}>
            <span className="achieve-icon" aria-hidden="true">{a.icon}</span>
            <div className="grow">
              <strong>{a.name}</strong>
              <p>{a.desc}</p>
              {!a.unlocked && a.goal > 1 && (
                <>
                  <div className="achieve-bar"><i style={{ width: `${(a.have / a.goal) * 100}%` }} /></div>
                  <small className="faint">{a.have.toLocaleString()} / {a.goal.toLocaleString()}</small>
                </>
              )}
              {!partial.has(a.id) && accounts && (
                <small className="faint achieve-holders">
                  {holders[a.id] || 0} {holders[a.id] === 1 ? 'member has' : 'members have'} this
                </small>
              )}
            </div>
            <span className="achieve-tier">{a.tier}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
