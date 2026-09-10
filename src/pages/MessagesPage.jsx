import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Hash, MessageCircle, Trash2 } from 'lucide-react';
import {
  collection, onSnapshot, query, orderBy, where, addDoc, deleteDoc,
  doc, serverTimestamp, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { Empty, Loader, ErrorNote } from '../components/ui';
import Avatar from '../components/Avatar';

const LOUNGE = 'the-lounge';

// A DM thread id is both uids sorted, so either side computes the same key.
const threadId = (a, b) => [a, b].sort().join('__');

export default function MessagesPage() {
  const { user, profile, isOwner, can } = useSession();
  const [accounts, setAccounts] = useState([]);
  const [active, setActive] = useState(LOUNGE);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => onSnapshot(collection(db, COL.accounts),
    (snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.id !== user?.uid)),
    () => setAccounts([])
  ), [user?.uid]);

  const thread = active === LOUNGE ? LOUNGE : threadId(user.uid, active);

  useEffect(() => {
    setMessages(null);
    return onSnapshot(
      query(
        collection(db, COL.messages),
        where('thread', '==', thread),
        orderBy('createdAt', 'asc'),
        limit(300)
      ),
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
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

  const partner = useMemo(
    () => accounts.find((a) => a.id === active),
    [accounts, active]
  );

  return (
    <div className="dm-layout">
      <aside className="chat-panel">
        <button
          className={active === LOUNGE ? 'member-row selected' : 'member-row'}
          onClick={() => setActive(LOUNGE)}
        >
          <span className="channel-icon"><Hash size={16} /></span>
          <span className="profile-info">
            <strong>the-lounge</strong>
            <small>Join the global conversation</small>
          </span>
        </button>

        <span className="eyebrow">JUST BETWEEN YOU</span>
        {!accounts.length ? (
          <p className="compact-empty">Choose another account to message.</p>
        ) : accounts.map((a) => (
          <button
            key={a.id}
            className={active === a.id ? 'member-row selected' : 'member-row'}
            onClick={() => setActive(a.id)}
          >
            <Avatar profile={a} size={30} />
            <span className="profile-info">
              <strong>{a.displayName || 'Astral member'}</strong>
              {a.username && <small>@{a.username}</small>}
            </span>
          </button>
        ))}
      </aside>

      <section className="chat-history dm-history">
        <header className="chat-label">
          {active === LOUNGE
            ? <><Hash size={15} /> Message #the-lounge</>
            : <><MessageCircle size={15} /> {partner?.displayName || 'Direct message'}</>}
        </header>

        <ErrorNote>{error}</ErrorNote>

        {messages === null ? (
          <Loader label="Loading messages…" />
        ) : !messages.length ? (
          <Empty icon={MessageCircle} title="All quiet here." body="Say something first." />
        ) : (
          <div className="chat-messages">
            {messages.map((m) => (
              <div key={m.id} className={m.uid === user.uid ? 'chat-message dm-bubble mine' : 'chat-message dm-bubble'}>
                {m.uid !== user.uid && <strong>{m.displayName || 'Astral member'}</strong>}
                <p>{m.text}</p>
                {(m.uid === user.uid || isOwner || can('moderateMemes')) && (
                  <button
                    className="icon-btn"
                    onClick={() => deleteDoc(doc(db, COL.messages, m.id)).catch((e) => setError(e.message))}
                    aria-label="Delete message"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        <form className="chat-input" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={active === LOUNGE ? 'Message the lounge' : 'Write a message…'}
          />
          <button className="primary" type="submit" disabled={!text.trim()}>
            <Send size={15} />
          </button>
        </form>
      </section>
    </div>
  );
}
