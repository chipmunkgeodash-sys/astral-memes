import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Hash, MessageCircle, Trash2 } from 'lucide-react';
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

// serverTimestamp() is null on the optimistic local echo, so treat a missing
// value as "now" to keep a just-sent message pinned to the bottom.
const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now());

export default function MessagesPage() {
  const { user, profile, isOwner, can } = useSession();
  const [accounts, setAccounts] = useState([]);
  const [active, setActive] = useState(LOUNGE);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => onSnapshot(
    collection(db, COL.accounts),
    (snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.id !== user?.uid)),
    () => setAccounts([])
  ), [user?.uid]);

  const thread = active === LOUNGE ? LOUNGE : threadId(user.uid, active);

  useEffect(() => {
    setMessages(null);
    // No orderBy: pairing it with the thread filter would need a composite
    // index, and this project has none. A capped page is sorted client-side.
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text.trim();
    setText(''); setError('');
    try {
      await addDoc(collection(db, COL.messages), {
        thread,
        uid: user.uid,
        displayName: profile?.displayName || 'Astral member',
        text: body,
        createdAt: serverTimestamp()
      });
    } catch (err) { setError(err.message); setText(body); }
  };

  const partner = useMemo(() => accounts.find((a) => a.id === active), [accounts, active]);
  const canDelete = (m) => m.uid === user.uid || isOwner || can('deleteMessages') || can('moderateMemes');

  return (
    <div className="stack">
      <PageHead eyebrow="Just between you" title="Messages" />

      <div className="dm">
        <aside className="dm-list">
          <button className="dm-person" aria-current={active === LOUNGE} onClick={() => setActive(LOUNGE)}>
            <span className="avatar" style={{ width: 30, height: 30 }}><Hash size={15} /></span>
            <span className="me-text">
              <strong>the-lounge</strong>
              <small>Everyone</small>
            </span>
          </button>

          {accounts.map((a) => (
            <button key={a.id} className="dm-person" aria-current={active === a.id} onClick={() => setActive(a.id)}>
              <Avatar profile={a} size={30} />
              <span className="me-text">
                <strong className="truncate">{a.displayName || 'Astral member'}</strong>
                {a.username && <small>@{a.username}</small>}
              </span>
            </button>
          ))}
        </aside>

        <section className="dm-main">
          <header className="dm-head">
            {active === LOUNGE
              ? <><Hash size={15} /> the-lounge</>
              : <><MessageCircle size={15} /> {partner?.displayName || 'Direct message'}</>}
          </header>

          <div className="dm-scroll">
            <ErrorNote>{error}</ErrorNote>
            {messages === null ? (
              <Loader label="Loading messages…" />
            ) : !messages.length ? (
              <Empty icon={MessageCircle} title="All quiet here." body="Say something first." />
            ) : (
              messages.map((m) => (
                <div key={m.id} className={m.uid === user.uid ? 'bubble mine' : 'bubble'}>
                  {m.uid !== user.uid && <strong><UserLink to={m.uid}>{m.displayName || 'Astral member'}</UserLink></strong>}
                  {m.text}
                  {canDelete(m) && (
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      style={{ marginLeft: 6, verticalAlign: 'middle' }}
                      onClick={() => deleteDoc(doc(db, COL.messages, m.id)).catch((e) => setError(e.message))}
                      aria-label="Delete message"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <form className="dm-compose" onSubmit={send}>
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={active === LOUNGE ? 'Message the lounge' : 'Write a message…'}
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
