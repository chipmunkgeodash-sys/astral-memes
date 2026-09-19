import { useEffect, useMemo, useState } from 'react';
import { Search, Users, Rss, Megaphone, Gamepad2, Heart, Clapperboard, Hash, History, X } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { PageHead, Empty, Loader, Tabs, UserLink, navigateTo } from '../components/ui';
import Avatar from '../components/Avatar';
import { hashtagsIn } from '../components/RichText';
import { youtubeThumb } from '../lib/shorts';
import { KEYS, pushRecent, useLocal } from '../lib/local';

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
  const [shorts, setShorts] = useState([]);
  const [recentSearches, setRecentSearches] = useLocal(KEYS.recentSearches, []);

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

  useEffect(() => onSnapshot(
    query(collection(db, COL.shorts), orderBy('createdAt', 'desc'), limit(200)),
    (snap) => setShorts(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.kind === 'youtube')),
    () => setShorts([])
  ), []);

  // Remember a search once it's been sitting there for a moment.
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) return undefined;
    const timer = setTimeout(() => setRecentSearches((r) => pushRecent(r, q, 8, (a, b) => a.toLowerCase() === b.toLowerCase())), 1200);
    return () => clearTimeout(timer);
  }, [term]);

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
    if (!t) return { people: [], posts: [], announcements: [], games: [], shorts: [], tags: [] };
    const has = (v) => String(v || '').toLowerCase().includes(t);
    return {
      people: (accounts || []).filter((a) => has(a.displayName) || has(a.username)).slice(0, 30),
      posts: posts.filter((p) => has(p.text) || has(p.displayName)).slice(0, 30),
      announcements: announcements.filter((a) => has(a.title) || has(a.body)).slice(0, 20),
      games: games.filter((g) => has(g.name)).slice(0, 40),
      shorts: shorts.filter((s) => has(s.caption) || has(s.displayName)).slice(0, 24),
      tags: (() => {
        const counts = new Map();
        const needle = t.replace(/^#/, '');
        [...posts.map((p) => p.text), ...shorts.map((s) => s.caption)].forEach((txt) => hashtagsIn(txt).forEach((tag) => { if (tag.includes(needle)) counts.set(tag, (counts.get(tag) || 0) + 1); }));
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      })()
    };
  }, [t, accounts, posts, announcements, games, shorts]);

  const total = hits.people.length + hits.posts.length + hits.announcements.length + hits.games.length + hits.shorts.length + hits.tags.length;
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
        <>
          <Empty icon={Search} title="Start typing" body="Search across members, posts, shorts, hashtags, announcements and the game library." />
          {!!(recentSearches || []).length && (
            <section className="card">
              <div className="spread" style={{ marginBottom: 8 }}>
                <h2 className="rng-heading" style={{ margin: 0 }}><History size={15} /> Recent searches</h2>
                <button className="btn btn-sm btn-ghost" onClick={() => setRecentSearches([])}>Clear</button>
              </div>
              <div className="wrap">
                {recentSearches.map((s) => (
                  <span key={s} className="chip recent-search">
                    <button type="button" className="link-quiet" onClick={() => navigateTo(`/search/${encodeURIComponent(s)}`)}>{s}</button>
                    <button type="button" className="link-quiet" aria-label={`Remove ${s}`} onClick={() => setRecentSearches((r) => r.filter((x) => x !== s))}><X size={11} /></button>
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: `All ${total}` },
              { value: 'people', label: `People ${hits.people.length}` },
              { value: 'posts', label: `Posts ${hits.posts.length}` },
              { value: 'shorts', label: `Shorts ${hits.shorts.length}` },
              { value: 'tags', label: `Tags ${hits.tags.length}` },
              { value: 'announcements', label: `News ${hits.announcements.length}` },
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

          {show('shorts') && !!hits.shorts.length && (
            <section>
              <h2 className="row" style={{ marginBottom: 12 }}><Clapperboard size={16} /> Shorts</h2>
              <div className="profile-shorts">
                {hits.shorts.map((s) => (
                  <button key={s.id} type="button" className="profile-short" onClick={() => navigateTo(`/shorts/${s.id}`)}>
                    <img src={youtubeThumb(s.media)} alt="" loading="lazy" />
                    <span>{(s.caption || s.displayName || '').slice(0, 30)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {show('tags') && !!hits.tags.length && (
            <section>
              <h2 className="row" style={{ marginBottom: 12 }}><Hash size={16} /> Hashtags</h2>
              <div className="wrap">
                {hits.tags.map(([tag, n]) => (
                  <button key={tag} type="button" className="chip" onClick={() => navigateTo(`/tag/${encodeURIComponent(tag)}`)}>#{tag} <small className="faint">{n}</small></button>
                ))}
              </div>
            </section>
          )}

          {(show('announcements')) && !!hits.announcements.length && (
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
