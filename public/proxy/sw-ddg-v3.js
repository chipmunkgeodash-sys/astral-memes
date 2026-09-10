/* global UVServiceWorker, __uv$config */
importScripts("/proxy/uv/uv.bundle.js");
importScripts("/proxy/uv-ddg-v3.config.js");
importScripts(__uv$config.sw);

const ultraviolet = new UVServiceWorker();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") void self.skipWaiting();
});

function duckDuckGoRedirect(requestUrl) {
  const routeStart = `${self.location.origin}${__uv$config.prefix}`;
  if (!requestUrl.startsWith(routeStart)) return "";

  try {
    const encodedTarget = requestUrl.slice(routeStart.length);
    const target = new URL(__uv$config.decodeUrl(encodedTarget));
    const isGoogleSearch =
      /(^|\.)google\.[a-z.]+$/i.test(target.hostname) &&
      target.pathname.replace(/\/+$/, "") === "/search";
    if (!isGoogleSearch) return "";

    const query = target.searchParams.get("q") || "";
    const duckDuckGo = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;
    return `${routeStart}${__uv$config.encodeUrl(duckDuckGo)}`;
  } catch (_) {
    return "";
  }
}

self.addEventListener("fetch", (event) => {
  if (!ultraviolet.route(event)) return;
  const redirect = duckDuckGoRedirect(event.request.url);
  event.respondWith(redirect ? Response.redirect(redirect, 302) : ultraviolet.fetch(event));
});
