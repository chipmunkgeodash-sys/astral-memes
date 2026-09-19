import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Heart, MessageCircle, Share2, Plus, Volume2, VolumeX, Trash2, Eye, X, Send, Link2,
  Clapperboard, ChevronUp, ChevronDown, Check, MoreHorizontal
} from 'lucide-react';
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, increment, limit, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { Tabs, ErrorNote, UserLink, navigateTo } from '../components/ui';
import RichText, { myHandles } from '../components/RichText';
import Avatar from '../components/Avatar';
import { copyText, formatWhen, millis, setFollowing, useAccounts } from '../lib/social';
import { parseYouTubeUrl, youtubeThumb } from '../lib/shorts';
import { play } from '../lib/sound';
import { confetti } from '../lib/confetti';
import { bumpActivity } from '../lib/levels';

const SOUND_KEY = 'astral-shorts-sound';

const fmtCount = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n || 0));

// A stable per-visit shuffle so For You doesn't reorder itself on every like.
const sessionSeed = Math.random();
const jitter = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h * sessionSeed) % 1000) / 1000;
};

export default function ShortsPage({ router }) {
  const { accountId, profile } = useSession();
  const accounts = useAccounts();
  const [shorts, setShorts] = useState(null);
  const [tab, setTab] = useState('foryou');
  const [active, setActive] = useState(0);
  const [muted, setMutedState] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'on'; } catch { return true; }
  });
  const setMuted = useCallback((next) => {
    setMutedState((cur) => {
      const value = typeof next === 'function' ? next(cur) : next;
      try { localStorage.setItem(SOUND_KEY, value ? 'off' : 'on'); } catch { /* per visit only */ }
      return value;
    });
  }, []);
  const [creating, setCreating] = useState(false);
  const [commentsFor, setCommentsFor] = useState(null);
  const [counts, setCounts] = useState({});
  const [toast, setToast] = useState('');
  const scroller = useRef(null);
  const jumped = useRef(false);
  const deepLink = router?.segments?.[1] || null;

  useEffect(() => onSnapshot(
    query(collection(db, COL.shorts), orderBy('createdAt', 'desc'), limit(200)),
    // Shorts are YouTube only. Anything older of another kind stays hidden.
    (snap) => setShorts(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.kind === 'youtube')),
    () => setShorts([])
  ), []);

  // Comment counts for the rail.
  useEffect(() => onSnapshot(
    query(collection(db, COL.comments), orderBy('createdAt', 'desc'), limit(1000)),
    (snap) => {
      const next = {};
      snap.docs.forEach((d) => { const id = d.data().postId; next[id] = (next[id] || 0) + 1; });
      setCounts(next);
    },
    () => setCounts({})
  ), []);

  const following = profile?.following || [];
  const mutedPeople = profile?.muted || [];
  const byId = useMemo(() => new Map((accounts || []).map((a) => [a.id, a])), [accounts]);

  const list = useMemo(() => {
    const all = (shorts || []).filter((s) => !mutedPeople.includes(s.uid));
    if (tab === 'following') return all.filter((s) => following.includes(s.uid));
    if (tab === 'mine') return all.filter((s) => s.uid === accountId);
    const now = Date.now();
    const score = (s) => {
      const ageH = Math.max(1, (now - (millis(s.createdAt) || now)) / 3_600_000);
      return ((s.likes || []).length * 3 + (s.views || 0) * 0.2 + (counts[s.id] || 0) * 2 + 4) / ageH ** 0.6 + jitter(s.id) * 2;
    };
    return [...all].sort((a, b) => score(b) - score(a));
  }, [shorts, tab, following, mutedPeople, accountId, counts]);

  // Open a shared link on the right short, once.
  useEffect(() => {
    if (jumped.current || !deepLink || !list.length) return;
    const i = list.findIndex((s) => s.id === deepLink);
    jumped.current = true;
    if (i > 0) {
      requestAnimationFrame(() => {
        scroller.current?.children[i]?.scrollIntoView({ block: 'start' });
        setActive(i);
      });
    }
  }, [deepLink, list]);

  // Whichever short fills most of the screen is the active one.
  useEffect(() => {
    const root = scroller.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number(e.target.dataset.index));
      }
    }, { root, threshold: [0.6] });
    [...root.children].forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [list.length, tab]);

  useEffect(() => { setActive(0); scroller.current?.scrollTo?.({ top: 0 }); }, [tab]);

  const go = useCallback((delta) => {
    const root = scroller.current;
    if (!root) return;
    const next = Math.max(0, Math.min(list.length - 1, active + delta));
    root.children[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [active, list.length]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 1800); };

  const toggleLike = useCallback(async (s, forceOn = false) => {
    const liked = (s.likes || []).includes(accountId);
    if (liked && forceOn) return;
    if (!liked) play('click');
    try {
      await updateDoc(doc(db, COL.shorts, s.id), { likes: liked ? arrayRemove(accountId) : arrayUnion(accountId) });
    } catch (err) { flash(err.message); }
  }, [accountId]);

  useEffect(() => {
    const onKey = (e) => {
      if (creating || commentsFor || e.target.closest?.('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(-1); }
      if (e.key === 'm') setMuted((v) => !v);
      if (e.key === 'l' && list[active]) toggleLike(list[active]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, creating, commentsFor, list, active, toggleLike, setMuted]);

  const share = async (s) => {
    const ok = await copyText(`${window.location.origin}/shorts/${s.id}`);
    flash(ok ? 'Link copied' : 'Copy failed');
  };

  const remove = async (s) => {
    if (!window.confirm('Delete this short?')) return;
    try { await deleteDoc(doc(db, COL.shorts, s.id)); flash('Deleted'); } catch (err) { flash(err.message); }
  };

  return (
    <div className="shorts-page">
      <div className="shorts-top">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[{ value: 'foryou', label: 'For You' }, { value: 'following', label: 'Following' }, { value: 'mine', label: 'Mine' }]}
        />
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={15} /> Create</button>
      </div>

      <div className="shorts-scroller" ref={scroller}>
        {shorts === null ? (
          <div className="short short-skeleton" data-index={0}><div className="short-frame skeleton" /></div>
        ) : !list.length ? (
          <div className="short short-empty" data-index={0}>
            <div className="short-frame short-empty-frame">
              <Clapperboard size={40} />
              <strong>{tab === 'following' ? 'Nobody you follow has posted a short.' : tab === 'mine' ? "You haven't posted a short yet." : 'No shorts yet.'}</strong>
              <span>Share a YouTube Short by pasting its link.</span>
              <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Create a short</button>
            </div>
          </div>
        ) : list.map((s, i) => (
          <Short
            key={s.id}
            short={s}
            index={i}
            active={i === active}
            author={byId.get(s.uid)}
            meId={accountId}
            handles={myHandles(profile)}
            muted={muted}
            onMute={() => setMuted((v) => !v)}
            following={following.includes(s.uid)}
            commentCount={counts[s.id] || 0}
            onLike={toggleLike}
            onComments={() => setCommentsFor(s)}
            onShare={() => share(s)}
            onDelete={() => remove(s)}
            onFollow={() => setFollowing(accountId, s.uid, true).then(() => flash('Following')).catch((e) => flash(e.message))}
          />
        ))}
      </div>

      <div className="shorts-nav">
        <button className="btn btn-icon" onClick={() => go(-1)} disabled={active === 0} aria-label="Previous"><ChevronUp size={18} /></button>
        <button className="btn btn-icon" onClick={() => go(1)} disabled={active >= list.length - 1} aria-label="Next"><ChevronDown size={18} /></button>
      </div>

      {creating && <CreateShort me={{ id: accountId, name: profile?.displayName }} onClose={() => setCreating(false)} onPosted={() => { setCreating(false); setTab('mine'); flash('Posted!'); confetti({ count: 60 }); play('good'); }} />}
      {commentsFor && <CommentsSheet short={commentsFor} me={{ id: accountId, name: profile?.displayName }} handles={myHandles(profile)} onClose={() => setCommentsFor(null)} />}
      {toast && createPortal(<div className="rng-toast" role="status">{toast}</div>, document.body)}
    </div>
  );
}

function Short({
  short: s, index, active, author, meId, handles, muted, onMute, following, commentCount,
  onLike, onComments, onShare, onDelete, onFollow
}) {
  const [hearts, setHearts] = useState([]);
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastTap = useRef(0);
  const viewed = useRef(false);
  const liked = (s.likes || []).includes(meId);
  const mine = s.uid === meId;
  const name = author?.displayName || s.displayName || 'Astral member';

  useEffect(() => { if (!active) { setMenu(false); setExpanded(false); } }, [active]);

  // Count a view after it has been on screen for a moment, once per visit.
  useEffect(() => {
    if (!active || viewed.current) return undefined;
    const t = setTimeout(() => {
      viewed.current = true;
      updateDoc(doc(db, COL.shorts, s.id), { views: increment(1) }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [active, s.id]);

  // Double-tap likes; a single tap unmutes when the sound is off.
  const onTap = (e) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      const r = e.currentTarget.getBoundingClientRect();
      const heart = { id: now, x: e.clientX - r.left, y: e.clientY - r.top };
      setHearts((h) => [...h, heart]);
      setTimeout(() => setHearts((h) => h.filter((x) => x.id !== heart.id)), 900);
      onLike(s, true);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setTimeout(() => { if (lastTap.current === now && muted) onMute(); }, 290);
  };

  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  return (
    <section className={active ? 'short active' : 'short'} data-index={index}>
      <div className="short-frame" onClick={onTap}>
        <YouTubeShort id={s.media} active={active} muted={muted} />

        <button className={muted ? 'short-sound muted' : 'short-sound'} onClick={stop(onMute)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute (M)' : 'Mute (M)'}>
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        {muted && active && (
          <button className="unmute-pill" onClick={stop(onMute)}>
            <VolumeX size={16} /> Tap to unmute
          </button>
        )}

        {hearts.map((h) => <span key={h.id} className="tap-heart" style={{ left: h.x, top: h.y }}><Heart size={90} fill="currentColor" /></span>)}

        <div className="short-info">
          <div className="row" style={{ gap: 8 }}>
            <UserLink to={author?.username || s.uid}>@{author?.username || name}</UserLink>
            {!mine && !following && <button className="short-follow" onClick={stop(onFollow)}>Follow</button>}
          </div>
          {s.caption && (
            <p className={expanded ? 'short-caption open' : 'short-caption'} onClick={stop(() => setExpanded((v) => !v))}>
              <RichText text={s.caption} me={handles} />
            </p>
          )}
          <span className="short-meta"><Eye size={12} /> {fmtCount(s.views || 0)} views · {formatWhen(s.createdAt)}</span>
        </div>
      </div>

      <div className="short-rail">
        <div className="rail-avatar">
          <button className="rail-face" onClick={() => navigateTo(`/u/${encodeURIComponent(author?.username || s.uid)}`)} aria-label={`${name}'s profile`}>
            <Avatar profile={author || { id: s.uid, displayName: name }} size={44} />
          </button>
          {!mine && !following && <button className="rail-follow" onClick={onFollow} aria-label={`Follow ${name}`}><Plus size={13} /></button>}
          {!mine && following && <span className="rail-follow on"><Check size={12} /></span>}
        </div>
        <button className={liked ? 'rail-btn liked' : 'rail-btn'} onClick={() => onLike(s)} aria-pressed={liked} aria-label="Like">
          <span><Heart size={26} fill={liked ? 'currentColor' : 'none'} /></span>
          <small>{fmtCount((s.likes || []).length)}</small>
        </button>
        <button className="rail-btn" onClick={onComments} aria-label="Comments">
          <span><MessageCircle size={26} /></span>
          <small>{fmtCount(commentCount)}</small>
        </button>
        <button className="rail-btn" onClick={onShare} aria-label="Share">
          <span><Share2 size={24} /></span>
          <small>Share</small>
        </button>
        <div className="rail-more">
          <button className="rail-btn" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu}>
            <span><MoreHorizontal size={24} /></span>
          </button>
          {menu && (
            <div className="menu rail-menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { setMenu(false); onShare(); }}><Link2 size={14} /> Copy link</button>
              <button onClick={() => { setMenu(false); onMute(); }}>{muted ? <><Volume2 size={14} /> Unmute</> : <><VolumeX size={14} /> Mute</>}</button>
              {mine && <button className="danger" onClick={() => { setMenu(false); onDelete(); }}><Trash2 size={14} /> Delete</button>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Tells the YouTube player to mute or unmute without reloading it, so the
// video keeps its place when the sound is switched.
function sendSound(frame, muted) {
  const target = frame?.contentWindow;
  if (!target) return;
  const command = (func, args = []) => target.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  try {
    command(muted ? 'mute' : 'unMute');
    if (!muted) command('setVolume', [100]);
    command('playVideo');
  } catch { /* the player may not be ready yet; onLoad sends it again */ }
}

// The short on screen plays in YouTube's player; the rest show a thumbnail so
// only one video loads at a time.
function YouTubeShort({ id, active, muted }) {
  const frameRef = useRef(null);
  // The embed URL is fixed when the player mounts; later changes go by message.
  const startMuted = useRef(muted);

  useEffect(() => { sendSound(frameRef.current, muted); }, [muted]);

  if (!active) return <img className="short-media" src={youtubeThumb(id)} alt="" loading="lazy" />;

  const onLoad = () => {
    // The player needs a moment after load before it accepts commands.
    [150, 700, 1500].forEach((ms) => setTimeout(() => sendSound(frameRef.current, muted), ms));
  };
  const params = `autoplay=1&mute=${startMuted.current ? 1 : 0}&loop=1&playlist=${id}&playsinline=1&controls=0&modestbranding=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
  return (
    <iframe
      ref={frameRef}
      className="short-media"
      src={`https://www.youtube.com/embed/${id}?${params}`}
      title="YouTube short"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      onLoad={onLoad}
    />
  );
}

function CommentsSheet({ short, me, handles, onClose }) {
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, COL.comments), where('postId', '==', short.id)),
    (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(a.createdAt) - millis(b.createdAt))),
    (err) => { setError(err.message); setComments([]); }
  ), [short.id]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await addDoc(collection(db, COL.comments), {
        postId: short.id, uid: me.id, displayName: me.name || 'Astral member', text: body.slice(0, 500), createdAt: serverTimestamp()
      });
      bumpActivity(me.id, 'comments');
    } catch (err) { setError(err.message); setText(body); }
  };

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Comments">
        <div className="sheet-head">
          <strong>{comments ? `${comments.length} comments` : 'Comments'}</strong>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="sheet-body">
          <ErrorNote>{error}</ErrorNote>
          {comments && !comments.length && <p className="faint" style={{ textAlign: 'center', padding: 20 }}>No comments yet. Start the conversation.</p>}
          {(comments || []).map((c) => (
            <div key={c.id} className="comment">
              <Avatar profile={{ id: c.uid, displayName: c.displayName }} size={28} />
              <div className="comment-body">
                <span className="row" style={{ gap: 6 }}>
                  <UserLink to={c.uid}>{c.displayName || 'Astral member'}</UserLink>
                  <small className="faint">{formatWhen(c.createdAt)}</small>
                </span>
                <p><RichText text={c.text} me={handles} /></p>
              </div>
            </div>
          ))}
        </div>
        <form className="comment-form sheet-form" onSubmit={send}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" maxLength={500} autoFocus />
          <button className="btn btn-primary btn-icon" type="submit" disabled={!text.trim()} aria-label="Send"><Send size={15} /></button>
        </form>
      </div>
    </div>,
    document.body
  );
}

function CreateShort({ me, onClose, onPosted }) {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const id = parseYouTubeUrl(url);

  const post = async () => {
    if (!id) { setError("That isn't a YouTube link. Paste a link to a YouTube Short or video."); return; }
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, COL.shorts), {
        uid: me.id,
        displayName: me.name || 'Astral member',
        kind: 'youtube',
        media: id,
        caption: caption.trim().slice(0, 300),
        likes: [],
        views: 0,
        createdAt: serverTimestamp()
      });
      bumpActivity(me.id, 'shorts');
      onPosted();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal create-short" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create a short">
        <div className="modal-head">
          <h2>Share a YouTube Short</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="modal-body create-short-body">
          <div className="create-preview">
            {id
              ? <img className="short-media" src={youtubeThumb(id)} alt="" />
              : <div className="short-media short-placeholder"><Clapperboard size={36} /><small>Preview</small></div>}
          </div>
          <div className="stack" style={{ gap: 12, flex: 1, minWidth: 0 }}>
            <label className="field">
              <span>YouTube link</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/shorts/…" autoFocus />
              <span className="hint">{url ? (id ? 'YouTube video found ✓' : "That doesn't look like a YouTube link.") : 'Shorts, youtu.be and regular video links all work.'}</span>
            </label>
            <label className="field">
              <span>Caption</span>
              <textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="Say something… #tags and @mentions work" />
              <span className="hint">{caption.length} / 300</span>
            </label>
            <ErrorNote>{error}</ErrorNote>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={post} disabled={busy}><Send size={15} /> {busy ? 'Posting…' : 'Post short'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
