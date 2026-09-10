import { useEffect, useState } from 'react';
import { Save, Sun, Moon, Monitor, KeyRound, LogOut, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COL, LIMITS } from '../lib/schema';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { PageHead, SectionHead, Field, ErrorNote, Toast, Tabs } from '../components/ui';
import Avatar from '../components/Avatar';

export default function SettingsPage() {
  const { accountId, profile, signOut } = useSession();
  const { theme, setTheme } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [picture, setPicture] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setBio(profile.bio || '');
    setPicture(profile.picture || '');
  }, [profile?.id]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2400); };

  const saveProfile = async () => {
    if (!displayName.trim()) { setError('Add a display name.'); return; }
    setBusy(true); setError('');
    try {
      await updateDoc(doc(db, COL.accounts, accountId), {
        displayName: displayName.trim(),
        bio: bio.trim(),
        picture: picture.trim() || ''
      });
      flash('Profile saved');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="stack content-narrow">
      <PageHead eyebrow="Your account" title="Settings" />

      <div className="card">
        <SectionHead title="Profile" />
        <div className="row" style={{ gap: 14, marginBottom: 16 }}>
          <Avatar profile={{ ...profile, picture }} size={56} />
          <div className="me-text">
            <strong>{displayName || 'Astral member'}</strong>
            {profile?.username && <small>@{profile.username}</small>}
          </div>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          <Field label="Display name">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} />
          </Field>
          <Field label="Bio" hint="A little about you.">
            <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
          </Field>
          <Field label="Picture URL" hint="Leave empty to use your initials.">
            <input value={picture} onChange={(e) => setPicture(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Username" hint="Usernames can't be changed — it's how people sign in.">
            <input value={profile?.username || ''} disabled />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <div>
            <button className="btn btn-primary" onClick={saveProfile} disabled={busy}>
              <Save size={15} /> {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <SectionHead title="Appearance" />
        <p className="muted" style={{ marginBottom: 12 }}>
          System follows whatever your device is set to.
        </p>
        <Tabs
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' }
          ]}
        />
        <div className="row faint" style={{ marginTop: 10 }}>
          {theme === 'light' ? <Sun size={14} /> : theme === 'dark' ? <Moon size={14} /> : <Monitor size={14} />}
          <span>Saved on this device only.</span>
        </div>
      </div>

      <PasswordCard onDone={() => flash('Password changed')} />

      <div className="card">
        <SectionHead title="Session" />
        <p className="muted" style={{ marginBottom: 12 }}>
          Signing out only ends this session — your account and coins stay put.
        </p>
        <button className="btn" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </div>

      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

// Firebase requires a recent sign-in to change a password, so the current one
// is used to re-authenticate first. Nothing is stored — both values live only
// in this component's state until the request completes.
function PasswordCard({ onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const change = async (e) => {
    e.preventDefault();
    setError('');
    if (next.length < LIMITS.passwordMin) {
      setError('Choose a password with at least 8 characters.'); return;
    }
    if (next !== confirm) { setError('The two new passwords don’t match.'); return; }

    const user = auth.currentUser;
    if (!user?.email) { setError('You need to be signed in.'); return; }

    setBusy(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setCurrent(''); setNext(''); setConfirm('');
      onDone();
    } catch (err) {
      const code = String(err?.code || '');
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setError('That current password is incorrect.');
      } else if (code.includes('weak-password')) {
        setError('Choose a stronger password.');
      } else if (code.includes('too-many-requests')) {
        setError('Too many attempts. Try again shortly.');
      } else {
        setError(err?.message || 'Could not change the password.');
      }
    } finally { setBusy(false); }
  };

  return (
    <form className="card" onSubmit={change}>
      <SectionHead title="Password" />
      <p className="muted row" style={{ marginBottom: 12 }}>
        <ShieldAlert size={14} /> You'll need your current password to set a new one.
      </p>

      <div className="stack" style={{ gap: 12 }}>
        <Field label="Current password">
          <span className="input-affix">
            <input
              type={show ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide' : 'Show'}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <input
            type={show ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div>
          <button className="btn btn-primary" type="submit" disabled={busy || !current || !next}>
            <KeyRound size={15} /> {busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </div>
    </form>
  );
}
