import { useEffect, useState } from 'react';
import { ArrowLeft, FileX } from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { Empty, ErrorNote, Toast, navigateTo } from '../components/ui';
import { millis, useAccount, useAccounts } from '../lib/social';
import PostCard from '../components/PostCard';
import { myHandles } from '../components/RichText';
import { SkeletonPosts } from '../components/Skeleton';

// /post/<id> — one post on its own page, the target of "Copy link".
export default function PostPage({ router }) {
  const { accountId, profile, can, isOwner } = useSession();
  const id = router.segments[1] || '';
  const [post, setPost] = useState(undefined);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const author = useAccount(post?.uid);
  const accounts = useAccounts();
  const authors = new Map((accounts || []).map((a) => [a.id, a]));
  const [quoted, setQuoted] = useState(null);

  useEffect(() => {
    if (!post?.quotedId) { setQuoted(null); return undefined; }
    return onSnapshot(doc(db, COL.posts, post.quotedId), (snap) => setQuoted(snap.exists() ? { id: snap.id, ...snap.data() } : null), () => setQuoted(null));
  }, [post?.quotedId]);

  useEffect(() => onSnapshot(
    doc(db, COL.posts, id),
    (snap) => setPost(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => { setError(err.message); setPost(null); }
  ), [id]);

  useEffect(() => onSnapshot(
    query(collection(db, COL.comments), where('postId', '==', id)),
    (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(a.createdAt) - millis(b.createdAt))),
    () => setComments([])
  ), [id]);

  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 2200); };

  return (
    <div className="stack content-narrow">
      <button className="btn btn-ghost btn-sm" onClick={() => (window.history.length > 1 ? window.history.back() : router.navigate('/feed'))} style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={15} /> Back
      </button>
      <ErrorNote>{error}</ErrorNote>
      {post === undefined ? <SkeletonPosts count={1} /> : post === null ? (
        <Empty icon={FileX} title="This post isn't here." body="It may have been deleted." />
      ) : (
        <PostCard
          post={post}
          comments={comments}
          author={author}
          authors={authors}
          quoted={quoted}
          onQuote={(target) => navigateTo(`/feed?quote=${target.id}`)}
          me={{ id: accountId, name: profile?.displayName }}
          handles={myHandles(profile)}
          canModerate={isOwner || can('moderateMemes')}
          isFollowing={(profile?.following || []).includes(post.uid)}
          isSaved={(profile?.saved || []).includes(post.id)}
          isPinned={profile?.pinnedPost === post.id}
          onError={setError}
          onNotice={flash}
          startOpen
        />
      )}
      {notice && <Toast>{notice}</Toast>}
    </div>
  );
}
