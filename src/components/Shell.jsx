import { useState } from 'react';
import {
  Home, Rss, Trophy, Vote, Store, Gamepad2, Globe, MessageCircle,
  Shield, LogOut, Search, Coins, Menu, Sun, Moon, Sparkles
} from 'lucide-react';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import Avatar from './Avatar';

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/feed', label: 'Feed', icon: Rss },
  { to: '/challenges', label: 'Challenges', icon: Trophy },
  { to: '/polls', label: 'Polls', icon: Vote },
  { to: '/store', label: 'Store', icon: Store },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/browser', label: 'Browser', icon: Globe },
  { to: '/messages', label: 'Messages', icon: MessageCircle }
];

const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[5], NAV[7]];

export default function Shell({ router, children }) {
  const { profile, balance, can, isOwner, signOut } = useSession();
  const { toggle, isDark } = useTheme();
  const [open, setOpen] = useState(false);

  const active = (to) => (to === '/' ? router.path === '/' : router.path.startsWith(to));
  const go = (to) => { router.navigate(to); setOpen(false); };
  const showAdmin = isOwner || can('accessAdmin');

  return (
    <div className="app">
      <aside className={open ? 'sidebar open' : 'sidebar'}>
        <button className="brand" onClick={() => go('/')}>
          <span className="brand-mark"><Sparkles size={16} /></span>
          Astral
        </button>

        <nav>
          {NAV.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              className="nav-item"
              aria-current={active(to) ? 'page' : undefined}
              onClick={() => go(to)}
              style={{ width: '100%' }}
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
              style={{ width: '100%' }}
            >
              <Shield size={17} />
              Admin
            </button>
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
          <button className="nav-item" onClick={signOut} style={{ width: '100%' }}>
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

          <label className="search">
            <Search size={15} />
            <input placeholder="Search people, posts, announcements…" />
          </label>

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
            <button className="btn btn-ghost btn-icon" onClick={() => go('/profile')} aria-label="Profile">
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
