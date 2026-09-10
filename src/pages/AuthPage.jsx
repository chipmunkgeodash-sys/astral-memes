import { useState } from 'react';
import { Eye, EyeOff, Gamepad2, Users, Trophy, Sparkles, Sun, Moon } from 'lucide-react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COL, LIMITS, MEMBER_ROLE_ID } from '../lib/schema';
import { isValidUsername, isUsernameTaken, resolveAuthEmail, mintAuthEmail, normalize } from '../lib/usernames';
import { useTheme } from '../lib/theme';
import { Field, ErrorNote, Tabs } from '../components/ui';

const POINTS = [
  { icon: Gamepad2, text: '1,578 games, ready to play' },
  { icon: Users, text: 'A feed and DMs for your people' },
  { icon: Trophy, text: 'Challenges, polls and rewards' }
];

export default function AuthPage() {
  const { toggle, isDark } = useTheme();
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const name = normalize(username);

    if (!isValidUsername(name)) {
      setError('Usernames are 3–20 characters: letters, numbers, dot, dash or underscore.');
      return;
    }
    if (mode === 'signup' && password.length < LIMITS.passwordMin) {
      setError('Choose a password with at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        if (await isUsernameTaken(name)) { setError('That username is already taken.'); return; }
        const authEmail = mintAuthEmail();
        const cred = await createUserWithEmailAndPassword(auth, authEmail, password);
        await Promise.all([
          setDoc(doc(db, COL.usernames, name), { uid: cred.user.uid, authEmail, createdAt: serverTimestamp() }),
          setDoc(doc(db, COL.accounts, cred.user.uid), {
            username: username.trim(),
            usernameLower: name,
            displayName: username.trim(),
            bio: '',
            picture: '',
            roleIds: [MEMBER_ROLE_ID],
            permissions: [],
            createdAt: serverTimestamp()
          }),
          setDoc(doc(db, COL.wallets, cred.user.uid), {
            balance: 0, lastSettledEntryId: '', lastRedemptionId: '', updatedAt: serverTimestamp()
          })
        ]);
      } else {
        const authEmail = await resolveAuthEmail(name);
        if (!authEmail) { setError('Your username or password is incorrect.'); return; }
        await signInWithEmailAndPassword(auth, authEmail, password);
      }
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <aside className="auth-side">
        <span className="auth-orb a" />
        <span className="auth-orb b" />

        <div className="row" style={{ position: 'relative', fontWeight: 700, gap: 9 }}>
          <span className="brand-mark" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>
            <Sparkles size={16} />
          </span>
          Astral Memes
        </div>

        <div>
          <h1>Good games. Better company.</h1>
          <p>A quieter corner of the internet — play something new, share something funny, find your people.</p>
          <div className="auth-points">
            {POINTS.map(({ icon: Icon, text }) => (
              <span key={text}><Icon size={16} /> {text}</span>
            ))}
          </div>
        </div>

        <p className="auth-foot">Made for connection.</p>
      </aside>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="spread">
            <span className="eyebrow" style={{ margin: 0 }}>Welcome to Astral</span>
            <button
              className="btn btn-ghost btn-icon"
              onClick={toggle}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              type="button"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div>
            <h1 style={{ fontSize: '1.6rem' }}>
              {mode === 'signin' ? 'Welcome back.' : 'Make yourself at home.'}
            </h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {mode === 'signin'
                ? 'Sign in to pick up where you left off.'
                : 'Pick a username and a password. That’s it.'}
            </p>
          </div>

          <Tabs
            value={mode}
            onChange={(v) => { setMode(v); setError(''); }}
            options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]}
          />

          <form onSubmit={submit}>
            <Field label="Username">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="zentraa"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </Field>

            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
              <span className="input-affix">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </Field>

            <ErrorNote>{error}</ErrorNote>

            <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}

function friendly(err) {
  const code = String(err?.code || '');
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
    return 'Your username or password is incorrect.';
  }
  if (code.includes('email-already-in-use')) return 'That username is already taken.';
  if (code.includes('weak-password')) return 'Choose a stronger password with at least 8 characters.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
  if (code.includes('network')) return 'Network problem. Check your connection and try again.';
  return err?.message || 'Something went wrong. Try again.';
}
