import { useEffect, useState } from 'react';
import { Rss, Trophy, Vote, Gamepad2, Store, Globe, MessageCircle, Megaphone } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { SectionTitle, Empty } from '../components/ui';

const LAUNCH = [
  { to: '/feed', label: 'Community feed', body: 'A place for whatever makes your day.', icon: Rss, tone: 'launch-blue' },
  { to: '/challenges', label: 'Challenges', body: 'A little friendly competition', icon: Trophy, tone: 'launch-amber' },
  { to: '/games', label: 'Game library', body: 'Good games.', icon: Gamepad2, tone: 'launch-blue' },
  { to: '/polls', label: 'Community vote', body: 'Owners ask the question. Every member gets one vote.', icon: Vote, tone: 'launch-amber' },
  { to: '/store', label: 'Rewards Store', body: 'Spend what you earn.', icon: Store, tone: 'launch-blue' },
  { to: '/messages', label: 'Messages', body: 'A little room for a one-to-one conversation.', icon: MessageCircle, tone: 'launch-amber' },
  { to: '/browser', label: 'Private browser', body: 'A clear view of your space.', icon: Globe, tone: 'launch-blue' }
];

export default function HomePage({ router }) {
  const { profile, balance } = useSession();
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => onSnapshot(
    query(collection(db, COL.announcements), orderBy('createdAt', 'desc'), limit(3)),
    (snap) => setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setAnnouncements([])
  ), []);

  return (
    <div className="home-columns">
      <div className="home-intro welcome">
        <span className="eyebrow">THE ASTRAL EXPERIENCE</span>
        <h1 className="heading">
          Welcome back, {profile?.displayName || 'Astral member'}.
        </h1>
        <p>Jump into a game, share a laugh, or catch up with the community.</p>
        <div className="welcome-actions">
          <span className="wallet-pill">{balance.toLocaleString()} Astral Coins</span>
        </div>
      </div>

      {!!announcements.length && (
        <section>
          <SectionTitle eyebrow="COMMUNITY UPDATE" title="Announcements" />
          <div className="poll-list">
            {announcements.map((a) => (
              <article key={a.id} className="announcement community-card">
                <Megaphone size={16} />
                <strong>{a.title}</strong>
                <p>{a.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle eyebrow="IN YOUR ORBIT" title="Where do you want to go?" />
        <div className="launch-grid">
          {LAUNCH.map(({ to, label, body, icon: Icon, tone }) => (
            <button key={to} className={`launch-card ${tone}`} onClick={() => router.navigate(to)}>
              <span className="launch-icon"><Icon size={20} /></span>
              <strong>{label}</strong>
              <span>{body}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
