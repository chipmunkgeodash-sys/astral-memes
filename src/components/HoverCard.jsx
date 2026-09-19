import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, UserCheck, Flame } from 'lucide-react';
import { useSession } from '../lib/session';
import { currentStreak, followersOf, isOnline, setFollowing, useAccounts } from '../lib/social';
import Avatar from './Avatar';
import LevelBadge from './LevelBadge';
import { AuraTitle } from './AuraName';

// A mini profile that appears when hovering a member's name. `target` is a
// username or an account id, the same thing UserLink receives.
export function useHoverCard(target) {
  const [anchor, setAnchor] = useState(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  const clear = () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); };
  useEffect(() => clear, []);

  const handlers = {
    onMouseEnter: (e) => {
      if (window.matchMedia?.('(hover: none)').matches) return;
      clear();
      const el = e.currentTarget;
      openTimer.current = setTimeout(() => setAnchor(el.getBoundingClientRect()), 450);
    },
    onMouseLeave: () => { clear(); closeTimer.current = setTimeout(() => setAnchor(null), 180); }
  };

  const card = anchor && target ? (
    <HoverCard
      target={target}
      anchor={anchor}
      onEnter={clear}
      onLeave={() => { closeTimer.current = setTimeout(() => setAnchor(null), 150); }}
    />
  ) : null;

  return { handlers, card };
}

function HoverCard({ target, anchor, onEnter, onLeave }) {
  const { accountId, profile: me } = useSession();
  const accounts = useAccounts();
  const key = String(target).toLowerCase();
  const account = (accounts || []).find((a) => a.id === target || (a.username || '').toLowerCase() === key);
  if (!account) return null;

  const width = 280;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left + anchor.width / 2 - width / 2));
  const below = anchor.bottom + 230 < window.innerHeight;
  const style = below ? { left, top: anchor.bottom + 8, width } : { left, bottom: window.innerHeight - anchor.top + 8, width };
  const followers = followersOf(accounts, account.id).length;
  const amFollowing = (me?.following || []).includes(account.id);
  const streak = currentStreak(account);

  return createPortal(
    <div className="hovercard" style={{ ...style, '--banner': account.banner || undefined }} onMouseEnter={onEnter} onMouseLeave={onLeave} role="tooltip">
      <div className="hovercard-banner" />
      <div className="hovercard-body">
        <div className="spread" style={{ alignItems: 'flex-end', marginTop: -30 }}>
          <Avatar profile={account} size={56} online={isOnline(account)} />
          {account.id !== accountId && (
            <button
              className={amFollowing ? 'btn btn-sm' : 'btn btn-sm btn-primary'}
              onClick={(e) => { e.stopPropagation(); setFollowing(accountId, account.id, !amFollowing).catch(() => {}); }}
            >
              {amFollowing ? <><UserCheck size={13} /> Following</> : <><UserPlus size={13} /> Follow</>}
            </button>
          )}
        </div>
        <strong className="hovercard-name">{account.displayName || 'Astral member'}</strong>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {account.username && <small className="faint">@{account.username}</small>}
          <LevelBadge account={account} followers={followers} compact />
          <AuraTitle account={account} />
        </div>
        {account.status && <p className="hovercard-status">{account.status}</p>}
        {account.bio && <p className="hovercard-bio">{account.bio}</p>}
        <div className="hovercard-stats">
          <span><b>{followers}</b> followers</span>
          <span><b>{(account.following || []).length}</b> following</span>
          {streak > 0 && <span><Flame size={12} /> <b>{streak}</b></span>}
        </div>
      </div>
    </div>,
    document.body
  );
}
