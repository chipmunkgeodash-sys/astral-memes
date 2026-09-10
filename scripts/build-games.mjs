// Copies the UGS game HTML into public/games and writes manifest.json.
// Names are taken from the original app's manifest wherever a filename can be
// matched to one, so the library keeps its readable titles.

import { readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const SRC = resolve(process.argv[2]);
const OUT = resolve(process.argv[3]);
const OLD_MANIFEST = process.argv[4];

const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Old names, keyed by their squashed form, for lookup.
const oldNames = new Map();
if (OLD_MANIFEST) {
  try {
    const old = JSON.parse(readFileSync(OLD_MANIFEST, 'utf8'));
    for (const g of old.games || []) oldNames.set(key(g.name), g.name);
  } catch { /* optional */ }
}

// Turn "clCartoonNetworkTableTennis" into "Cartoon Network Table Tennis".
function nameFromFile(file) {
  let base = file.replace(/\.html?$/i, '');
  base = base.replace(/^cl/, '');
  const spaced = base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()) || base;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const games = [];
const folders = readdirSync(SRC).filter((f) => {
  if (f.startsWith('.')) return false;
  try { return statSync(join(SRC, f)).isDirectory(); } catch { return false; }
});

for (const folder of folders.sort()) {
  const files = readdirSync(join(SRC, folder)).filter((f) => /\.html?$/i.test(f));
  if (!files.length) continue;
  mkdirSync(join(OUT, folder), { recursive: true });

  for (const file of files) {
    copyFileSync(join(SRC, folder, file), join(OUT, folder, file));
    const derived = nameFromFile(file);
    const name = oldNames.get(key(derived)) || derived;
    games.push({
      id: createHash('sha1').update(`${folder}/${file}`).digest('hex').slice(0, 18),
      name,
      path: `/games/${folder}/${encodeURIComponent(file)}`,
      sourceFolder: folder
    });
  }
}

games.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ games }, null, 0));

const matched = games.filter((g) => oldNames.has(key(g.name))).length;
console.log(`games: ${games.length}`);
console.log(`folders: ${folders.length}`);
console.log(`names matched to the original manifest: ${matched}`);
console.log('sample:');
for (const g of games.slice(0, 8)) console.log(`  ${g.name}  ->  ${g.path}`);
