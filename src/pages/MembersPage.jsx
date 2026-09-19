import { useMemo, useState } from 'react';
import { Users, UserPlus, UserCheck, Search, Flame } from 'lucide-react';
import { useSession } from '../lib/session';
import { PageHead, Empty, Tabs, ErrorNote, navigateTo } from '../components/ui';
import { useAccounts, isOnline, followersOf, setFollowing, currentStreak, millis } from '../lib/social';
import { auraById } from '../lib/rng';
import Avatar from '../components/Avatar';
import LevelBadge from '../components/LevelBadge';
import { AuraTitle } from '../components/AuraName';
import { SkeletonGrid } from '../components/Skeleton';
import { SpotlightCard } from '../components/HomeExtras';

export default function MembersPage() {
  const { accountId, profile } = useSession();
  const accounts = useAccounts();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  const following = profile?.following || [];

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (accounts || [])
      .filter((a) => !needle
        || (a.displayName || '').toLowerCase().includes(needle)
        || (a.username || '').toLowerCase().includes(needle))
      .filter((a) => (filter === 'online' ? isOnline(a)
        : filter === 'following' ? following.includes(a.id)
          : filter === 'followers' ? (a.following || []).includes(accountId)
            : true))
      .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a))
        || millis(b.lastSeen) - millis(a.lastSeen)
        || (a.displayName || '').localeCompare(b.displayName || ''));
  }, [accounts, q, filter, following, accountId]);

  if (accounts === null) return <div className="stack"><PageHead eyebrow="The community" title="Members" /><SkeletonGrid /></div>;

  const online = accounts.filter(isOnline).length;

  return (
    <div className="stack">
      <PageHead
        eyebrow="The community"
        title="Members"
        actions={(
          <>
            <span className="chip"><Users size={13} /> {accounts.length}</span>
            <span className="chip chip-live"><span className="dot" /> {online} online</span>
          </>
        )}
      />

      <div className="spread wrap">
        <span className="search" style={{ flex: 1, minWidth: 220, maxWidth: 420 }}>
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone…" aria-label="Search members" />
        </span>
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'online', label: 'Online' },
            { value: 'following', label: 'Following' },
            { value: 'followers', label: 'Followers' }
          ]}
        />
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!q && filter === 'all' && <SpotlightCard />}

      {!list.length ? (
        <Empty icon={Users} title="Nobody matches." body="Try another name or filter." />
      ) : (
        <div className="member-grid">
          {list.map((a) => {
            const me = a.id === accountId;
            const isFollowing = following.includes(a.id);
            const streak = currentStreak(a);
            const best = a.rng?.best ? auraById(a.rng.best) : null;
            return (
              <div
                key={a.id}
                className="card member-card"
                style={a.banner ? { '--banner': a.banner } : undefined}
                onClick={() => navigateTo(`/u/${encodeURIComponent(a.username || a.id)}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigateTo(`/u/${encodeURIComponent(a.username || a.id)}`); }}
              >
                <span className="member-banner" />
                <Avatar profile={a} size={52} online={isOnline(a)} />
                <strong className="truncate">{a.displayName || 'Astral member'}</strong>
                {a.username && <small className="faint">@{a.username}</small>}
                <span className="row" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <LevelBadge account={a} followers={followersOf(accounts, a.id).length} compact />
                  <AuraTitle account={a} />
                </span>
                {a.status && <span className="member-status truncate">{a.status}</span>}
                <div className="wrap member-meta">
                  <span className="chip">{followersOf(accounts, a.id).length} followers</span>
                  {streak > 1 && <span className="chip"><Flame size={12} /> {streak}</span>}
                  {best && best.chance >= 1000 && <span className="chip">{best.name}</span>}
                </div>
                {!me && (
                  <button
                    className={isFollowing ? 'btn btn-sm btn-ghost' : 'btn btn-sm btn-primary'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFollowing(accountId, a.id, !isFollowing).catch((err) => setError(err.message));
                    }}
                  >
                    {isFollowing ? <><UserCheck size={14} /> Following</> : <><UserPlus size={14} /> Follow</>}
                  </button>
                )}
                {me && <span className="chip chip-accent">You</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
