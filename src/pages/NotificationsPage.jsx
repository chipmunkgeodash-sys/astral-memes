import { useMemo, useState } from 'react';
import { Bell, CheckCheck, Heart, MessageSquare, AtSign, UserPlus } from 'lucide-react';
import { useSession } from '../lib/session';
import { PageHead, Empty, Tabs, navigateTo } from '../components/ui';
import { markAllRead, useNotifications } from '../lib/notifications';
import Avatar from '../components/Avatar';

const ICON = { like: Heart, react: Heart, comment: MessageSquare, mention: AtSign, follow: UserPlus };
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'mention', label: 'Mentions' },
  { value: 'comment', label: 'Comments' },
  { value: 'follow', label: 'Follows' }
];

function when(ms) {
  if (!ms) return '';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export default function NotificationsPage() {
  const { accountId, profile } = useSession();
  const { items, unread } = useNotifications(accountId, profile);
  const [filter, setFilter] = useState('all');

  const shown = useMemo(() => items.filter((n) => (
    filter === 'all' ? true : filter === 'unread' ? n.unread : n.type === filter || (filter === 'comment' && n.type === 'react')
  )).slice(0, 200), [items, filter]);

  return (
    <div className="stack content-narrow">
      <PageHead
        eyebrow="What you missed"
        title="Notifications"
        actions={(
          <button className="btn btn-sm" onClick={() => markAllRead(items)} disabled={!unread}>
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      />
      <div className="tabs-scroll"><Tabs value={filter} onChange={setFilter} options={FILTERS} /></div>

      {!shown.length ? (
        <Empty icon={Bell} title={filter === 'unread' ? "You're all caught up." : 'Nothing yet.'} body="Likes, comments, follows and mentions show up here." />
      ) : (
        <ol className="notif-list">
          {shown.map((n) => {
            const Icon = ICON[n.type] || Bell;
            return (
              <li key={n.id}>
                <button
                  className={n.unread ? `notif unread notif-${n.type}` : `notif notif-${n.type}`}
                  onClick={() => { markAllRead([n]); navigateTo(n.to); }}
                >
                  <span className="notif-avatar">
                    <Avatar profile={n.from} size={38} />
                    <span className="notif-icon">{n.emoji || <Icon size={11} />}</span>
                  </span>
                  <span className="grow notif-text">
                    <strong>{n.from.displayName || 'Someone'}</strong> {n.text}
                  </span>
                  <small className="faint">{when(n.at)}</small>
                  {n.unread && <span className="notif-dot" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
