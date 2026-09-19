import { useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, Search, X, Maximize2, Star, Shuffle, History } from 'lucide-react';
import { PageHead, Empty, ErrorNote, Tabs } from '../components/ui';
import { KEYS, pushRecent, useLocal } from '../lib/local';
import { SkeletonGrid } from '../components/Skeleton';

const PAGE_SIZE = 96;

export default function GamesPage({ router }) {
  const [games, setGames] = useState(null);
  const [term, setTerm] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const [view, setView] = useState('all');
  const [favorites, setFavorites] = useLocal(KEYS.gameFavorites, []);
  const [recent, setRecent] = useLocal(KEYS.gameRecent, []);
  const frame = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/games/manifest.json')
      .then((r) => {
        if (!r.ok) throw new Error('The games list could not be loaded.');
        return r.json();
      })
      .then((m) => { if (alive) setGames(m.games || []); })
      .catch((e) => { if (alive) { setError(e.message); setGames([]); } });
    return () => { alive = false; };
  }, []);

  const byId = useMemo(() => new Map((games || []).map((g) => [g.id, g])), [games]);

  const filtered = useMemo(() => {
    if (!games) return [];
    let list = games;
    if (view === 'favorites') list = (favorites || []).map((id) => byId.get(id)).filter(Boolean);
    if (view === 'recent') list = (recent || []).map((id) => byId.get(id)).filter(Boolean);
    const t = term.trim().toLowerCase();
    return t ? list.filter((g) => g.name.toLowerCase().includes(t)) : list;
  }, [games, term, view, favorites, recent, byId]);

  const play = (g) => {
    setPlaying(g);
    setRecent((r) => pushRecent(r, g.id, 24));
  };

  const random = () => {
    const pool = filtered.length ? filtered : games || [];
    if (pool.length) play(pool[Math.floor(Math.random() * pool.length)]);
  };

  const toggleFavorite = (id) => setFavorites((f) => ((f || []).includes(id) ? f.filter((x) => x !== id) : [...(f || []), id]));

  const fullscreen = () => frame.current?.requestFullscreen?.();

  if (games === null) return <div className="stack"><PageHead eyebrow="Loading" title="Games" /><SkeletonGrid count={12} height={110} /></div>;

  if (playing) {
    const fav = (favorites || []).includes(playing.id);
    return (
      <div className="stack">
        <div className="spread">
          <div>
            <span className="eyebrow">Now playing</span>
            <h1>{playing.name}</h1>
          </div>
          <div className="row">
            <button className={fav ? 'btn btn-primary' : 'btn'} onClick={() => toggleFavorite(playing.id)} aria-pressed={fav}>
              <Star size={15} fill={fav ? 'currentColor' : 'none'} /> {fav ? 'Favourite' : 'Add to favourites'}
            </button>
            <button className="btn" onClick={random}><Shuffle size={15} /> Random</button>
            <button className="btn" onClick={fullscreen}><Maximize2 size={15} /> Fullscreen</button>
            <button className="btn" onClick={() => setPlaying(null)}><X size={15} /> Close</button>
          </div>
        </div>
        <iframe
          key={playing.id}
          ref={frame}
          className="frame"
          src={playing.path}
          title={playing.name}
          allow="gamepad *; fullscreen *; autoplay; pointer-lock"
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        eyebrow={`${games.length.toLocaleString()} games`}
        title="Games"
        actions={(
          <>
            <button className="btn" onClick={random} disabled={!games.length}><Shuffle size={15} /> Random game</button>
            <label className="search" style={{ minWidth: 240 }}>
              <Search size={15} />
              <input
                value={term}
                onChange={(e) => { setTerm(e.target.value); setShown(PAGE_SIZE); }}
                placeholder="Search games"
              />
            </label>
          </>
        )}
      />

      <button className="hush-library-card" onClick={() => window.location.assign('/hushmoto')}>
        <span><small>ASTRAL ORIGINAL · I MADE THIS GAME</small><strong>HUSH MOTO</strong></span>
        <span>Ride solo. Host a server. Join your crew. ↗</span>
      </button>

      <Tabs
        value={view}
        onChange={(v) => { setView(v); setShown(PAGE_SIZE); }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'favorites', label: <><Star size={12} /> Favourites {(favorites || []).length}</> },
          { value: 'recent', label: <><History size={12} /> Recently played</> }
        ]}
      />

      <ErrorNote>{error}</ErrorNote>

      {!filtered.length ? (
        <Empty
          icon={view === 'favorites' ? Star : view === 'recent' ? History : Gamepad2}
          title={term ? `No games match “${term}”` : view === 'favorites' ? 'No favourites yet.' : view === 'recent' ? 'Nothing played yet.' : 'No games yet.'}
          body={view === 'favorites' ? 'Tap the star on any game to keep it here.' : 'Try a shorter search.'}
        />
      ) : (
        <>
          <div className="grid grid-tight">
            {filtered.slice(0, shown).map((g) => {
              const fav = (favorites || []).includes(g.id);
              return (
                <div key={g.id} className="lobby-cell">
                  <button className="game-tile" onClick={() => play(g)}>
                    <span className="tile-icon"><Gamepad2 size={16} /></span>
                    <strong>{g.name}</strong>
                    <small>Play now</small>
                  </button>
                  <button type="button" className={fav ? 'lobby-star on' : 'lobby-star'} onClick={() => toggleFavorite(g.id)} aria-label={fav ? `Unfavourite ${g.name}` : `Favourite ${g.name}`} aria-pressed={fav}>
                    <Star size={13} fill={fav ? 'currentColor' : 'none'} />
                  </button>
                </div>
              );
            })}
          </div>
          {shown < filtered.length && (
            <button className="btn btn-full" onClick={() => setShown((s) => s + PAGE_SIZE)}>
              Show more ({(filtered.length - shown).toLocaleString()} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}
