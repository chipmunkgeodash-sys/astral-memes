// Shorts are YouTube only: a short stores the video id from a YouTube link.

// Accepts youtube.com/shorts/<id>, youtu.be/<id>, youtube.com/watch?v=<id>
// and the embed/live forms. Returns the video id, or null.
export function parseYouTubeUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const path = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
    id = path ? path[2] : u.searchParams.get('v');
  }
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
