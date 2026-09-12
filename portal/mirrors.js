// Every hostname that serves the member app, best first.
//
// Firebase hands each hosting site two hostnames and both stay live, so a
// filter that catches one often misses the other. That is the whole reason
// this page exists: one address to remember, and it forwards you to whichever
// door is currently open.
//
// To add a door later — a custom domain, a second Firebase site — drop it in
// this list. Nothing else needs editing.
export const MIRRORS = [
  {
    id: 'games1',
    url: 'https://astral-games1.web.app',
    label: 'Primary',
    note: 'The current address. Use this one unless it refuses to load.'
  },
  {
    id: 'games1-firebaseapp',
    url: 'https://astral-games1.firebaseapp.com',
    label: 'Mirror',
    note: 'The same site on a second hostname, served from the same deploy.'
  },
  {
    id: 'web-app',
    url: 'https://astral-memes.web.app',
    label: 'Old address',
    note: 'The original hostname. Filtered on some networks — kept for anyone it still works for.'
  }
];

// The sandboxed game player is its own site, so it is worth listing separately —
// it is sometimes reachable when the main app is not.
export const PLAYER = {
  id: 'player',
  url: 'https://astral-memes-zentraa.web.app',
  label: 'Game player',
  note: 'The standalone player shim. No feed, no chat — games only.'
};

export const LAST_GOOD_KEY = 'astral.gateway.last-good';

// Best-effort reachability check.
//
// A cross-origin no-cors request tells us nothing about what came back, but it
// does tell us whether anything came back at all — which is the difference
// between "the site is down" and "this network will not reach it". A network
// that answers with its own block page still counts as reachable, so treat a
// green dot as a hint rather than proof.
export async function probe(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}
