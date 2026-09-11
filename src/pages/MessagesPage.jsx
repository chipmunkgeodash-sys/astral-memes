import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search, User } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, navigateTo } from '../components/ui';
import Avatar from '../components/Avatar';
import Thread from '../components/Thread';

// A thread id is both account ids sorted, so either side computes the same key.
const threadId = (a, b) => [a, b].sort().join('__');

export default function MessagesPage() {
  const { accountId } = useSession();
  const [accounts, setAccounts] = useState(null);
  const [active, setActive] = useState(null);
  const [term, setTerm] = useState('');

  useEffect(() => onSnapshot(
    collection(db, COL.accounts),
    (snap) => setAccounts(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.id !== accountId)
    ),
    () => setAccounts([])
  ), [accountId]);

  const people = useMemo(() => {
    if (!accounts) return [];
    const t = term.trim().toLowerCase();
    if (!t) return accounts;
    return accounts.filter((a) =>
      String(a.displayName || '').toLowerCase().includes(t)
      || String(a.username || '').toLowerCase().includes(t)
    );
  }, [accounts, term]);

  const partner = useMemo(
    () => (accounts || []).find((a) => a.id === active),
    [accounts, active]
  );

  return (
    <div className="stack">
      <PageHead eyebrow="Just between you" title="Direct messages" />

      <div className="dm">
        <aside className="dm-side">
          <label className="search dm-search">
            <Search size={14} />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Find someone…" />
          </label>

          <div className="dm-list">
            {!people.length ? (
              <p className="faint" style={{ padding: '8px 10px' }}>
                {term ? 'Nobody matches that.' : 'No other members yet.'}
              </p>
            ) : people.map((a) => (
              <button
                key={a.id}
                className="dm-person"
                aria-current={active === a.id}
                onClick={() => setActive(a.id)}
              >
                <Avatar profile={a} size={34} />
                <span className="me-text">
                  <strong className="truncate">{a.displayName || 'Astral member'}</strong>
                  {a.username && <small>@{a.username}</small>}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {active && partner ? (
          <Thread
            thread={threadId(accountId, active)}
            placeholder={`Message ${partner.displayName || ''}`}
            emptyTitle="No messages yet."
            emptyBody="Start the conversation."
            header={
              <>
                <button
                  className="dm-head-profile"
                  onClick={() => navigateTo(`/u/${encodeURIComponent(partner.usernameLower || partner.id)}`)}
                  title="View profile"
                >
                  <Avatar profile={partner} size={32} />
                  <span className="me-text">
                    <strong>{partner.displayName || 'Astral member'}</strong>
                    {partner.username && <small>@{partner.username}</small>}
                  </span>
                </button>
                <button
                  className="btn btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => navigateTo(`/u/${encodeURIComponent(partner.usernameLower || partner.id)}`)}
                >
                  <User size={13} /> Profile
                </button>
              </>
            }
          />
        ) : (
          <div className="dm-main dm-blank">
            <Empty
              icon={MessageCircle}
              title="Pick someone to message"
              body="Choose a member from the list to start a private conversation."
            />
          </div>
        )}
      </div>
    </div>
  );
}
