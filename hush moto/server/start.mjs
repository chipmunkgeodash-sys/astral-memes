import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRooms } from './rooms.mjs';

// Serve only the hosting allowlist output, never the source/tools directory.
const root = fileURLToPath(new URL('../hosting-dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.glb': 'model/gltf-binary', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200).end('ok'); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
attachRooms(server);
server.listen(Number(process.env.PORT || 8123), '0.0.0.0', () => console.log(`Hush Moto + multiplayer: http://localhost:${server.address().port}`));
