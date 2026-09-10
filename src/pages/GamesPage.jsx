import { useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, Search, X, Maximize2 } from 'lucide-react';
import { PageHead, Empty, Loader, ErrorNote } from '../components/ui';

const PAGE_SIZE = 96;

export default function GamesPage() {
  const [games, setGames] = useState(null);
  const [term, setTerm] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
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

  const filtered = useMemo(() => {
    if (!games) return [];
    const t = term.trim().toLowerCase();
    return t ? games.filter((g) => g.name.toLowerCase().includes(t)) : games;
  }, [games, term]);

  const fullscreen = () => frame.current?.requestFullscreen?.();

  if (games === null) return <Loader label="Loading the game library…" />;

  if (playing) {
    return (
      <div className="stack">
        <div className="spread">
          <div>
            <span className="eyebrow">Now playing</span>
            <h1>{playing.name}</h1>
          </div>
          <div className="row">
            <button className="btn" onClick={fullscreen}><Maximize2 size={15} /> Fullscreen</button>
            <button className="btn" onClick={() => setPlaying(null)}><X size={15} /> Close</button>
          </div>
        </div>
        <iframe
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
        actions={
          <label className="search" style={{ minWidth: 240 }}>
            <Search size={15} />
            <input
              value={term}
              onChange={(e) => { setTerm(e.target.value); setShown(PAGE_SIZE); }}
              placeholder="Search games"
            />
          </label>
        }
      />

      <ErrorNote>{error}</ErrorNote>

      {!filtered.length ? (
        <Empty icon={Gamepad2} title={term ? `No games match “${term}”` : 'No games yet.'} body="Try a shorter search." />
      ) : (
        <>
          <div className="grid grid-tight">
            {filtered.slice(0, shown).map((g) => (
              <button key={g.id} className="game-tile" onClick={() => setPlaying(g)}>
                <span className="tile-icon"><Gamepad2 size={16} /></span>
                <strong>{g.name}</strong>
                <small>Play now</small>
              </button>
            ))}
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
