import { useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, Search, X, Lock } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, Loader, ErrorNote } from '../components/ui';

const PLAYER_ORIGIN = 'https://astral-memes-zentraa.web.app';
const PAGE_SIZE = 96;

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export default function GamesPage() {
  const { can, isOwner } = useSession();
  const [games, setGames] = useState([]);
  const [key, setKey] = useState('');
  const [term, setTerm] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const frame = useRef(null);

  const unlocked = isOwner || can('accessPaidGames');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/games/manifest.json');
        if (!res.ok) throw new Error('The games list could not be loaded.');
        const manifest = await res.json();
        if (!alive) return;
        setGames(manifest.games || []);

        if (unlocked) {
          const snap = await getDoc(doc(db, COL.paidContent, 'games'));
          const k = snap.exists() ? snap.data()?.key : null;
          if (typeof k === 'string' && k) setKey(k);
          else setError('The paid game library has not been unlocked yet.');
        }
      } catch (err) {
        if (alive) setError(err.message || 'The game library could not be loaded.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [unlocked]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? games.filter((g) => g.name.toLowerCase().includes(t)) : games;
  }, [games, term]);

  // Payloads are AES-GCM with a 12-byte IV prefix; the decrypted HTML is handed
  // to a player on a separate origin so games stay sandboxed from the app.
  const play = async (game) => {
    if (!key) { setError('The paid game library has not been unlocked yet.'); return; }
    setError('');
    setPlaying(game);
    try {
      const res = await fetch(game.path);
      if (!res.ok) throw new Error('This game could not be opened.');
      const bytes = new Uint8Array(await res.arrayBuffer());
      const cryptoKey = await crypto.subtle.importKey('raw', base64ToBytes(key), 'AES-GCM', false, ['decrypt']);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12) }, cryptoKey, bytes.slice(12)
      );
      let html = new TextDecoder().decode(plain);

      const base = `<base href="${location.origin}/games/">`;
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/<head([^>]*)>/i, (m) => `${m}${base}`)
        : base + html;

      const send = () => frame.current?.contentWindow?.postMessage({ type: 'astral-game', html }, PLAYER_ORIGIN);
      setTimeout(send, 400);
      window.addEventListener('message', function onReady(e) {
        if (e.origin !== PLAYER_ORIGIN) return;
        if (String(e.data?.type || '').startsWith('astral-player')) {
          send();
          window.removeEventListener('message', onReady);
        }
      });
    } catch (err) {
      setError(err.message || 'That game could not be opened.');
      setPlaying(null);
    }
  };

  if (loading) return <Loader label="Loading the game library…" />;

  if (!unlocked) {
    return (
      <Empty
        icon={Lock}
        title="Games are locked"
        body="The paid game library needs the Arctic or Astral role. Ask an Owner for access."
      />
    );
  }

  if (playing) {
    return (
      <div className="stack">
        <div className="spread">
          <h1>{playing.name}</h1>
          <button className="btn" onClick={() => setPlaying(null)}><X size={15} /> Close</button>
        </div>
        <iframe
          ref={frame}
          className="frame"
          src={PLAYER_ORIGIN}
          title={playing.name}
          allow="gamepad; fullscreen; autoplay"
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
          <label className="search" style={{ minWidth: 220 }}>
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
        <Empty icon={Gamepad2} title={`No games match “${term}”`} body="Try a shorter search." />
      ) : (
        <>
          <div className="grid grid-tight">
            {filtered.slice(0, shown).map((g) => (
              <button key={g.id} className="game-tile" onClick={() => play(g)}>
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
