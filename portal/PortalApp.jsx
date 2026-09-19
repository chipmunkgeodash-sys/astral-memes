import { useCallback, useEffect, useMemo, useState } from 'react';
import Starfield from './Starfield';
import { LAST_GOOD_KEY, MIRRORS, probe } from './mirrors';

// Small helper so a missing or blocked localStorage never takes the page down.
// Private windows and locked-down profiles both throw on access.
function readLastGood() {
  try { return localStorage.getItem(LAST_GOOD_KEY) || ''; } catch { return ''; }
}
function writeLastGood(id) {
  try { localStorage.setItem(LAST_GOOD_KEY, id); } catch { /* not worth reporting */ }
}

export default function PortalApp() {
  // id -> 'checking' | 'up' | 'down'
  const [status, setStatus] = useState({});
  const [lastGood, setLastGood] = useState(readLastGood);

  useEffect(() => {
    MIRRORS.forEach(async (door) => {
      const { ok } = await probe(door.url);
      setStatus((prev) => ({ ...prev, [door.id]: ok ? 'up' : 'down' }));
    });
  }, []);

  // Where ENTER points. The door you last got through wins, as long as it is
  // still answering; otherwise the first mirror that is. Never empty, so the
  // button works even while the checks are still in flight.
  const target = useMemo(() => {
    const answering = (m) => status[m.id] === 'up';
    const remembered = MIRRORS.find((m) => m.id === lastGood && answering(m));
    return remembered || MIRRORS.find(answering) || MIRRORS[0];
  }, [status, lastGood]);

  const allDown = MIRRORS.every((m) => status[m.id] === 'down');

  const remember = useCallback((id) => {
    writeLastGood(id);
    setLastGood(id);
  }, []);

  return (
    <div className="gateway">
      <Starfield />

      <main className="gateway-main">
        <header className="mark">
          <div className="ring" aria-hidden="true"><span /></div>
          <h1>Astral <em>Launchpad</em></h1>
        </header>

        <a
          className="enter"
          href={target.url}
          onClick={() => remember(target.id)}
        >
          <span className="enter-label">Enter</span>
        </a>

        {allDown && (
          <p className="alarm" role="status">
            Couldn't reach the app from this network.
          </p>
        )}
      </main>
    </div>
  );
}
