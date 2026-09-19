import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon, Send, Rss, Bookmark, Flame, Hash, TrendingUp, X, Search, Eye, Pencil, MessagesSquare,
  Plus, Check, ArrowUp
} from 'lucide-react';
import {
  collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, ErrorNote, Tabs, Toast, navigateTo } from '../components/ui';
import { hasMutedWord, millis, setFollowingTag, useAccounts } from '../lib/social';
import { KEYS, useLocal } from '../lib/local';
import { play } from '../lib/sound';
import { bumpActivity } from '../lib/levels';
import Avatar from '../components/Avatar';
import PostCard, { engagement } from '../components/PostCard';
import RichText, { hashtagsIn, myHandles } from '../components/RichText';
import { SkeletonPosts } from '../components/Skeleton';

const TABS = [
  { value: 'latest', label: 'Latest' },
  { value: 'top', label: 'Top' },
  { value: 'discussed', label: 'Most discussed' },
  { value: 'following', label: 'Following' },
  { value: 'saved', label: 'Saved' }
];

const QUICK_EMOJI = ['😂', '🔥', '💀', '😭', '❤️', '👀', '✨', '🎮', '🏆', '🤡'];
const DRAFT_KEY = 'astral-feed-draft';
const PAGE = 20;
const MAX_CHARS = 1000;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}

// A ring that fills as the post gets longer and turns red near the limit.
function CharRing({ count, max }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, count / max);
  const tone = frac >= 1 ? 'var(--danger)' : frac > 0.9 ? '#f59e0b' : 'var(--accent)';
  return (
    <span className="char-ring" title={`${count} / ${max}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="2.5" />
        <circle cx="12" cy="12" r={r} fill="none" stroke={tone} strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 12 12)" strokeLinecap="round" />
      </svg>
      {frac > 0.8 && <small style={{ color: tone }}>{max - count}</small>}
    </span>
  );
}

export default function FeedPage({ router }) {
  const { accountId, profile, can, isOwner } = useSession();
  const accounts = useAccounts();
  const tag = router?.segments?.[0] === 'tag' ? decodeURIComponent(router.segments[1] || '').toLowerCase() : '';
  const [posts, setPosts] = useState(null);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState(() => readDraft().text || '');
  const [imageUrl, setImageUrl] = useState(() => readDraft().imageUrl || '');
  const [sensitive, setSensitive] = useState(false);
  const [preview, setPreview] = useState(false);
  const [quoting, setQuoting] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('latest');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(PAGE);
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const [hidden, setHidden] = useLocal(KEYS.hiddenPosts, []);
  const textRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => onSnapshot(
    query(collection(db, COL.posts), orderBy('createdAt', 'desc'), limit(300)),
    (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setPosts([]); }
  ), []);

  // One listener for recent comments, grouped by post below.
  useEffect(() => onSnapshot(
    query(collection(db, COL.comments), orderBy('createdAt', 'desc'), limit(1000)),
    (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setComments([])
  ), []);

  // Drafts survive a refresh or a wander to another page.
  useEffect(() => {
    try {
      if (text || imageUrl) localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, imageUrl }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* not worth reporting */ }
  }, [text, imageUrl]);

  useEffect(() => { setPageSize(PAGE); }, [tab, tag, search]);

  // Quote from elsewhere (the single-post page) arrives by query string.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('quote');
    if (q && posts) {
      const target = posts.find((p) => p.id === q);
      if (target) setQuoting(target);
    }
  }, [posts]);

  const byPost = useMemo(() => {
    const map = new Map();
    for (const c of comments) {
      if (!map.has(c.postId)) map.set(c.postId, []);
      map.get(c.postId).push(c);
    }
    for (const list of map.values()) list.sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
    return map;
  }, [comments]);

  const authors = useMemo(() => new Map((accounts || []).map((a) => [a.id, a])), [accounts]);
  const postsById = useMemo(() => new Map((posts || []).map((p) => [p.id, p])), [posts]);
  const following = profile?.following || [];
  const followedTags = profile?.followedTags || [];
  const saved = profile?.saved || [];
  const muted = profile?.muted || [];
  const mutedWords = profile?.mutedWords || [];
  const handles = myHandles(profile);

  const visible = useMemo(() => (posts || []).filter((p) => !muted.includes(p.uid)
    && !hidden.includes(p.id)
    && (p.uid === accountId || !hasMutedWord(p.text, mutedWords))), [posts, muted, hidden, mutedWords, accountId]);

  const trending = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const counts = new Map();
    for (const p of visible) {
      if (millis(p.createdAt) && millis(p.createdAt) < weekAgo) continue;
      for (const t of hashtagsIn(p.text)) counts.set(t, (counts.get(t) || 0) + 1 + (p.likes || []).length * 0.5);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [visible]);

  // New posts from other people wait behind a banner instead of pushing the
  // feed around while you read.
  const isNew = (p) => p.uid !== accountId && millis(p.createdAt) > seenAt;
  const waiting = tab === 'latest' && !tag && !search ? visible.filter(isNew).length : 0;

  const shown = useMemo(() => {
    let list = visible;
    const needle = search.trim().toLowerCase();
    if (needle) list = list.filter((p) => (p.text || '').toLowerCase().includes(needle) || (p.displayName || '').toLowerCase().includes(needle));
    if (tag) return list.filter((p) => hashtagsIn(p.text).includes(tag));
    if (tab === 'following') return list.filter((p) => following.includes(p.uid) || hashtagsIn(p.text).some((t) => followedTags.includes(t)));
    if (tab === 'saved') return list.filter((p) => saved.includes(p.id));
    if (tab === 'top') return [...list].sort((a, b) => engagement(b, byPost.get(b.id)?.length || 0) * 2 - engagement(a, byPost.get(a.id)?.length || 0) * 2);
    if (tab === 'discussed') return [...list].filter((p) => byPost.get(p.id)?.length).sort((a, b) => (byPost.get(b.id)?.length || 0) - (byPost.get(a.id)?.length || 0));
    return needle ? list : list.filter((p) => !isNew(p));
  }, [visible, tab, tag, search, following, followedTags, saved, byPost, seenAt]);

  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 2200); };

  const addEmoji = (e) => {
    const el = textRef.current;
    const at = el ? el.selectionStart ?? text.length : text.length;
    setText((t) => (t.slice(0, at) + e + t.slice(at)).slice(0, MAX_CHARS));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange?.(at + e.length, at + e.length); });
  };

  const share = async () => {
    if (!text.trim() && !imageUrl.trim() && !quoting) { setError('Add a caption or image first.'); return; }
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, COL.posts), {
        uid: accountId,
        displayName: profile?.displayName || 'Astral member',
        text: text.trim(),
        imageUrl: imageUrl.trim() || null,
        sensitive: sensitive && !!(imageUrl.trim()),
        quotedId: quoting?.id || null,
        likes: [],
        createdAt: serverTimestamp()
      });
      setText(''); setImageUrl(''); setSensitive(false); setPreview(false); setQuoting(null);
      if (window.location.search.includes('quote=')) window.history.replaceState({}, '', window.location.pathname);
      bumpActivity(accountId, 'posts');
      play('good');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const hidePost = (p) => {
    setHidden((h) => [p.id, ...(h || [])].slice(0, 500));
    setUndo(p);
    setTimeout(() => setUndo((u) => (u && u.id === p.id ? null : u)), 5000);
  };

  const quote = (p) => {
    setQuoting(p);
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => textRef.current?.focus());
  };

  const showNew = () => {
    // Past the newest post too, in case this device's clock runs behind.
    setSeenAt(Math.max(Date.now(), ...visible.map((p) => millis(p.createdAt))));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tagFollowed = tag && followedTags.includes(tag);

  const empty = search.trim()
    ? [`No posts match “${search.trim()}”.`, 'Try another word.']
    : tag
      ? [`Nothing tagged #${tag}.`, 'Use the tag in a post and it shows up here.']
      : {
        latest: ['Nothing here yet.', 'The first post could be yours.'],
        top: ['Nothing here yet.', 'The first post could be yours.'],
        discussed: ['No conversations yet.', 'Posts with comments show up here.'],
        following: ['Nobody to show.', 'Follow people or hashtags and their posts land here.'],
        saved: ['No saved posts.', 'Tap the bookmark on any post to keep it here.']
      }[tab];

  return (
    <div className="feed-layout">
      <div className="stack feed-main">
        {tag ? (
          <PageHead
            eyebrow="Tag"
            title={`#${tag}`}
            actions={(
              <>
                <button
                  className={tagFollowed ? 'btn btn-sm' : 'btn btn-sm btn-primary'}
                  onClick={() => setFollowingTag(accountId, tag, !tagFollowed).then(() => flash(tagFollowed ? `Unfollowed #${tag}` : `Following #${tag}`)).catch((e) => setError(e.message))}
                >
                  {tagFollowed ? <><Check size={14} /> Following</> : <><Plus size={14} /> Follow tag</>}
                </button>
                <button className="btn btn-sm" onClick={() => navigateTo('/feed')}><X size={14} /> Clear tag</button>
              </>
            )}
          />
        ) : <PageHead eyebrow="From the community" title="Feed" />}

        {!tag && (
          <div className="card composer" ref={composerRef}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <Avatar profile={profile} size={38} />
              <div className="grow stack" style={{ gap: 10 }}>
                {preview ? (
                  <div className="composer-preview post-body">{text.trim() ? <RichText text={text} me={handles} /> : <span className="faint">Nothing to preview yet.</span>}</div>
                ) : (
                  <textarea
                    ref={textRef}
                    className="input composer-text"
                    rows={3}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); share(); } }}
                    placeholder={quoting ? 'Add your thoughts…' : 'Share something… try :fire:, ||spoilers||, #tags and @mentions'}
                    maxLength={MAX_CHARS}
                  />
                )}
                {quoting && (
                  <div className="quoting">
                    <span className="faint">Quoting {quoting.displayName || 'a post'}:</span>
                    <span className="truncate">{quoting.text || '(image)'}</span>
                    <button type="button" className="btn btn-ghost btn-icon" onClick={() => setQuoting(null)} aria-label="Stop quoting"><X size={14} /></button>
                  </div>
                )}
                <div className="emoji-bar" aria-label="Quick emoji">
                  {QUICK_EMOJI.map((e) => <button key={e} type="button" onClick={() => addEmoji(e)}>{e}</button>)}
                </div>
                <span className="search">
                  <ImageIcon size={15} />
                  <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (optional)" />
                </span>
                {imageUrl.trim() && (
                  <label className="row faint" style={{ gap: 6 }}>
                    <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
                    Mark image as sensitive (blurred until tapped)
                  </label>
                )}
              </div>
            </div>
            {imageUrl.trim() && <img className={sensitive ? 'post-image sensitive-img' : 'post-image'} src={imageUrl} alt="" />}
            <div style={{ marginTop: 10 }}><ErrorNote>{error}</ErrorNote></div>
            <div className="spread" style={{ marginTop: 10 }}>
              <span className="row faint" style={{ gap: 10 }}>
                <CharRing count={text.length} max={MAX_CHARS} />
                <button type="button" className={preview ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setPreview((v) => !v)}>
                  {preview ? <><Pencil size={13} /> Edit</> : <><Eye size={13} /> Preview</>}
                </button>
                <small>{text || imageUrl ? 'Draft saved · ' : ''}Ctrl+Enter to post</small>
              </span>
              <button className="btn btn-primary" onClick={share} disabled={busy}>
                <Send size={15} /> {busy ? 'Sharing…' : 'Post'}
              </button>
            </div>
          </div>
        )}

        <div className="feed-tools">
          {!tag && <div className="tabs-scroll"><Tabs value={tab} onChange={setTab} options={TABS} /></div>}
          <span className="search feed-search">
            <Search size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the feed…" aria-label="Search the feed" />
            {search && <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>}
          </span>
        </div>
        {tag && <ErrorNote>{error}</ErrorNote>}

        {waiting > 0 && (
          <button type="button" className="new-posts" onClick={showNew}>
            <ArrowUp size={14} /> {waiting} new {waiting === 1 ? 'post' : 'posts'}
          </button>
        )}

        {posts === null ? <SkeletonPosts /> : !shown.length ? (
          <Empty
            icon={search ? Search : tag ? Hash : tab === 'saved' ? Bookmark : tab === 'top' ? Flame : tab === 'discussed' ? MessagesSquare : Rss}
            title={empty[0]}
            body={empty[1]}
          />
        ) : (
          <>
            <div className="list">
              {shown.slice(0, pageSize).map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  comments={byPost.get(p.id) || []}
                  author={authors.get(p.uid)}
                  authors={authors}
                  quoted={p.quotedId ? postsById.get(p.quotedId) : null}
                  me={{ id: accountId, name: profile?.displayName }}
                  handles={handles}
                  canModerate={isOwner || can('moderateMemes')}
                  isFollowing={following.includes(p.uid)}
                  isSaved={saved.includes(p.id)}
                  isPinned={profile?.pinnedPost === p.id}
                  onQuote={quote}
                  onHide={hidePost}
                  onError={setError}
                  onNotice={flash}
                />
              ))}
            </div>
            {shown.length > pageSize && (
              <button className="btn btn-full" onClick={() => setPageSize((n) => n + PAGE)}>
                Load more ({(shown.length - pageSize).toLocaleString()} left)
              </button>
            )}
          </>
        )}
      </div>

      <aside className="feed-side">
        <div className="card">
          <h3 className="rng-heading"><TrendingUp size={15} /> Trending tags</h3>
          {trending.length ? (
            <ol className="trending">
              {trending.map(([t, score], i) => (
                <li key={t}>
                  <button type="button" className={t === tag ? 'on' : ''} onClick={() => navigateTo(`/tag/${encodeURIComponent(t)}`)}>
                    <span className="trend-rank">{i + 1}</span>
                    <span className="grow">#{t}</span>
                    {followedTags.includes(t) && <Check size={12} className="faint" />}
                    <small className="faint">{Math.round(score)}</small>
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="faint">No tags this week. Start one with #something.</p>}
        </div>
        {!!followedTags.length && (
          <div className="card">
            <h3 className="rng-heading"><Hash size={15} /> Tags you follow</h3>
            <div className="wrap">
              {followedTags.map((t) => <button key={t} type="button" className="chip" onClick={() => navigateTo(`/tag/${encodeURIComponent(t)}`)}>#{t}</button>)}
            </div>
          </div>
        )}
      </aside>

      {undo && (
        <div className="toast toast-action" role="status">
          Post hidden.
          <button type="button" className="btn btn-sm" onClick={() => { setHidden((h) => (h || []).filter((id) => id !== undo.id)); setUndo(null); }}>Undo</button>
        </div>
      )}
      {notice && !undo && <Toast>{notice}</Toast>}
    </div>
  );
}
