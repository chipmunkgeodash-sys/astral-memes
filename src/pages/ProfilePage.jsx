import { useState, useEffect } from 'react';
import { Save, Coins, Rss } from 'lucide-react';
import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, SectionHead, Field, ErrorNote, Toast } from '../components/ui';
import Avatar from '../components/Avatar';

export default function ProfilePage() {
  const { user, profile, balance, roles, isOwner } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [picture, setPicture] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setBio(profile.bio || '');
    setPicture(profile.picture || '');
  }, [profile?.id]);

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      query(collection(db, COL.posts), where('uid', '==', user.uid)),
      (snap) => setPostCount(snap.size),
      () => setPostCount(0)
    );
  }, [user?.uid]);

  const save = async () => {
    if (!displayName.trim()) { setError('Add a display name.'); return; }
    setBusy(true); setError(''); setSaved(false);
    try {
      await updateDoc(doc(db, COL.accounts, user.uid), {
        displayName: displayName.trim(),
        bio: bio.trim(),
        picture: picture.trim() || ''
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const myRoles = roles.filter((r) => (profile?.roleIds || []).includes(r.id));

  return (
    <div className="stack content-narrow">
      <PageHead eyebrow="Your space" title="Profile" />

      <div className="card">
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <Avatar profile={{ ...profile, picture }} size={64} />
          <div className="grow">
            <h2>{displayName || 'Astral member'}</h2>
            {profile?.username && <p className="faint">@{profile.username}</p>}
            <p className="muted" style={{ marginTop: 6 }}>{bio || 'No bio yet.'}</p>
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
          <span className="chip"><Coins size={13} /> {balance.toLocaleString()} coins</span>
          <span className="chip"><Rss size={13} /> {postCount} {postCount === 1 ? 'post' : 'posts'}</span>
        </div>
      </div>

      <div className="card">
        <SectionHead title="Edit profile" />
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Display name">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Bio" hint="A little about you.">
            <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          </Field>
          <Field label="Picture URL">
            <input value={picture} onChange={(e) => setPicture(e.target.value)} placeholder="https://…" />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <div>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              <Save size={15} /> {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {saved && <Toast>Profile saved</Toast>}
    </div>
  );
}
