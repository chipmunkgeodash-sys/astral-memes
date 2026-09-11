import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Moon, LogOut, ExternalLink, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { auth } from '../src/firebase';
import { useSession } from '../src/lib/session';
import { useTheme } from '../src/lib/theme';
import { resolveAuthEmail, normalize } from '../src/lib/usernames';
import { Field, ErrorNote, Empty } from '../src/components/ui';
import Particles from '../src/components/Particles';
import OwnerPage from '../src/pages/OwnerPage';

const MAIN_SITE = 'https://astral-memes.web.app';

export default function AdminApp() {
  const { ready, user, profile, isOwner, signOut } = useSession();
  // Force dark: this is a control room, not the community site.
  useTheme();

  if (!ready) {
    return (
      <>
        <Particles />
        <div className="state"><div className="spinner" /><span>Connecting…</span></div>
      </>
    );
  }

  if (!user) return <><Particles density={1.4} /><AdminLogin /></>;

  // Signed in but not an Owner: nothing here for you.
  if (!isOwner) {
    return (
      <>
        <Particles />
        <div className="admin-shell">
          <AdminBar signOut={signOut} name={profile?.displayName} />
          <main className="content content-narrow">
            <Empty
              icon={ShieldCheck}
              title="Not an Owner account"
              body="This console is limited to Owners. Sign out and use the main site."
            />
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <Particles />
      <div className="admin-shell">
        <AdminBar signOut={signOut} name={profile?.displayName} />
        <main className="content">
          <OwnerPage />
        </main>
      </div>
    </>
  );
}

function AdminBar({ signOut, name }) {
  return (
    <header className="topbar admin-bar">
      <span className="brand" style={{ padding: 0 }}>
        <span className="brand-mark"><Moon size={15} /></span>
        <span className="brand-name">ASTRAL CONTROL</span>
      </span>

      <div className="row" style={{ marginLeft: 'auto' }}>
        <a className="btn btn-sm" href={MAIN_SITE} target="_blank" rel="noreferrer">
          <ExternalLink size={13} /> Main site
        </a>
        {name && <span className="chip">{name}</span>}
        <button className="btn btn-sm" onClick={signOut}><LogOut size={13} /> Sign out</button>
      </div>
    </header>
  );
}

function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const email = await resolveAuthEmail(normalize(username));
      if (!email) { setError('Your username or password is incorrect.'); return; }
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Your username or password is incorrect.');
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-login">
      <form className="card" onSubmit={submit}>
        <div className="row" style={{ marginBottom: 16 }}>
          <span className="brand-mark" style={{ width: 34, height: 34 }}><Moon size={17} /></span>
          <div>
            <span className="eyebrow" style={{ margin: 0 }}>Astral</span>
            <h1 style={{ fontSize: '1.3rem' }}>Control</h1>
          </div>
        </div>

        <p className="muted" style={{ marginBottom: 16 }}>
          Owner console. Changes here apply to the live site straight away.
        </p>

        <div className="stack" style={{ gap: 12 }}>
          <Field label="Username">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password">
            <span className="input-affix">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide' : 'Show'}>
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
