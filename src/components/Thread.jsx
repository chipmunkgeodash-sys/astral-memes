import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import {
  collection, onSnapshot, query, where, addDoc, deleteDoc,
  doc, serverTimestamp, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { Empty, Loader, ErrorNote, UserLink } from './ui';
import { deleteWithLog, messageRef } from '../lib/audit';
import Avatar from './Avatar';

// serverTimestamp() is null on the optimistic local echo, so a missing value
// means "just now" and keeps a sent message pinned to the bottom.
export const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now());

// One conversation: the message list plus the composer. Used by both the
// global chat tab and each direct-message thread.
export default function Thread({ thread, groupId = null, header, placeholder, emptyTitle, emptyBody }) {
  const { accountId, profile, isOwner, can } = useSession();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setMessages(null);
    if (!thread) return undefined;
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
  }, [messages?.length, thread]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !thread) return;
    setText(''); setError('');
    inputRef.current?.focus();
    try {
      await addDoc(collection(db, COL.messages), {
        thread,
        groupId,
        uid: accountId,
        displayName: profile?.displayName || 'Astral member',
        text: body,
        createdAt: serverTimestamp()
      });
    } catch (err) { setError(err.message); setText(body); }
  };

  const canDelete = (m) =>
    m.uid === accountId || isOwner || can('deleteMessages') || can('manageChat');

  const grouped = useMemo(() => groupMessages(messages || [], accountId), [messages, accountId]);

  return (
    <section className="dm-main">
      {header && <header className="dm-head">{header}</header>}

      <div className="dm-scroll">
        <ErrorNote>{error}</ErrorNote>

        {messages === null ? (
          <Loader label="Loading messages…" />
        ) : !messages.length ? (
          <Empty title={emptyTitle || 'No messages yet.'} body={emptyBody} />
        ) : grouped.map((item) => (
          item.type === 'day' ? (
            <div key={item.key} className="dm-day"><span>{item.label}</span></div>
          ) : (
            <div key={item.key} className={item.mine ? 'msg mine' : 'msg'}>
              <span className="msg-avatar">
                {!item.mine && <Avatar profile={{ id: item.uid, displayName: item.displayName }} size={28} />}
              </span>

              <div className="msg-col">
                {!item.mine && (
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
                        onClick={() => deleteWithLog('message', messageRef(m.id), m, { id: accountId, name: profile?.displayName }).catch((err) => setError(err.message))}
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
          placeholder={placeholder || 'Write a message…'}
          maxLength={2000}
          disabled={!thread}
        />
        <button className="btn btn-primary btn-icon" type="submit" disabled={!text.trim()} aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </section>
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

    // A five-minute gap starts a new block even from the same person.
    const gap = block && millis(m.createdAt) - millis(block.last) > 5 * 60 * 1000;
    if (!block || block.uid !== m.uid || gap) {
      block = {
        type: 'block',
        key: `b-${m.id}`,
        uid: m.uid,
        displayName: m.displayName,
        mine: m.uid === meId,
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
