import { useState, useEffect } from 'react';
import { Save, Coins, Trophy, Rss } from 'lucide-react';
import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { SectionTitle, Field, ErrorNote } from '../components/ui';
import Avatar from '../components/Avatar';

export default function ProfilePage() {
  const { user, profile, wallet, roles, isOwner } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setBio(profile.bio || '');
    setPhotoURL(profile.photoURL || '');
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
        photoURL: photoURL.trim() || null
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const myRoles = roles.filter((r) => (profile?.roles || []).includes(r.id));

  return (
    <div className="profile-info">
      <SectionTitle eyebrow="YOUR SPACE" title="My profile" />

      <div className="profile-cover community-card">
        <Avatar profile={{ ...profile, photoURL }} size={72} />
        <div>
          <h2 className="heading">{displayName || 'Astral member'}</h2>
          {profile?.username && <small>@{profile.username}</small>}
          <p>{bio || 'A little about you…'}</p>
          <div className="badges">
            {isOwner && <span className="badge star">Owner</span>}
            {myRoles.map((r) => <span key={r.id} className="badge">{r.name}</span>)}
          </div>
        </div>
      </div>

      <div className="profile-numbers">
        <span className="wallet-pill"><Coins size={15} /> {(wallet?.coins ?? 0).toLocaleString()} coins</span>
        <span className="wallet-pill"><Trophy size={15} /> {(wallet?.banked ?? 0).toLocaleString()} banked</span>
        <span className="wallet-pill"><Rss size={15} /> {postCount} posts shared</span>
      </div>

      <div className="settings-form form-grid community-card">
        <SectionTitle eyebrow="MAKE IT YOURS" title="Edit profile" />
        <Field label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Bio" hint="A little about you…">
          <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field label="Picture URL" hint="Add a picture and introduce yourself.">
          <input value={photoURL} onChange={(e) => setPhotoURL(e.target.value)} placeholder="https://…" />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button className="primary" onClick={save} disabled={busy}>
          <Save size={15} /> {busy ? 'Saving…' : 'Save profile'}
        </button>
        {saved && <p className="toast">Your profile has been saved.</p>}
      </div>
    </div>
  );
}
