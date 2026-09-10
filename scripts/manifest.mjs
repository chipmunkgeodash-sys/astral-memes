// Rebuilds public/games/manifest.json from whatever is actually on disk,
// preserving the readable titles from the original app's manifest.

import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(process.argv[2]);
const OLD = process.argv[3];

const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const oldNames = new Map();
if (OLD) {
  try {
    for (const g of JSON.parse(readFileSync(OLD, 'utf8')).games || []) {
      oldNames.set(key(g.name), g.name);
    }
  } catch { /* optional */ }
}

function nameFromFile(file) {
  const base = file.replace(/\.html?$/i, '').replace(/^cl/, '');
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || base;
}

const games = [];
for (const folder of readdirSync(ROOT).sort()) {
  const dir = join(ROOT, folder);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir)) {
    if (!/\.html?$/i.test(file)) continue;
    const derived = nameFromFile(file);
    games.push({
      id: createHash('sha1').update(`${folder}/${file}`).digest('hex').slice(0, 18),
      name: oldNames.get(key(derived)) || derived,
      path: `/games/${folder}/${encodeURIComponent(file)}`,
      sourceFolder: folder
    });
  }
}

games.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify({ games }, null, 0));
console.log(`manifest rewritten: ${games.length} games`);
