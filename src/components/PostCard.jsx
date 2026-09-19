import { useRef, useState } from 'react';
import {
  Heart, Send, Trash2, MessageSquare, Bookmark, Pencil, X, Check, UserPlus, UserCheck,
  Link2, Pin, VolumeX, MoreHorizontal, Quote, Copy, EyeOff, Share, Flame, Reply, Play
} from 'lucide-react';
import {
  collection, addDoc, doc, updateDoc, serverTimestamp, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LOUNGE_THREAD } from '../lib/schema';
import { Modal, UserLink, navigateTo } from './ui';
import { deleteWithLog, postRef } from '../lib/audit';
import { REACTIONS, copyText, formatWhen, fullDate, millis, setFollowing, setMuted, setSaved } from '../lib/social';
import { play } from '../lib/sound';
import { bumpActivity } from '../lib/levels';
import { parseYouTubeUrl, youtubeThumb } from '../lib/shorts';
import Avatar from './Avatar';
import RichText from './RichText';
import Lightbox from './Lightbox';
import { AuraTitle } from './AuraName';

const LONG_POST = 420;
const URL_RE = /https?:\/\/[^\s]+/g;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;

// The first YouTube link and first image link in a post, for previews.
export function linkPreviews(text) {
  const urls = (text || '').match(URL_RE) || [];
  let youtube = null;
  let image = null;
  for (const u of urls) {
    if (!youtube) { const id = parseYouTubeUrl(u); if (id) youtube = { id, url: u }; }
    if (!image && IMAGE_RE.test(u)) image = u;
  }
  return { youtube, image };
}

export const engagement = (p, commentCount = 0) => (p.likes || []).length
  + Object.values(p.reactions || {}).reduce((n, l) => n + (l || []).length, 0)
  + commentCount;

export function YouTubePreview({ id, url }) {
  return (
    <a className="yt-preview" href={url || `https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
      <img src={youtubeThumb(id)} alt="" loading="lazy" />
      <span className="yt-play"><Play size={22} fill="currentColor" /></span>
      <span className="yt-label">YouTube</span>
    </a>
  );
}

function QuotedPost({ post, author }) {
  if (!post) return <div className="quoted quoted-missing">This post is no longer available.</div>;
  const text = (post.text || '').slice(0, 220);
  return (
    <button type="button" className="quoted" onClick={() => navigateTo(`/post/${post.id}`)}>
      <span className="row" style={{ gap: 6 }}>
        <Avatar profile={author || { id: post.uid, displayName: post.displayName }} size={20} />
        <strong>{author?.displayName || post.displayName || 'Astral member'}</strong>
        <small className="faint">{formatWhen(post.createdAt)}</small>
      </span>
      {text && <span className="quoted-text">{text}{post.text.length > 220 ? '…' : ''}</span>}
      {post.imageUrl && <img src={post.imageUrl} alt="" loading="lazy" />}
    </button>
  );
}

// One post with everything you can do to it. Used by the feed, tag pages and
// the single-post page.
export default function PostCard({
  post: p, comments, me, author, authors, handles = [], canModerate, isFollowing, isSaved, isPinned,
  quoted, onQuote, onHide, onError, onNotice = () => {}, startOpen = false
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.text || '');
  const [open, setOpen] = useState(startOpen);
  const [reply, setReply] = useState('');
  const [zoom, setZoom] = useState('');
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [likers, setLikers] = useState(false);
  const replyRef = useRef(null);

  const mine = p.uid === me.id;
  const liked = (p.likes || []).includes(me.id);
  const nameOf = (id) => authors?.get(id)?.displayName || 'Someone';
  const { youtube, image } = linkPreviews(p.text);
  const long = (p.text || '').length > LONG_POST;
  const trending = engagement(p, comments.length) >= 5 && Date.now() - millis(p.createdAt) < 86400000;

  const toggleLike = async () => {
    if (!liked) play('click');
    try {
      await updateDoc(doc(db, COL.posts, p.id), { likes: liked ? arrayRemove(me.id) : arrayUnion(me.id) });
    } catch (err) { onError(err.message); }
  };

  const react = async (r) => {
    const on = (p.reactions?.[r.id] || []).includes(me.id);
    if (!on) play('click');
    try {
      await updateDoc(doc(db, COL.posts, p.id), {
        [`reactions.${r.id}`]: on ? arrayRemove(me.id) : arrayUnion(me.id)
      });
    } catch (err) { onError(err.message); }
  };

  const saveEdit = async () => {
    try {
      await updateDoc(doc(db, COL.posts, p.id), { text: draft.trim(), editedAt: serverTimestamp() });
      setEditing(false);
    } catch (err) { onError(err.message); }
  };

  const comment = async (e) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    setReply('');
    try {
      await addDoc(collection(db, COL.comments), {
        postId: p.id,
        uid: me.id,
        displayName: me.name || 'Astral member',
        text: body.slice(0, 500),
        likes: [],
        createdAt: serverTimestamp()
      });
      bumpActivity(me.id, 'comments');
    } catch (err) { onError(err.message); setReply(body); }
  };

  const likeComment = async (c) => {
    const on = (c.likes || []).includes(me.id);
    try {
      await updateDoc(doc(db, COL.comments, c.id), { likes: on ? arrayRemove(me.id) : arrayUnion(me.id) });
    } catch (err) { onError(err.message); }
  };

  const replyTo = (c) => {
    const handle = authors?.get(c.uid)?.username || (c.displayName || '').replace(/\s+/g, '');
    setOpen(true);
    setReply(`@${handle} `);
    requestAnimationFrame(() => replyRef.current?.focus());
  };

  const closeMenu = (fn) => async () => { setMenu(false); await fn(); };

  const copyLink = closeMenu(async () => {
    const ok = await copyText(`${window.location.origin}/post/${p.id}`);
    onNotice(ok ? 'Link copied' : "Couldn't copy the link");
  });

  const copyPostText = closeMenu(async () => {
    const ok = await copyText(p.text || '');
    onNotice(ok ? 'Text copied' : "Couldn't copy");
  });

  const shareToChat = closeMenu(async () => {
    try {
      await addDoc(collection(db, COL.messages), {
        thread: LOUNGE_THREAD,
        groupId: null,
        uid: me.id,
        displayName: me.name || 'Astral member',
        text: `Shared a post from ${p.displayName || 'someone'}: ${window.location.origin}/post/${p.id}`,
        createdAt: serverTimestamp()
      });
      onNotice('Shared to Global chat');
    } catch (err) { onError(err.message); }
  });

  const pin = closeMenu(async () => {
    try {
      await updateDoc(doc(db, COL.accounts, me.id), { pinnedPost: isPinned ? '' : p.id });
      onNotice(isPinned ? 'Unpinned from your profile' : 'Pinned to your profile');
    } catch (err) { onError(err.message); }
  });

  const mute = closeMenu(async () => {
    try {
      await setMuted(me.id, p.uid, true);
      onNotice(`Muted ${p.displayName || 'that member'}. Unmute them in Settings.`);
    } catch (err) { onError(err.message); }
  });

  const onEditKey = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(); } };

  return (
    <article className={isPinned ? 'card post pinned' : 'card post'}>
      {isPinned && <span className="pinned-label"><Pin size={12} /> Pinned</span>}
      <header className="row">
        <Avatar profile={author || { id: p.uid, displayName: p.displayName }} size={34} />
        <div className="me-text grow">
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <UserLink to={p.uid}>{author?.displayName || p.displayName || 'Astral member'}</UserLink>
            <AuraTitle account={author} />
            {trending && <span className="chip chip-trending"><Flame size={11} /> Trending</span>}
          </span>
          <small>
            <button type="button" className="link-quiet" title={fullDate(p.createdAt)} onClick={() => navigateTo(`/post/${p.id}`)}>{formatWhen(p.createdAt)}</button>
            {p.editedAt ? ' · edited' : ''}
          </small>
        </div>
        {!mine && (
          <button
            className={isFollowing ? 'btn btn-sm btn-ghost' : 'btn btn-sm'}
            onClick={() => setFollowing(me.id, p.uid, !isFollowing).catch((err) => onError(err.message))}
          >
            {isFollowing ? <><UserCheck size={14} /> Following</> : <><UserPlus size={14} /> Follow</>}
          </button>
        )}
        <div className="menu-wrap">
          <button className="btn btn-ghost btn-icon" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu}>
            <MoreHorizontal size={16} />
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={copyLink}><Link2 size={14} /> Copy link</button>
              {p.text && <button onClick={copyPostText}><Copy size={14} /> Copy text</button>}
              {onQuote && <button onClick={closeMenu(() => onQuote(p))}><Quote size={14} /> Quote post</button>}
              <button onClick={shareToChat}><Share size={14} /> Share to Global chat</button>
              {mine && <button onClick={pin}><Pin size={14} /> {isPinned ? 'Unpin from profile' : 'Pin to profile'}</button>}
              {mine && !editing && <button onClick={() => { setMenu(false); setEditing(true); }}><Pencil size={14} /> Edit</button>}
              {!mine && onHide && <button onClick={closeMenu(() => onHide(p))}><EyeOff size={14} /> Hide this post</button>}
              {!mine && <button onClick={mute}><VolumeX size={14} /> Mute {p.displayName || 'member'}</button>}
              {(mine || canModerate) && (
                <button className="danger" onClick={() => { setMenu(false); deleteWithLog('post', postRef(p.id), p, me).catch((e) => onError(e.message)); }}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {editing ? (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <textarea className="input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onEditKey} maxLength={1000} />
          <div className="row">
            <button className="btn btn-sm btn-primary" onClick={saveEdit}><Check size={14} /> Save</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(false); setDraft(p.text || ''); }}><X size={14} /> Cancel</button>
            <small className="faint">Ctrl+Enter to save</small>
          </div>
        </div>
      ) : (
        p.text && (
          <>
            <p className={long && !expanded ? 'post-body clamped' : 'post-body'}><RichText text={p.text} me={handles} /></p>
            {long && (
              <button type="button" className="link-quiet show-more" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        )
      )}

      {p.quotedId && <QuotedPost post={quoted} author={quoted ? authors?.get(quoted.uid) : null} />}

      {(p.imageUrl || (!p.imageUrl && image)) && (
        <div className={p.sensitive && !showSensitive ? 'sensitive' : ''}>
          <button type="button" className="post-image-btn" onClick={() => (p.sensitive && !showSensitive ? setShowSensitive(true) : setZoom(p.imageUrl || image))} aria-label="View image">
            <img className="post-image" src={p.imageUrl || image} alt="" loading="lazy" />
          </button>
          {p.sensitive && !showSensitive && <span className="sensitive-label"><EyeOff size={14} /> Sensitive — tap to show</span>}
        </div>
      )}
      {youtube && <YouTubePreview id={youtube.id} url={youtube.url} />}

      <div className="reactions">
        {REACTIONS.map((r) => {
          const list = p.reactions?.[r.id] || [];
          const on = list.includes(me.id);
          const who = list.slice(0, 8).map(nameOf).join(', ') + (list.length > 8 ? ` and ${list.length - 8} more` : '');
          return (
            <button key={r.id} className={on ? 'reaction on' : 'reaction'} onClick={() => react(r)} title={list.length ? `${r.label}: ${who}` : r.label} aria-pressed={on}>
              <span>{r.emoji}</span>{list.length > 0 && <b>{list.length}</b>}
            </button>
          );
        })}
      </div>

      <footer className="post-foot">
        <button className={liked ? 'btn btn-ghost btn-sm is-liked' : 'btn btn-ghost btn-sm'} onClick={toggleLike} aria-label="Like">
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="link-quiet like-count" onClick={() => (p.likes || []).length && setLikers(true)} disabled={!(p.likes || []).length}>
          {(p.likes || []).length || 'Like'}
        </button>
        <button className={open ? 'btn btn-ghost btn-sm is-on' : 'btn btn-ghost btn-sm'} onClick={() => setOpen((v) => !v)}>
          <MessageSquare size={15} /> {comments.length || 'Comment'}
        </button>
        {onQuote && (
          <button className="btn btn-ghost btn-sm" onClick={() => onQuote(p)} title="Quote post"><Quote size={15} /></button>
        )}
        <button
          className={isSaved ? 'btn btn-ghost btn-sm is-on' : 'btn btn-ghost btn-sm'}
          onClick={() => setSaved(me.id, p.id, !isSaved).catch((err) => onError(err.message))}
          aria-pressed={isSaved}
          title={isSaved ? 'Saved' : 'Save'}
        >
          <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
        <span className="grow" />
        {mine && !editing && (
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
        )}
      </footer>

      {open && (
        <div className="comments">
          {comments.map((c) => {
            const cLiked = (c.likes || []).includes(me.id);
            return (
              <div key={c.id} className="comment">
                <Avatar profile={authors?.get(c.uid) || { id: c.uid, displayName: c.displayName }} size={24} />
                <div className="comment-body">
                  <span className="row" style={{ gap: 6 }}>
                    <UserLink to={c.uid}>{c.displayName || 'Astral member'}</UserLink>
                    <small className="faint" title={fullDate(c.createdAt)}>{formatWhen(c.createdAt)}</small>
                  </span>
                  <p><RichText text={c.text} me={handles} /></p>
                  <span className="comment-actions">
                    <button type="button" className={cLiked ? 'link-quiet is-liked' : 'link-quiet'} onClick={() => likeComment(c)}>
                      <Heart size={11} fill={cLiked ? 'currentColor' : 'none'} /> {(c.likes || []).length || ''}
                    </button>
                    <button type="button" className="link-quiet" onClick={() => replyTo(c)}><Reply size={11} /> Reply</button>
                  </span>
                </div>
                {(c.uid === me.id || canModerate) && (
                  <button
                    className="msg-del"
                    onClick={() => deleteWithLog('comment', doc(db, COL.comments, c.id), c, me).catch((e) => onError(e.message))}
                    aria-label="Delete comment"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
          <form className="comment-form" onSubmit={comment}>
            <input ref={replyRef} className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a comment… :fire: ||spoiler|| #tag" maxLength={500} />
            <button className="btn btn-primary btn-icon" type="submit" disabled={!reply.trim()} aria-label="Send comment">
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {likers && (
        <Modal title={`Liked by ${(p.likes || []).length}`} onClose={() => setLikers(false)}>
          <div className="stack" style={{ gap: 8 }}>
            {(p.likes || []).map((id) => (
              <div key={id} className="row">
                <Avatar profile={authors?.get(id) || { id }} size={28} />
                <UserLink to={id}>{nameOf(id)}</UserLink>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <Lightbox src={zoom} onClose={() => setZoom('')} />
    </article>
  );
}
