import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Trash2, Search, X, Reply, Copy, ArrowDown, Smile } from 'lucide-react';
import {
  collection, onSnapshot, query, where, addDoc,
  serverTimestamp, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { Empty, Loader, ErrorNote, UserLink } from './ui';
import { deleteWithLog, messageRef } from '../lib/audit';
import { copyText, fullDate } from '../lib/social';
import { KEYS, readLocal, writeLocal } from '../lib/local';
import Avatar from './Avatar';
import RichText, { mentionsHandle } from './RichText';
import { linkPreviews, YouTubePreview } from './PostCard';

// serverTimestamp() is null on the optimistic local echo, so a missing value
// means "just now" and keeps a sent message pinned to the bottom.
export const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now());

const MAX_MESSAGE = 2000;
const CHAT_EMOJI = ['😂', '🔥', '💀', '😭', '❤️', '👀', '👍', '🙏', '🎉', '🤔', '😎', '🥺'];

export const SLASH_COMMANDS = [
  { cmd: '/shrug', help: '¯\\_(ツ)_/¯' },
  { cmd: '/tableflip', help: '(╯°□°)╯︵ ┻━┻' },
  { cmd: '/unflip', help: '┬─┬ ノ( ゜-゜ノ)' },
  { cmd: '/lenny', help: '( ͡° ͜ʖ ͡°)' },
  { cmd: '/roll', help: 'Roll a dice: /roll or /roll 20' },
  { cmd: '/flip', help: 'Flip a coin' },
  { cmd: '/me', help: '/me does something' }
];

// Turns a slash command into the message that actually gets sent.
export function runSlash(body, name) {
  const [head, ...rest] = body.split(' ');
  const arg = rest.join(' ').trim();
  switch (head.toLowerCase()) {
    case '/shrug': return `${arg ? `${arg} ` : ''}¯\\_(ツ)_/¯`;
    case '/tableflip': return `${arg ? `${arg} ` : ''}(╯°□°)╯︵ ┻━┻`;
    case '/unflip': return `${arg ? `${arg} ` : ''}┬─┬ ノ( ゜-゜ノ)`;
    case '/lenny': return `${arg ? `${arg} ` : ''}( ͡° ͜ʖ ͡°)`;
    case '/roll': {
      const sides = Math.min(1_000_000, Math.max(2, Math.floor(Number(arg)) || 6));
      return `🎲 rolled a d${sides}: **${1 + Math.floor(Math.random() * sides)}**`.replace(/\*\*/g, '');
    }
    case '/flip': return `🪙 flipped a coin: ${Math.random() < 0.5 ? 'Heads' : 'Tails'}`;
    case '/me': return arg ? `* ${name} ${arg}` : body;
    default: return body;
  }
}

// One conversation: the message list plus the composer. Used by both the
// global chat tab and each direct-message thread.
export default function Thread({ thread, groupId = null, header, placeholder, emptyTitle, emptyBody }) {
  const { accountId, profile, isOwner, can } = useSession();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [find, setFind] = useState('');
  const [replying, setReplying] = useState(null);
  const [emoji, setEmoji] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [lastRead, setLastRead] = useState(0);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setMessages(null);
    setReplying(null);
    setFind('');
    setSearching(false);
    // Remember where this thread was read up to before opening it.
    setLastRead(readLocal(KEYS.chatRead, {})[thread] || 0);
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

  // Mark the thread read up to the newest message whenever it's on screen.
  useEffect(() => {
    if (!thread || !messages?.length) return;
    const newest = millis(messages[messages.length - 1].createdAt);
    const all = readLocal(KEYS.chatRead, {});
    if ((all[thread] || 0) < newest) writeLocal(KEYS.chatRead, { ...all, [thread]: newest });
  }, [messages, thread]);

  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages?.length, thread]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const send = async (e) => {
    e.preventDefault();
    let body = text.trim();
    if (!body || !thread) return;
    if (body.startsWith('/')) body = runSlash(body, profile?.displayName || 'Someone');
    if (replying) body = `> ${replying.displayName || 'Someone'}: ${(replying.text || '').slice(0, 120)}\n${body}`;
    setText(''); setError(''); setReplying(null); setEmoji(false);
    inputRef.current?.focus();
    setAtBottom(true);
    try {
      await addDoc(collection(db, COL.messages), {
        thread,
        groupId,
        uid: accountId,
        displayName: profile?.displayName || 'Astral member',
        text: body.slice(0, MAX_MESSAGE),
        createdAt: serverTimestamp()
      });
    } catch (err) { setError(err.message); setText(text); }
  };

  const canDelete = (m) =>
    m.uid === accountId || isOwner || can('deleteMessages') || can('manageChat');

  const blocked = profile?.blocked || [];
  const needle = find.trim().toLowerCase();
  const visible = useMemo(() => (messages || []).filter((m) => !blocked.includes(m.uid)
    && (!needle || (m.text || '').toLowerCase().includes(needle) || (m.displayName || '').toLowerCase().includes(needle))),
  [messages, blocked, needle]);

  const grouped = useMemo(() => groupMessages(visible, accountId, needle ? 0 : lastRead), [visible, accountId, lastRead, needle]);

  // What counts as "@me": the username, or the display name with spaces removed.
  const myHandles = useMemo(() => [profile?.username, (profile?.displayName || '').replace(/\s+/g, '')]
    .filter(Boolean)
    .map((h) => h.toLowerCase()), [profile?.username, profile?.displayName]);

  const suggestions = text.startsWith('/') && !text.includes(' ')
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(text.toLowerCase()))
    : [];

  return (
    <section className="dm-main">
      {header && (
        <header className="dm-head">
          {header}
          <button className={searching ? 'btn btn-sm btn-primary btn-icon' : 'btn btn-sm btn-ghost btn-icon'} onClick={() => { setSearching((v) => !v); setFind(''); }} aria-label="Search messages" title="Search messages">
            <Search size={14} />
          </button>
        </header>
      )}
      {searching && (
        <div className="dm-find">
          <Search size={13} />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search this conversation…" autoFocus />
          {needle && <small className="faint">{visible.length} found</small>}
          <button className="btn btn-ghost btn-icon" onClick={() => { setSearching(false); setFind(''); }} aria-label="Close search"><X size={13} /></button>
        </div>
      )}

      <div className="dm-scroll" ref={scrollRef} onScroll={onScroll}>
        <ErrorNote>{error}</ErrorNote>

        {messages === null ? (
          <Loader label="Loading messages…" />
        ) : !visible.length ? (
          <Empty title={needle ? 'No messages match.' : emptyTitle || 'No messages yet.'} body={needle ? '' : emptyBody} />
        ) : grouped.map((item) => (
          item.type === 'day' ? (
            <div key={item.key} className="dm-day"><span>{item.label}</span></div>
          ) : item.type === 'unread' ? (
            <div key={item.key} className="dm-unread"><span>New messages</span></div>
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

                {item.messages.map((m) => {
                  const [quoteLine, ...restLines] = (m.text || '').split('\n');
                  const quoted = quoteLine.startsWith('> ') && restLines.length ? quoteLine.slice(2) : null;
                  const body = quoted ? restLines.join('\n') : m.text;
                  const { youtube } = linkPreviews(body);
                  return (
                    <div key={m.id} className="msg-row">
                      <div className={!item.mine && mentionsHandle(m.text, myHandles) ? 'bubble bubble-mention' : 'bubble'}>
                        {quoted && <span className="bubble-quote">{quoted}</span>}
                        <RichText text={body} me={myHandles} />
                        {youtube && <YouTubePreview id={youtube.id} url={youtube.url} />}
                        <time className="bubble-time" title={fullDate(m.createdAt)}>{clock(m.createdAt)}</time>
                      </div>
                      <span className="msg-tools">
                        <button className="msg-del" onClick={() => { setReplying(m); inputRef.current?.focus(); }} aria-label="Reply" title="Reply"><Reply size={12} /></button>
                        <button className="msg-del" onClick={() => copyText(m.text || '')} aria-label="Copy" title="Copy text"><Copy size={12} /></button>
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
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ))}

        <div ref={endRef} />
      </div>

      {!atBottom && (
        <button className="jump-latest" onClick={() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); setAtBottom(true); }}>
          <ArrowDown size={14} /> Latest
        </button>
      )}

      {replying && (
        <div className="dm-replying">
          <Reply size={13} />
          <span className="truncate">Replying to <strong>{replying.displayName}</strong>: {replying.text}</span>
          <button className="btn btn-ghost btn-icon" onClick={() => setReplying(null)} aria-label="Cancel reply"><X size={13} /></button>
        </div>
      )}
      {!!suggestions.length && (
        <div className="slash-list">
          {suggestions.map((c) => (
            <button key={c.cmd} type="button" onClick={() => { setText(`${c.cmd} `); inputRef.current?.focus(); }}>
              <strong>{c.cmd}</strong> <span className="faint">{c.help}</span>
            </button>
          ))}
        </div>
      )}
      {emoji && (
        <div className="emoji-bar chat-emoji">
          {CHAT_EMOJI.map((e) => <button key={e} type="button" onClick={() => { setText((t) => (t + e).slice(0, MAX_MESSAGE)); inputRef.current?.focus(); }}>{e}</button>)}
        </div>
      )}

      <form className="dm-compose" onSubmit={send}>
        <button type="button" className={emoji ? 'btn btn-icon btn-primary' : 'btn btn-icon btn-ghost'} onClick={() => setEmoji((v) => !v)} aria-label="Emoji"><Smile size={16} /></button>
        <input
          ref={inputRef}
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder || 'Write a message… try /roll or /shrug'}
          maxLength={MAX_MESSAGE}
          disabled={!thread}
        />
        {text.length > MAX_MESSAGE * 0.8 && <small className="chat-count">{MAX_MESSAGE - text.length}</small>}
        <button className="btn btn-primary btn-icon" type="submit" disabled={!text.trim()} aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}

// Collapses consecutive messages from one person into a single block, inserts a
// divider whenever the calendar day changes, and marks where unread begins.
function groupMessages(rows, meId, lastRead) {
  const out = [];
  let block = null;
  let lastDay = '';
  let unreadMarked = !lastRead;

  for (const m of rows) {
    const when = new Date(millis(m.createdAt));
    const day = when.toDateString();

    if (day !== lastDay) {
      out.push({ type: 'day', key: `day-${day}`, label: dayLabel(when) });
      lastDay = day;
      block = null;
    }

    if (!unreadMarked && m.uid !== meId && millis(m.createdAt) > lastRead) {
      out.push({ type: 'unread', key: `unread-${m.id}` });
      unreadMarked = true;
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
