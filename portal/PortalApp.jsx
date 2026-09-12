import { useCallback, useEffect, useMemo, useState } from 'react';
import Starfield from './Starfield';
import { LAST_GOOD_KEY, MIRRORS, PLAYER, probe } from './mirrors';

// Small helper so a missing or blocked localStorage never takes the page down.
// Private windows and locked-down profiles both throw on access.
function readLastGood() {
  try { return localStorage.getItem(LAST_GOOD_KEY) || ''; } catch { return ''; }
}
function writeLastGood(id) {
  try { localStorage.setItem(LAST_GOOD_KEY, id); } catch { /* not worth reporting */ }
}

const STATUS_TEXT = {
  checking: 'checking',
  up: 'answering',
  down: 'no answer'
};

export default function PortalApp() {
  // id -> { state: 'checking' | 'up' | 'down', ms }
  const [status, setStatus] = useState({});
  const [checkedAt, setCheckedAt] = useState(null);
  const [copied, setCopied] = useState('');
  const [lastGood, setLastGood] = useState(readLastGood);

  const doors = useMemo(() => [...MIRRORS, PLAYER], []);

  const check = useCallback(() => {
    setStatus(Object.fromEntries(doors.map((d) => [d.id, { state: 'checking', ms: 0 }])));
    // Fire them all at once — two or three requests, no reason to queue.
    doors.forEach(async (door) => {
      const { ok, ms } = await probe(door.url);
      setStatus((prev) => ({ ...prev, [door.id]: { state: ok ? 'up' : 'down', ms } }));
    });
    setCheckedAt(new Date());
  }, [doors]);

  useEffect(() => { check(); }, [check]);

  // Where ENTER points. The door you last got through wins, as long as it is
  // still answering; otherwise the first mirror that is. Never empty, so the
  // button works even while the checks are still in flight.
  const target = useMemo(() => {
    const answering = (m) => status[m.id]?.state === 'up';
    const remembered = MIRRORS.find((m) => m.id === lastGood && answering(m));
    return remembered || MIRRORS.find(answering) || MIRRORS[0];
  }, [status, lastGood]);

  const allDown = MIRRORS.every((m) => status[m.id]?.state === 'down');
  const playerUp = status[PLAYER.id]?.state === 'up';
  const settled = doors.every((d) => status[d.id] && status[d.id].state !== 'checking');

  const remember = useCallback((id) => {
    writeLastGood(id);
    setLastGood(id);
  }, []);

  const copy = useCallback(async (door) => {
    try {
      await navigator.clipboard.writeText(door.url);
    } catch {
      // Clipboard access needs a secure context and a user gesture; when it is
      // refused, select the text so a manual copy is one keystroke away.
      const node = document.getElementById(`url-${door.id}`);
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return;
    }
    setCopied(door.id);
    setTimeout(() => setCopied((c) => (c === door.id ? '' : c)), 1600);
  }, []);

  return (
    <div className="gateway">
      <Starfield />

      <main className="gateway-main">
        <header className="mark">
          <div className="ring" aria-hidden="true"><span /></div>
          <h1>Astral <em>Gateway</em></h1>
          <p className="tagline">One address to remember. It finds the door that opens.</p>
        </header>

        <a
          className="enter"
          href={target.url}
          onClick={() => remember(target.id)}
        >
          <span className="enter-label">Enter</span>
          <span className="enter-host">{new URL(target.url).host}</span>
        </a>

        {allDown && settled && (
          <p className="alarm" role="status">
            No address answered from this network.{' '}
            {playerUp
              ? 'The game player below is still responding, so try that one first.'
              : 'The links below still work elsewhere — try a phone off the Wi-Fi.'}
          </p>
        )}

        <section className="doors" aria-label="All entrances">
          {doors.map((door) => {
            const s = status[door.id]?.state || 'checking';
            const ms = status[door.id]?.ms;
            return (
              <article className={`door door-${s}`} key={door.id}>
                <div className="door-head">
                  <span className={`dot dot-${s}`} aria-hidden="true" />
                  <h2>{door.label}</h2>
                  <span className="door-status">
                    {STATUS_TEXT[s]}{s === 'up' && ms ? ` · ${ms}ms` : ''}
                  </span>
                </div>
                <p className="door-note">{door.note}</p>
                <code className="door-url" id={`url-${door.id}`}>{new URL(door.url).host}</code>
                <div className="door-actions">
                  <a
                    className="btn btn-primary"
                    href={door.url}
                    onClick={() => remember(door.id)}
                  >
                    Open
                  </a>
                  <button className="btn" type="button" onClick={() => copy(door)}>
                    {copied === door.id ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <footer className="gateway-foot">
          <button className="btn btn-ghost" type="button" onClick={check} disabled={!settled}>
            {settled ? 'Check again' : 'Checking…'}
          </button>
          {checkedAt && settled && (
            <span className="checked-at">
              Last checked {checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <p className="fine">
            A green dot means the browser got a response — not that the page
            loaded. Some networks answer for a site they are blocking.
          </p>
        </footer>
      </main>
    </div>
  );
}
