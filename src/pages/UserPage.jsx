import { useEffect, useState } from 'react';
import { Coins, Rss, MessageCircle, ArrowLeft, Heart, UserX } from 'lucide-react';
import {
  doc, getDoc, collection, query, where, onSnapshot, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { Empty, Loader, ErrorNote } from '../components/ui';
import Avatar from '../components/Avatar';

// /u/<username> — a member's public profile.
export default function UserPage({ router }) {
  const { user, roles } = useSession();
  const handle = decodeURIComponent(router.segments[1] || '').toLowerCase();

  const [profile, setProfile] = useState(undefined); // undefined = loading, null = not found
  const [wallet, setWallet] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setProfile(undefined);
    (async () => {
      try {
        // The segment is normally a username, but posts and leaderboards link
        // by uid, so fall back to treating it as one.
        const raw = router.segments[1] || '';
        const nameSnap = await getDoc(doc(db, COL.usernames, handle));
        const uid = nameSnap.exists() ? nameSnap.data()?.uid : raw;
        if (!uid) { if (alive) setProfile(null); return; }

        const accSnap = await getDoc(doc(db, COL.accounts, uid));
        if (!alive) return;
        setProfile(accSnap.exists() ? { id: accSnap.id, ...accSnap.data() } : null);

        const walletSnap = await getDoc(doc(db, COL.wallets, uid));
        if (alive && walletSnap.exists()) setWallet(walletSnap.data());
      } catch (err) {
        if (alive) { setError(err.message); setProfile(null); }
      }
    })();
    return () => { alive = false; };
  }, [handle]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    return onSnapshot(
      query(collection(db, COL.posts), where('uid', '==', profile.id), limit(50)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
        setPosts(rows);
      },
      () => setPosts([])
    );
  }, [profile?.id]);

  if (profile === undefined) return <Loader label="Loading profile…" />;

  if (profile === null) {
    return (
      <div className="stack">
        <button className="btn btn-ghost btn-sm" onClick={() => router.navigate('/feed')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <ErrorNote>{error}</ErrorNote>
        <Empty icon={UserX} title="No such member" body={`Nobody here goes by “${handle}”.`} />
      </div>
    );
  }

  const isMe = profile.id === user?.uid;
  const myRoles = roles.filter((r) => (profile.roleIds || []).includes(r.id));
  const isOwner = (profile.roleIds || []).includes('owner');

  return (
    <div className="stack content-narrow">
      <button className="btn btn-ghost btn-sm" onClick={() => window.history.back()} style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div className="card">
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <Avatar profile={profile} size={64} />
          <div className="grow">
            <h1 style={{ fontSize: '1.45rem' }}>{profile.displayName || 'Astral member'}</h1>
            {profile.username && <p className="faint">@{profile.username}</p>}
            <p className="muted" style={{ marginTop: 6 }}>{profile.bio || 'No bio yet.'}</p>
            <div className="wrap" style={{ marginTop: 10 }}>
              {isOwner && <span className="chip chip-accent">Owner</span>}
              {myRoles.filter((r) => r.id !== 'owner').map((r) => (
                <span key={r.id} className="chip">
                  <span className="dot" style={{ background: r.color || 'currentColor' }} />
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="wrap" style={{ marginTop: 16 }}>
          {wallet && <span className="chip"><Coins size={13} /> {(wallet.balance ?? 0).toLocaleString()}</span>}
          <span className="chip"><Rss size={13} /> {posts.length} {posts.length === 1 ? 'post' : 'posts'}</span>
          {isMe ? (
            <button className="btn btn-sm" onClick={() => router.navigate('/profile')}>Edit profile</button>
          ) : (
            <button className="btn btn-sm" onClick={() => router.navigate('/messages')}>
              <MessageCircle size={14} /> Message
            </button>
          )}
        </div>
      </div>

      <section>
        <h2 style={{ marginBottom: 12 }}>Posts</h2>
        {!posts.length ? (
          <Empty icon={Rss} title="No posts yet." />
        ) : (
          <div className="list">
            {posts.map((p) => (
              <article key={p.id} className="card">
                {p.text && <p className="post-body" style={{ marginTop: 0 }}>{p.text}</p>}
                {p.imageUrl && <img className="post-image" src={p.imageUrl} alt="" loading="lazy" />}
                <div className="row faint" style={{ marginTop: 8 }}>
                  <Heart size={13} /> {(p.likes || []).length}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ms(ts) {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}
