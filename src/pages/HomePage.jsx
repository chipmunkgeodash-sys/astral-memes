import { useEffect, useState } from 'react';
import { Rss, Trophy, Vote, Gamepad2, Store, MessageCircle, Megaphone, Coins } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, SectionHead } from '../components/ui';

const TILES = [
  { to: '/games', label: 'Games', body: '1,578 ready to play', icon: Gamepad2 },
  { to: '/feed', label: 'Feed', body: 'What everyone is posting', icon: Rss },
  { to: '/challenges', label: 'Challenges', body: 'Climb the leaderboard', icon: Trophy },
  { to: '/messages', label: 'Messages', body: 'The lounge and your DMs', icon: MessageCircle },
  { to: '/polls', label: 'Polls', body: 'One vote each', icon: Vote },
  { to: '/store', label: 'Store', body: 'Spend what you earn', icon: Store }
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
    <div className="stack">
      <PageHead
        eyebrow={greeting()}
        title={`Hey, ${profile?.displayName || 'there'}.`}
        actions={<span className="chip chip-accent"><Coins size={13} /> {balance.toLocaleString()} coins</span>}
      />

      {!!announcements.length && (
        <section>
          <SectionHead title="Announcements" />
          <div className="list">
            {announcements.map((a) => (
              <article key={a.id} className="card">
                <div className="row" style={{ marginBottom: 6 }}>
                  <Megaphone size={15} className="muted" />
                  <strong>{a.title}</strong>
                </div>
                <p className="muted">{a.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Jump in" />
        <div className="grid">
          {TILES.map(({ to, label, body, icon: Icon }) => (
            <button key={to} className="tile" onClick={() => router.navigate(to)}>
              <span className="tile-icon"><Icon size={18} /></span>
              <strong>{label}</strong>
              <span>{body}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
