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
import { ACCENTS, readAccent, saveAccent } from '../lib/accent';
import { play, setSoundOn, soundOn } from '../lib/sound';
import { readDisplay, saveDisplay } from '../lib/display';
import { setMuted, useAccounts } from '../lib/social';
import { BlockedCard, DataCard, EffectsCard, LookCard, MutedWordsCard, NotificationsCard } from '../components/SettingsExtras';

// Everyone you've muted, with a way back.
function MutedCard() {
  const { accountId, profile } = useSession();
  const accounts = useAccounts();
  const muted = (profile?.muted || []).map((id) => (accounts || []).find((a) => a.id === id) || { id, displayName: 'Unknown member' });
  return (
    <div className="card">
      <SectionHead title="Muted members" />
      {!muted.length ? (
        <p className="muted">Nobody muted. Mute someone from a post's menu or their profile to hide their posts and shorts.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {muted.map((a) => (
            <div key={a.id} className="spread">
              <span className="row"><Avatar profile={a} size={28} /> {a.displayName || 'Astral member'}</span>
              <button className="btn btn-sm" onClick={() => setMuted(accountId, a.id, false)}>Unmute</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { accountId, profile, signOut } = useSession();
  const { theme, setTheme } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [picture, setPicture] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [accent, setAccent] = useState(readAccent);
  const [sound, setSound] = useState(soundOn);
  const [display, setDisplay] = useState(readDisplay);
  const updateDisplay = (patch) => { const next = { ...readDisplay(), ...patch }; setDisplay(next); saveDisplay(next); };
  useEffect(() => {
    const sync = () => setDisplay(readDisplay());
    window.addEventListener('astral-display', sync);
    return () => window.removeEventListener('astral-display', sync);
  }, []);

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

        <div className="field" style={{ marginTop: 18 }}>
          <span>Accent colour</span>
          <div className="swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={(accent || '') === (a.color || '') ? 'swatch on' : 'swatch'}
                style={{ background: a.color || 'linear-gradient(135deg, #5b5bd6, #8b8bf0)' }}
                onClick={() => { setAccent(a.color || ''); saveAccent(a.color || ''); }}
                aria-label={a.label}
                title={a.label}
                aria-pressed={(accent || '') === (a.color || '')}
              />
            ))}
            <label className="swatch swatch-custom" title="Custom colour">
              <input
                type="color"
                value={accent || '#5b5bd6'}
                onChange={(e) => { setAccent(e.target.value); saveAccent(e.target.value); }}
                aria-label="Custom accent colour"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <SectionHead title="Display" />
        <div className="stack" style={{ gap: 14 }}>
          <div className="toggle-row">
            <span><strong>Density</strong><span className="muted"> — compact fits more on screen.</span></span>
            <Tabs value={display.density} onChange={(v) => updateDisplay({ density: v })} options={[{ value: 'comfy', label: 'Comfy' }, { value: 'compact', label: 'Compact' }]} />
          </div>
          <div className="toggle-row">
            <span><strong>Text size</strong></span>
            <Tabs value={display.text} onChange={(v) => updateDisplay({ text: v })} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Large' }]} />
          </div>
          <div className="toggle-row">
            <span><strong>Reduce motion</strong><span className="muted"> — turns off animations and effects.</span></span>
            <button
              type="button"
              className={display.motion === 'reduced' ? 'switch on' : 'switch'}
              role="switch"
              aria-checked={display.motion === 'reduced'}
              onClick={() => updateDisplay({ motion: display.motion === 'reduced' ? 'full' : 'reduced' })}
            >
              <span />
            </button>
          </div>
          <div className="field">
            <span>Background</span>
            <div className="bg-options">
              {[
                { value: 'stars', label: 'Starfield' },
                { value: 'aurora', label: 'Aurora' },
                { value: 'grid', label: 'Grid' },
                { value: 'plain', label: 'Plain' }
              ].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={display.bg === o.value ? `bg-option bg-preview-${o.value} on` : `bg-option bg-preview-${o.value}`}
                  onClick={() => updateDisplay({ bg: o.value })}
                  aria-pressed={display.bg === o.value}
                >
                  <span className="bg-swatch" />
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <LookCard display={display} updateDisplay={updateDisplay} />
      <EffectsCard />
      <NotificationsCard />
      <MutedCard />
      <BlockedCard />
      <MutedWordsCard />

      <div className="card">
        <SectionHead title="Sound" />
        <div className="toggle-row">
          <span>
            <strong>Sound effects</strong>
            <span className="muted"> — rolls, wins, likes and reveals.</span>
          </span>
          <button
            type="button"
            className={sound ? 'switch on' : 'switch'}
            role="switch"
            aria-checked={sound}
            onClick={() => { const next = !sound; setSound(next); setSoundOn(next); if (next) play('good'); }}
          >
            <span />
          </button>
        </div>
      </div>

      <PasswordCard onDone={() => flash('Password changed')} />
      <DataCard />

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
