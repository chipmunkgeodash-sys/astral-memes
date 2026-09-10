import { useState } from 'react';
import {
  Eye, EyeOff, Gamepad2, Users, Trophy, Sparkles, LogIn, Pause, Play, Info
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COL, LIMITS, isOwnerUsername } from '../lib/schema';
import { isValidUsername, isUsernameTaken, claimUsername, usernameToEmail, normalize } from '../lib/usernames';
import StarField from '../components/StarField';

const FEATURES = [
  { icon: Gamepad2, text: 'Discover games' },
  { icon: Users, text: 'Find your people' },
  { icon: Trophy, text: 'Take on challenges' }
];

export default function AuthPage() {
  const [mode, setMode] = useState('signin');
  const [owner, setOwner] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [particles, setParticles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const switchMode = (next) => { setMode(next); setError(''); };

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
        if (await isUsernameTaken(name)) { setError('That username is taken. Try another.'); return; }
        const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(name), password);
        await Promise.all([
          setDoc(doc(db, COL.accounts, cred.user.uid), {
            username: name,
            displayName: username.trim(),
            bio: '',
            owner: isOwnerUsername(name),
            roles: [],
            createdAt: serverTimestamp()
          }),
          setDoc(doc(db, COL.wallets, cred.user.uid), { coins: 0, banked: 0 }),
          claimUsername(name, cred.user.uid)
        ]);
      } else {
        await signInWithEmailAndPassword(auth, usernameToEmail(name), password);
      }
    } catch (err) {
      setError(friendly(err, mode));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <StarField running={particles} />

      <div className="auth-page">
        <aside className="auth-art">
          <div className="brand">
            <span><Sparkles size={20} /></span>
            <div><span>MEMES</span></div>
          </div>

          <div className="auth-moon">
            <div className="planet" />
            <i className="ring one" />
            <i className="ring two" />
            <span className="star s1">✦</span>
            <span className="star s2">✧</span>
            <span className="star s3">✦</span>
          </div>

          <div className="auth-copy">
            <span className="eyebrow">A LITTLE SPACE FOR YOURSELF</span>
            <h1>Good games.<br />Better company.</h1>
            <p>
              Play something new. Share something funny.
              <br className="desktop" />
              Find your people in a universe of your own.
            </p>
            <div className="auth-features">
              {FEATURES.map(({ icon: Icon, text }) => (
                <span key={text}><Icon size={16} /> {text}</span>
              ))}
            </div>
          </div>

          <footer>
            <span>Astral Memes</span>
            <span>Made for connection. ✦</span>
          </footer>
        </aside>

        <section className="auth-form-area">
          <div className="auth-motion">
            <button
              className="motion-control"
              onClick={() => setParticles((v) => !v)}
              type="button"
              aria-pressed={particles}
            >
              <Sparkles size={15} />
              <span>Particles</span>
              {particles ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>

          <div className="auth-mobile-brand">
            <div className="brand">
              <span><Sparkles size={18} /></span>
              <div><span>MEMES</span></div>
            </div>
          </div>

          <div className="auth-form">
            <span className="auth-symbol"><Sparkles size={22} /></span>
            <span className="eyebrow">WELCOME TO ASTRAL</span>
            <h2>{mode === 'signin' ? 'Welcome back.' : 'A fresh start.'}</h2>
            <p>
              {mode === 'signin'
                ? 'Sign in to pick up where you left off.'
                : 'Create your account and make yourself at home.'}
            </p>

            <div className="auth-tabs">
              <button
                type="button"
                className={mode === 'signin' ? 'active' : ''}
                onClick={() => switchMode('signin')}
              >
                Sign in
              </button>
              <button
                type="button"
                className={mode === 'signup' ? 'active' : ''}
                onClick={() => switchMode('signup')}
              >
                Create account
              </button>
            </div>

            <form onSubmit={submit}>
              <label>
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </label>

              <div className="field">
                <label>Password</label>
                <div className="password-field">
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p className="form-error">{error}</p>}

              <button className="primary full" type="submit" disabled={busy}>
                <LogIn size={16} />
                {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="auth-switch">
              {owner ? 'Back to the community? ' : 'Managing the community? '}
              <button type="button" onClick={() => setOwner((v) => !v)}>
                {owner ? 'Community sign in' : 'Owner sign in'}
              </button>
            </p>

            <div className="auth-note">
              <Info size={15} />
              <span>Your space. Your community. Welcome to Astral.</span>
            </div>
          </div>

          <div className="auth-foot">A quieter corner of the internet.</div>
        </section>
      </div>
    </>
  );
}

function friendly(err, mode) {
  const code = String(err?.code || '');
  if (code.includes('user-not-found')) return 'Account not found. Check the username, or create an account.';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) {
    return mode === 'signin' ? 'That username and password don’t match.' : 'Could not sign you in.';
  }
  if (code.includes('email-already-in-use')) return 'That username is taken. Try another.';
  if (code.includes('weak-password')) return 'Choose a stronger password with at least 8 characters.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
  if (code.includes('network')) return 'Network problem. Check your connection and try again.';
  return err?.message || 'Something went wrong. Try again.';
}
