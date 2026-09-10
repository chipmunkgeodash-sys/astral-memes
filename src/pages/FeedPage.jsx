import { useEffect, useState } from 'react';
import { Heart, Image as ImageIcon, Send, Trash2, Rss } from 'lucide-react';
import {
  collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc,
  updateDoc, serverTimestamp, arrayUnion, arrayRemove, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, Loader, ErrorNote, Field } from '../components/ui';
import Avatar from '../components/Avatar';

export default function FeedPage() {
  const { user, profile, can, isOwner } = useSession();
  const [posts, setPosts] = useState(null);
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => onSnapshot(
    query(collection(db, COL.posts), orderBy('createdAt', 'desc'), limit(100)),
    (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setPosts([]); }
  ), []);

  const share = async () => {
    if (!text.trim() && !imageUrl.trim()) { setError('Add a caption or image first.'); return; }
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, COL.posts), {
        uid: user.uid,
        displayName: profile?.displayName || 'Astral member',
        text: text.trim(),
        imageUrl: imageUrl.trim() || null,
        likes: [],
        createdAt: serverTimestamp()
      });
      setText(''); setImageUrl('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const toggleLike = async (post) => {
    const liked = (post.likes || []).includes(user.uid);
    try {
      await updateDoc(doc(db, COL.posts, post.id), {
        likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
    } catch (err) { setError(err.message); }
  };

  if (posts === null) return <Loader label="Loading the feed…" />;

  return (
    <div className="stack content-narrow">
      <PageHead eyebrow="From the community" title="Feed" />

      <div className="card">
        <Field label="Share something">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Play something new. Share something funny."
          />
        </Field>
        <div style={{ marginTop: 12 }}>
          <Field label="Image URL (optional)">
            <span className="search">
              <ImageIcon size={15} />
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
            </span>
          </Field>
        </div>
        {imageUrl.trim() && <img className="post-image" src={imageUrl} alt="" />}
        <div style={{ marginTop: 12 }}><ErrorNote>{error}</ErrorNote></div>
        <div className="spread" style={{ marginTop: 12 }}>
          <span className="faint">{text.length} characters</span>
          <button className="btn btn-primary" onClick={share} disabled={busy}>
            <Send size={15} /> {busy ? 'Sharing…' : 'Post'}
          </button>
        </div>
      </div>

      {!posts.length ? (
        <Empty icon={Rss} title="Nothing here yet." body="The first post could be yours." />
      ) : (
        <div className="list">
          {posts.map((p) => {
            const liked = (p.likes || []).includes(user.uid);
            const canDelete = p.uid === user.uid || isOwner || can('moderateMemes');
            return (
              <article key={p.id} className="card">
                <header className="row">
                  <Avatar profile={{ id: p.uid, displayName: p.displayName }} size={32} />
                  <strong>{p.displayName || 'Astral member'}</strong>
                  <span className="faint">{formatWhen(p.createdAt)}</span>
                </header>
                {p.text && <p className="post-body">{p.text}</p>}
                {p.imageUrl && <img className="post-image" src={p.imageUrl} alt="" loading="lazy" />}
                <footer className="post-foot">
                  <button
                    className={liked ? 'btn btn-ghost btn-sm is-liked' : 'btn btn-ghost btn-sm'}
                    onClick={() => toggleLike(p)}
                  >
                    <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
                    {(p.likes || []).length || 'Like'}
                  </button>
                  {canDelete && (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc(db, COL.posts, p.id))}>
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatWhen(ts) {
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
