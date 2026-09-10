import { useState } from 'react';
import { Eye, EyeOff, Users, Gamepad2, Trophy } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COL, LIMITS } from '../lib/schema';
import { isValidUsername, isUsernameTaken, claimUsername, usernameToEmail, normalize } from '../lib/usernames';
import { ErrorNote } from '../components/ui';

const FEATURES = [
  { icon: Users, text: 'A quieter corner of the internet.' },
  { icon: Gamepad2, text: 'Play something new. Share something funny.' },
  { icon: Trophy, text: 'A little friendly competition' }
];

export default function AuthPage() {
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
        if (await isUsernameTaken(name)) {
          setError('That username is taken. Try another.');
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(name), password);
        // Create the account, wallet and username claim together so a new member
        // never lands in a half-created state.
        await Promise.all([
          setDoc(doc(db, COL.accounts, cred.user.uid), {
            username: name,
            displayName: username.trim(),
            bio: '',
            owner: false,
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
    <div className="auth-page">
      <div className="auth-art">
        <div className="star-field" />
        <span className="auth-moon" />
        <div className="auth-copy">
          <span className="eyebrow">WELCOME TO ASTRAL</span>
          <h1>Find your people, share your universe.</h1>
          <p>Jump into a game, share a laugh, or catch up with the community.</p>
          <ul className="auth-features">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text}><Icon size={16} /> {text}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-form-area">
        <div className="auth-mobile-brand">
          <span className="planet" />
          <strong>Astral Memes</strong>
        </div>

        <div className="auth-tabs">
          <button
            className={mode === 'signin' ? 'chosen' : ''}
            onClick={() => { setMode('signin'); setError(''); }}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === 'signup' ? 'chosen' : ''}
            onClick={() => { setMode('signup'); setError(''); }}
            type="button"
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <h2 className="heading">
            {mode === 'signin' ? 'Community sign in' : 'A fresh start.'}
          </h2>
          <p className="auth-note">
            {mode === 'signin'
              ? 'Sign in to pick up where you left off.'
              : 'Pick a username and a password. That’s the whole thing.'}
          </p>

          <label className="field">
            <span className="chat-label">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="zentraa"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>

          <label className="field">
            <span className="chat-label">Password</span>
            <span className="password-field">
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
                className="icon-btn"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
            {mode === 'signup' && <small className="permission-hint">At least 8 characters</small>}
          </label>

          <ErrorNote>{error}</ErrorNote>

          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-foot">Basic community access for every Astral Memes account.</p>
      </div>
    </div>
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
