import { useEffect, useMemo, useState } from 'react';
import { Search, Users, Rss, Megaphone, Gamepad2, Heart } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { PageHead, Empty, Loader, Tabs, UserLink, navigateTo } from '../components/ui';
import Avatar from '../components/Avatar';

// Everything is small enough to filter client-side, which avoids needing
// composite indexes or a search service.
export default function SearchPage({ router }) {
  const initial = decodeURIComponent(router.segments[1] || '');
  const [term, setTerm] = useState(initial);
  const [tab, setTab] = useState('all');
  const [accounts, setAccounts] = useState(null);
  const [posts, setPosts] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [games, setGames] = useState([]);

  useEffect(() => setTerm(initial), [initial]);

  useEffect(() => onSnapshot(
    collection(db, COL.accounts),
    (snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setAccounts([])
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, COL.posts), orderBy('createdAt', 'desc'), limit(200)),
    (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setPosts([])
  ), []);

  useEffect(() => onSnapshot(
    query(collection(db, COL.announcements), orderBy('createdAt', 'desc'), limit(50)),
    (snap) => setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setAnnouncements([])
  ), []);

  useEffect(() => {
    let alive = true;
    fetch('/games/manifest.json')
      .then((r) => r.json())
      .then((m) => { if (alive) setGames(m.games || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const t = term.trim().toLowerCase();

  const hits = useMemo(() => {
    if (!t) return { people: [], posts: [], announcements: [], games: [] };
    const has = (v) => String(v || '').toLowerCase().includes(t);
    return {
      people: (accounts || []).filter((a) => has(a.displayName) || has(a.username)).slice(0, 30),
      posts: posts.filter((p) => has(p.text) || has(p.displayName)).slice(0, 30),
      announcements: announcements.filter((a) => has(a.title) || has(a.body)).slice(0, 20),
      games: games.filter((g) => has(g.name)).slice(0, 40)
    };
  }, [t, accounts, posts, announcements, games]);

  const total = hits.people.length + hits.posts.length + hits.announcements.length + hits.games.length;
  const show = (kind) => tab === 'all' || tab === kind;

  if (accounts === null) return <Loader label="Loading…" />;

  return (
    <div className="stack">
      <PageHead eyebrow="Search" title={t ? `“${term}”` : 'Search Astral'} />

      <label className="search">
        <Search size={16} />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            navigateTo(e.target.value.trim() ? `/search/${encodeURIComponent(e.target.value.trim())}` : '/search');
          }}
          placeholder="People, posts, announcements, games…"
          autoFocus
        />
      </label>

      {!t ? (
        <Empty icon={Search} title="Start typing" body="Search across members, posts, announcements and the game library." />
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: `All ${total}` },
              { value: 'people', label: `People ${hits.people.length}` },
              { value: 'posts', label: `Posts ${hits.posts.length}` },
              { value: 'games', label: `Games ${hits.games.length}` }
            ]}
          />

          {!total && <Empty icon={Search} title={`Nothing matches “${term}”`} body="Try fewer letters." />}

          {show('people') && !!hits.people.length && (
            <section>
              <h2 className="row" style={{ marginBottom: 12 }}><Users size={16} /> People</h2>
              <div className="list">
                {hits.people.map((a) => (
                  <div key={a.id} className="row-item">
                    <Avatar profile={a} size={32} />
                    <span className="me-text grow">
                      <UserLink to={a.usernameLower || a.id}>{a.displayName || 'Astral member'}</UserLink>
                      {a.username && <small>@{a.username}</small>}
                    </span>
                    {(a.roleIds || []).includes('owner') && <span className="chip chip-accent">Owner</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {show('posts') && !!hits.posts.length && (
            <section>
              <h2 className="row" style={{ marginBottom: 12 }}><Rss size={16} /> Posts</h2>
              <div className="list">
                {hits.posts.map((p) => (
                  <article key={p.id} className="card">
                    <div className="row" style={{ marginBottom: 6 }}>
                      <Avatar profile={{ id: p.uid, displayName: p.displayName }} size={26} />
                      <UserLink to={p.uid}>{p.displayName || 'Astral member'}</UserLink>
                    </div>
                    <p className="post-body" style={{ margin: 0 }}>{p.text}</p>
                    <div className="row faint" style={{ marginTop: 8 }}>
                      <Heart size={12} /> {(p.likes || []).length}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {show('all') && !!hits.announcements.length && (
            <section>
              <h2 className="row" style={{ marginBottom: 12 }}><Megaphone size={16} /> Announcements</h2>
              <div className="list">
                {hits.announcements.map((a) => (
                  <article key={a.id} className="card">
                    <strong>{a.title}</strong>
                    <p className="muted" style={{ marginTop: 4 }}>{a.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {show('games') && !!hits.games.length && (
            <section>
              <h2 className="row" style={{ marginBottom: 12 }}><Gamepad2 size={16} /> Games</h2>
              <div className="grid grid-tight">
                {hits.games.map((g) => (
                  <button key={g.id} className="game-tile" onClick={() => navigateTo('/games')}>
                    <span className="tile-icon"><Gamepad2 size={15} /></span>
                    <strong>{g.name}</strong>
                    <small>Open in Games</small>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
