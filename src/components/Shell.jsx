import { useState } from 'react';
import {
  Home, Rss, Trophy, Vote, Store, Gamepad2, Globe,
  MessageCircle, User, Shield, LogOut, Search, Coins
} from 'lucide-react';
import { useSession } from '../lib/session';
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

// Bottom bar on mobile is a subset — the original only surfaced five.
const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[5], NAV[7]];

export default function Shell({ router, children }) {
  const { profile, balance, can, isOwner, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const here = (to) => (to === '/' ? router.path === '/' : router.path.startsWith(to));

  const go = (to) => { router.navigate(to); setMenuOpen(false); };

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand" onClick={() => go('/')} role="button" tabIndex={0}>
          <span className="planet" />
          <strong>Astral Memes</strong>
        </div>

        <nav>
          {NAV.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              className={here(to) ? 'nav-label active' : 'nav-label'}
              onClick={() => go(to)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
          {(isOwner || can('accessAdmin')) && (
            <button
              className={here('/admin') ? 'nav-label active' : 'nav-label'}
              onClick={() => go('/admin')}
            >
              <Shield size={18} />
              <span>Admin</span>
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">
          <button className="profile-trigger" onClick={() => go('/profile')}>
            <Avatar profile={profile} size={32} />
            <span>
              <strong>{profile?.displayName || 'Astral member'}</strong>
              <small>{isOwner ? 'Owner' : 'Astral member'}</small>
            </span>
          </button>
          <button className="text-button" onClick={signOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {menuOpen && <div className="mobile-scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMenuOpen((v) => !v)}>
            <span className="planet" />
          </button>
          <button className="search-trigger" onClick={() => go('/feed')}>
            <Search size={16} />
            <span>People, posts, hashtags, announcements…</span>
          </button>
          <div className="top-actions">
            <span className="wallet-pill" title="Astral Coins">
              <Coins size={15} />
              {(balance).toLocaleString()}
            </span>
            <button className="icon-btn" onClick={() => go('/profile')}>
              <Avatar profile={profile} size={28} />
            </button>
          </div>
        </header>

        <main className="page">{children}</main>

        <nav className="bottom-nav mobile-only">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              className={here(to) ? 'nav-bottom active' : 'nav-bottom'}
              onClick={() => go(to)}
            >
              <Icon size={18} />
              <small>{label}</small>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
