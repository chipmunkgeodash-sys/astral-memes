import { useEffect, useMemo, useState } from 'react';
import {
  Home, Rss, Vote, Store, Gamepad2, MessageCircle, Hash,
  Shield, LogOut, Search, Coins, Menu, Sun, Moon, Settings, ShieldCheck, FileText, ExternalLink, Dices, Sparkles,
  Users, Trophy, Award, Megaphone, User, Flame, Clapperboard, Bell, ArrowUp, WifiOff, Keyboard,
  PanelLeftClose, PanelLeftOpen, Maximize, Minimize, PenSquare, Bike, Bot
} from 'lucide-react';
import SiteEffects from './SiteEffects';
import { QuickPostCard } from './HomeExtras';
import { patchDisplay, readDisplay } from '../lib/display';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { usePresence, currentStreak, isOnline, useAccounts, useOnline, followersOf } from '../lib/social';
import { useNotifications } from '../lib/notifications';
import { levelFor, xpFor } from '../lib/levels';
import { hasUnseenRelease } from '../pages/WhatsNewPage';
import Avatar from './Avatar';
import CommandPalette from './CommandPalette';
import { Modal } from './ui';

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Home', icon: Home, key: 'h' },
      { to: '/notifications', label: 'Notifications', icon: Bell, key: 'n', keywords: 'alerts likes mentions' },
      { to: '/whats-new', label: "What's new", icon: Megaphone, keywords: 'updates changelog news' }
    ]
  },
  {
    label: 'Social',
    items: [
      { to: '/feed', label: 'Feed', icon: Rss, key: 'f', keywords: 'posts memes' },
      { to: '/shorts', label: 'Shorts', icon: Clapperboard, key: 's', keywords: 'reels youtube videos' },
      { to: '/chat', label: 'Global chat', icon: Hash, key: 'c', keywords: 'lounge groups' },
      { to: '/messages', label: 'Messages', icon: MessageCircle, key: 'm', keywords: 'dm direct' },
      { to: '/members', label: 'Members', icon: Users, key: 'u', keywords: 'people users online follow' }
    ]
  },
  {
    label: 'Play',
    items: [
      { to: '/studio', label: 'Studio', icon: PenSquare, keywords: 'create meme editor photo notes timer music tools design' },
      { to: '/assistant', label: 'Astral Guide', icon: Bot, keywords: 'ai chatbot assistant help plan ideas local private' },
      { to: '/hush-moto', label: 'Hush Moto', icon: Bike, keywords: 'motorcycle multiplayer host join server ride' },
      { to: '/casino', label: 'Casino', icon: Dices, key: 'k', keywords: 'slots blackjack roulette crash plinko keno wheel bet' },
      { to: '/rng', label: 'RNG Roll', icon: Sparkles, key: 'r', keywords: 'aura roll luck potion' },
      { to: '/games', label: 'Games', icon: Gamepad2, key: 'g', keywords: 'library play' }
    ]
  },
  {
    label: 'Community',
    items: [
      { to: '/leaderboard', label: 'Leaderboards', icon: Trophy, key: 'l', keywords: 'rank top richest' },
      { to: '/achievements', label: 'Achievements', icon: Award, key: 'a', keywords: 'badges' },
      { to: '/polls', label: 'Polls', icon: Vote, key: 'p', keywords: 'vote' },
      { to: '/store', label: 'Store', icon: Store, keywords: 'shop rewards' }
    ]
  }
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
const byPath = (to) => ALL_NAV.find((n) => n.to === to);
const MOBILE_NAV = ['/', '/feed', '/shorts', '/casino', '/rng'].map(byPath);

const PALETTE_EXTRAS = [
  { to: '/profile', label: 'Profile', icon: User, keywords: 'me edit status banner links' },
  { to: '/settings', label: 'Settings', icon: Settings, keywords: 'theme accent sound password display muted' },
  { to: '/terms', label: 'Terms', icon: FileText },
  { to: '/search', label: 'Search', icon: Search }
];

const SHORTCUTS = [
  ...ALL_NAV.filter((n) => n.key).map((n) => ({ keys: ['g', n.key], label: `Go to ${n.label}` })),
  { keys: ['g', 'o'], label: 'Go to your profile' },
  { keys: ['Ctrl', 'K'], label: 'Command palette' },
  { keys: ['/'], label: 'Focus search' },
  { keys: ['?'], label: 'Show this help' },
  { keys: ['Shift', 'F'], label: 'Focus mode' },
  { keys: ['Shift', 'P'], label: 'Quick post' },
  { keys: ['↑', '↓'], label: 'Next / previous short (in Shorts)' }
];

export default function Shell({ router, children }) {
  const { accountId, profile, balance, can, isOwner, signOut } = useSession();
  const { toggle, isDark } = useTheme();
  const accounts = useAccounts();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [unseen, setUnseen] = useState(hasUnseenRelease);
  const [help, setHelp] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [compose, setCompose] = useState(false);
  const [display, setDisplayState] = useState(readDisplay);
  useEffect(() => {
    const sync = () => setDisplayState(readDisplay());
    window.addEventListener('astral-display', sync);
    return () => window.removeEventListener('astral-display', sync);
  }, []);
  const iconsOnly = display.sidebar === 'icons';
  const focus = display.focus === 'on';
  const online = useOnline();
  const notifications = useNotifications(accountId, profile);
  const { unread } = notifications;

  usePresence(accountId, profile);

  useEffect(() => {
    const onSeen = () => setUnseen(hasUnseenRelease());
    window.addEventListener('astral-whats-new-seen', onSeen);
    return () => window.removeEventListener('astral-whats-new-seen', onSeen);
  }, []);


  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 700);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // "g" then a letter jumps to a page; "?" shows the list; "/" focuses search.
  useEffect(() => {
    let pending = false;
    let timer = null;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (pending) {
        pending = false;
        clearTimeout(timer);
        if (e.key === 'o') { e.preventDefault(); router.navigate('/profile'); return; }
        const hit = ALL_NAV.find((n) => n.key === e.key.toLowerCase());
        if (hit) { e.preventDefault(); router.navigate(hit.to); }
        return;
      }
      if (e.key === 'g') { pending = true; timer = setTimeout(() => { pending = false; }, 1200); return; }
      if (e.key === '?') { e.preventDefault(); setHelp(true); return; }
      if (e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); patchDisplay({ focus: readDisplay().focus === 'on' ? 'off' : 'on' }); return; }
      if (e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setCompose(true); return; }
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector('.topbar .search input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer); };
  }, [router]);

  const active = (to) => (to === '/' ? router.path === '/' : router.path.startsWith(to));
  const go = (to) => { router.navigate(to); setOpen(false); };
  const showAdmin = isOwner || can('accessAdmin');
  const streak = currentStreak(profile);
  const section = router.segments[0] || 'home';
  const fullBleed = section === 'shorts';

  const onlineNow = useMemo(
    () => (accounts || []).filter((a) => isOnline(a) && a.id !== accountId).slice(0, 8),
    [accounts, accountId]
  );
  const onlineCount = (accounts || []).filter(isOnline).length;
  const myLevel = levelFor(xpFor(profile, followersOf(accounts, accountId).length));

  const paletteItems = [
    ...ALL_NAV,
    ...PALETTE_EXTRAS,
    ...(showAdmin ? [{ to: '/admin', label: 'Admin', icon: Shield }] : [])
  ];

  return (
    <div className={['app', fullBleed ? 'app-full' : '', iconsOnly ? 'app-icons' : '', focus ? 'app-focus' : ''].filter(Boolean).join(' ')}>
      <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
      <SiteEffects router={router} notifications={notifications} />
      <aside className={open ? 'sidebar open' : 'sidebar'}>
        <button className="brand" onClick={() => go('/')}>
          <span className="brand-mark"><Moon size={16} /></span>
          <span className="brand-name">ASTRAL</span>
        </button>

        <nav>
          {NAV_GROUPS.map((group) => (
            <div key={group.label || 'top'} className="nav-group">
              {group.label && <span className="nav-label">{group.label}</span>}
              {group.items.map(({ to, label, icon: Icon }) => (
                <button
                  key={to}
                  className="nav-item"
                  aria-current={active(to) ? 'page' : undefined}
                  onClick={() => go(to)}
                  title={iconsOnly ? label : undefined}
                >
                  <Icon size={17} />
                  {label}
                  {to === '/whats-new' && unseen && <span className="nav-new">NEW</span>}
                  {to === '/notifications' && unread > 0 && <span className="nav-count">{unread > 99 ? '99+' : unread}</span>}
                </button>
              ))}
            </div>
          ))}
          {(showAdmin || isOwner) && (
            <div className="nav-group">
              <span className="nav-label">Staff</span>
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
            </div>
          )}

          {!!onlineNow.length && (
            <div className="nav-group online-strip">
              <span className="nav-label">Online now · {onlineCount}</span>
              <div className="online-avatars">
                {onlineNow.map((a) => (
                  <button key={a.id} className="online-face" onClick={() => go(`/u/${encodeURIComponent(a.username || a.id)}`)} title={a.displayName || 'Astral member'}>
                    <Avatar profile={a} size={28} online />
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="sidebar-foot">
          <button className="me" onClick={() => go('/profile')}>
            <Avatar profile={profile} size={30} online />
            <span className="me-text">
              <strong className="truncate">{profile?.displayName || 'Astral member'}</strong>
              <small className="truncate">Lv {myLevel.level} · {profile?.status || (isOwner ? 'Owner' : 'Member')}</small>
              <span className="me-xp"><i style={{ width: `${myLevel.progress * 100}%` }} /></span>
            </span>
          </button>
          <button
            className="nav-item"
            aria-current={active('/settings') ? 'page' : undefined}
            onClick={() => go('/settings')}
          >
            <Settings size={17} /> Settings
          </button>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <Keyboard size={17} /> Shortcuts
          </button>
          <button className="nav-item only-desktop" onClick={() => patchDisplay({ sidebar: iconsOnly ? 'full' : 'icons' })} title={iconsOnly ? 'Expand sidebar' : 'Collapse sidebar'}>
            {iconsOnly ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />} {iconsOnly ? 'Expand' : 'Collapse'}
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
        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={14} /> You're offline. Changes will sync when you reconnect.
          </div>
        )}
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
            <button
              type="button"
              className="kbd-hint"
              onClick={() => window.dispatchEvent(new Event('astral-open-palette'))}
              title="Command palette"
            >
              Ctrl K
            </button>
          </form>

          <div className="row" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-primary btn-sm topbar-post" onClick={() => setCompose(true)} title="Quick post (Shift+P)">
              <PenSquare size={14} /> <span>Post</span>
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => patchDisplay({ focus: focus ? 'off' : 'on' })} aria-label={focus ? 'Leave focus mode' : 'Focus mode'} title={focus ? 'Leave focus mode (Shift+F)' : 'Focus mode (Shift+F)'}>
              {focus ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
            {streak > 0 && (
              <span className="chip streak-chip" title={`${streak}-day streak`}>
                <Flame size={13} /> {streak}
              </span>
            )}
            <span className="chip chip-accent" title="Astral Coins">
              <Coins size={13} /> {balance.toLocaleString()}
            </span>
            <button className="btn btn-ghost btn-icon bell" onClick={() => go('/notifications')} aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
              <Bell size={17} />
              {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
            </button>
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

        <main id="main-content" tabIndex={-1} className={fullBleed ? 'content content-full' : 'content'} key={section}>{children}</main>

        <nav className="tabbar">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <button key={to} aria-current={active(to) ? 'page' : undefined} onClick={() => go(to)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {showTop && !fullBleed && (
        <button className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">
          <ArrowUp size={18} />
        </button>
      )}

      {help && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <ul className="shortcut-list">
            {SHORTCUTS.map((s) => (
              <li key={s.label}>
                <span>{s.label}</span>
                <span className="shortcut-keys">{s.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      <CommandPalette items={paletteItems} onGo={go} />

      {compose && (
        <Modal title="Quick post" onClose={() => setCompose(false)}>
          <QuickPostCard />
          <p className="faint">For images, quotes and previews, use the full composer in the <button type="button" className="link-quiet" style={{ textDecoration: 'underline' }} onClick={() => { setCompose(false); go('/feed'); }}>Feed</button>.</p>
        </Modal>
      )}
    </div>
  );
}
