import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Hash, MessageCircle, Trash2, Search } from 'lucide-react';
import {
  collection, onSnapshot, query, where, addDoc, deleteDoc,
  doc, serverTimestamp, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, Loader, ErrorNote, UserLink } from '../components/ui';
import Avatar from '../components/Avatar';

const LOUNGE = 'the-lounge';
const threadId = (a, b) => [a, b].sort().join('__');

// serverTimestamp() is null on the optimistic local echo, so a missing value
// means "just now" and keeps a sent message pinned to the bottom.
const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now());

export default function MessagesPage() {
  const { accountId, profile, isOwner, can } = useSession();
  const [accounts, setAccounts] = useState([]);
  const [active, setActive] = useState(LOUNGE);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => onSnapshot(
    collection(db, COL.accounts),
    (snap) => setAccounts(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.id !== accountId)
    ),
    () => setAccounts([])
  ), [accountId]);

  const thread = active === LOUNGE ? LOUNGE : threadId(accountId, active);

  useEffect(() => {
    setMessages(null);
    // No orderBy: combining it with the thread filter needs a composite index
    // and this project has none, so a capped page is sorted client-side.
    return onSnapshot(
      query(collection(db, COL.messages), where('thread', '==', thread), limit(300)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
        setMessages(rows);
      },
      (err) => { setError(err.message); setMessages([]); }
    );
  }, [thread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages?.length, active]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText(''); setError('');
    inputRef.current?.focus();
    try {
      await addDoc(collection(db, COL.messages), {
        thread,
        uid: accountId,
        displayName: profile?.displayName || 'Astral member',
        text: body,
        createdAt: serverTimestamp()
      });
    } catch (err) { setError(err.message); setText(body); }
  };

  const partner = useMemo(() => accounts.find((a) => a.id === active), [accounts, active]);
  const canDelete = (m) =>
    m.uid === accountId || isOwner || can('deleteMessages') || can('manageChat');

  const people = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return accounts;
    return accounts.filter((a) =>
      String(a.displayName || '').toLowerCase().includes(t)
      || String(a.username || '').toLowerCase().includes(t)
    );
  }, [accounts, term]);

  // Group runs from the same person so only the first bubble carries a header.
  const grouped = useMemo(() => groupMessages(messages || [], accountId), [messages, accountId]);

  return (
    <div className="stack">
      <PageHead eyebrow="Chat" title="Messages" />

      <div className="dm">
        <aside className="dm-side">
          <label className="search dm-search">
            <Search size={14} />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Find someone…" />
          </label>

          <div className="dm-list">
            <button className="dm-person" aria-current={active === LOUNGE} onClick={() => setActive(LOUNGE)}>
              <span className="avatar dm-hash" style={{ width: 34, height: 34 }}><Hash size={16} /></span>
              <span className="me-text">
                <strong>the-lounge</strong>
                <small>Everyone</small>
              </span>
            </button>

            <span className="dm-heading">Direct messages</span>

            {!people.length ? (
              <p className="faint" style={{ padding: '6px 10px' }}>
                {term ? 'Nobody matches that.' : 'No other members yet.'}
              </p>
            ) : people.map((a) => (
              <button key={a.id} className="dm-person" aria-current={active === a.id} onClick={() => setActive(a.id)}>
                <Avatar profile={a} size={34} />
                <span className="me-text">
                  <strong className="truncate">{a.displayName || 'Astral member'}</strong>
                  {a.username && <small>@{a.username}</small>}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="dm-main">
          <header className="dm-head">
            {active === LOUNGE ? (
              <>
                <span className="avatar dm-hash" style={{ width: 30, height: 30 }}><Hash size={15} /></span>
                <div className="me-text">
                  <strong>the-lounge</strong>
                  <small>{accounts.length + 1} members</small>
                </div>
              </>
            ) : (
              <>
                <Avatar profile={partner} size={30} />
                <div className="me-text">
                  <strong>{partner?.displayName || 'Direct message'}</strong>
                  {partner?.username && <small>@{partner.username}</small>}
                </div>
              </>
            )}
          </header>

          <div className="dm-scroll">
            <ErrorNote>{error}</ErrorNote>

            {messages === null ? (
              <Loader label="Loading messages…" />
            ) : !messages.length ? (
              <Empty
                icon={MessageCircle}
                title="No messages yet."
                body={active === LOUNGE ? 'Say hello to everyone.' : 'Start the conversation.'}
              />
            ) : grouped.map((item) => (
              item.type === 'day' ? (
                <div key={item.key} className="dm-day"><span>{item.label}</span></div>
              ) : (
                <div key={item.key} className={item.mine ? 'msg mine' : 'msg'}>
                  <span className="msg-avatar">
                    {item.first && !item.mine && (
                      <Avatar profile={{ id: item.uid, displayName: item.displayName }} size={28} />
                    )}
                  </span>

                  <div className="msg-col">
                    {item.first && !item.mine && (
                      <span className="msg-from">
                        <UserLink to={item.uid}>{item.displayName || 'Astral member'}</UserLink>
                      </span>
                    )}

                    {item.messages.map((m) => (
                      <div key={m.id} className="msg-row">
                        <div className="bubble">
                          {m.text}
                          <time className="bubble-time">{clock(m.createdAt)}</time>
                        </div>
                        {canDelete(m) && (
                          <button
                            className="msg-del"
                            onClick={() => deleteDoc(doc(db, COL.messages, m.id)).catch((e) => setError(e.message))}
                            aria-label="Delete message"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}

            <div ref={endRef} />
          </div>

          <form className="dm-compose" onSubmit={send}>
            <input
              ref={inputRef}
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={active === LOUNGE ? 'Message the lounge' : `Message ${partner?.displayName || ''}`}
              maxLength={2000}
            />
            <button className="btn btn-primary btn-icon" type="submit" disabled={!text.trim()} aria-label="Send">
              <Send size={16} />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

// Collapses consecutive messages from one person into a single block, and
// inserts a divider whenever the calendar day changes.
function groupMessages(rows, meId) {
  const out = [];
  let block = null;
  let lastDay = '';

  for (const m of rows) {
    const when = new Date(millis(m.createdAt));
    const day = when.toDateString();

    if (day !== lastDay) {
      out.push({ type: 'day', key: `day-${day}`, label: dayLabel(when) });
      lastDay = day;
      block = null;
    }

    const gap = block && millis(m.createdAt) - millis(block.last) > 5 * 60 * 1000;
    if (!block || block.uid !== m.uid || gap) {
      block = {
        type: 'block',
        key: `b-${m.id}`,
        uid: m.uid,
        displayName: m.displayName,
        mine: m.uid === meId,
        first: true,
        messages: [],
        last: m.createdAt
      };
      out.push(block);
    }
    block.messages.push(m);
    block.last = m.createdAt;
  }
  return out;
}

function dayLabel(d) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function clock(ts) {
  return new Date(millis(ts)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
