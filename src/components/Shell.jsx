import { useState } from 'react';
import {
  Home, Rss, Trophy, Vote, Store, Gamepad2, MessageCircle, Hash,
  Shield, LogOut, Search, Coins, Menu, Sun, Moon, Settings, ShieldCheck, FileText, ExternalLink
} from 'lucide-react';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import Avatar from './Avatar';

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/feed', label: 'Feed', icon: Rss },
  { to: '/chat', label: 'Global chat', icon: Hash },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/challenges', label: 'Challenges', icon: Trophy },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/polls', label: 'Polls', icon: Vote },
  { to: '/store', label: 'Store', icon: Store }
];

const MOBILE_NAV = [NAV[0], NAV[2], NAV[4], NAV[5], NAV[1]];

export default function Shell({ router, children }) {
  const { profile, balance, can, isOwner, signOut } = useSession();
  const { toggle, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const active = (to) => (to === '/' ? router.path === '/' : router.path.startsWith(to));
  const go = (to) => { router.navigate(to); setOpen(false); };
  const showAdmin = isOwner || can('accessAdmin');

  return (
    <div className="app">
      <aside className={open ? 'sidebar open' : 'sidebar'}>
        <button className="brand" onClick={() => go('/')}>
          <span className="brand-mark"><Moon size={16} /></span>
          <span className="brand-name">ASTRAL</span>
        </button>

        <nav>
          {NAV.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              className="nav-item"
              aria-current={active(to) ? 'page' : undefined}
              onClick={() => go(to)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
          {showAdmin && (
            <button
              className="nav-item"
              aria-current={active('/admin') ? 'page' : undefined}
              onClick={() => go('/admin')}
            >
              <Shield size={17} />
              Admin
            </button>
          )}
          {isOwner && (
            // The Owner console is a separate site on its own origin.
            <a
              className="nav-item nav-owner"
              href="https://astral-owner.web.app"
              target="_blank"
              rel="noreferrer"
            >
              <ShieldCheck size={17} />
              Owner console
              <ExternalLink size={13} style={{ marginLeft: 'auto', opacity: .7 }} />
            </a>
          )}
        </nav>

        <div className="sidebar-foot">
          <button className="me" onClick={() => go('/profile')}>
            <Avatar profile={profile} size={30} />
            <span className="me-text">
              <strong className="truncate">{profile?.displayName || 'Astral member'}</strong>
              <small>{isOwner ? 'Owner' : 'Member'}</small>
            </span>
          </button>
          <button
            className="nav-item"
            aria-current={active('/settings') ? 'page' : undefined}
            onClick={() => go('/settings')}
          >
            <Settings size={17} /> Settings
          </button>
          <button
            className="nav-item"
            aria-current={active('/terms') ? 'page' : undefined}
            onClick={() => go('/terms')}
          >
            <FileText size={17} /> Terms
          </button>
          <button className="nav-item" onClick={signOut}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon only-mobile"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            <Menu size={18} />
          </button>

          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = search.trim();
              go(q ? `/search/${encodeURIComponent(q)}` : '/search');
            }}
          >
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people, posts, games…"
              aria-label="Search"
            />
          </form>

          <div className="row" style={{ marginLeft: 'auto' }}>
            <span className="chip chip-accent" title="Astral Coins">
              <Coins size={13} /> {balance.toLocaleString()}
            </span>
            <button
              className="btn btn-ghost btn-icon"
              onClick={toggle}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => go('/settings')} aria-label="Settings">
              <Avatar profile={profile} size={26} />
            </button>
          </div>
        </header>

        <main className="content">{children}</main>

        <nav className="tabbar">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <button key={to} aria-current={active(to) ? 'page' : undefined} onClick={() => go(to)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
