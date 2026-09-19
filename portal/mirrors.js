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
  { id: 'c7mh9f9g2u', url: 'https://c7mh9f9g2u.web.app' },
  { id: 'mq5bi2szqu', url: 'https://mq5bi2szqu.web.app' },
  { id: 'cw2exkq6jo', url: 'https://cw2exkq6jo.web.app' }
];

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
