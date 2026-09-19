import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const game = fileURLToPath(new URL('../hush moto/', import.meta.url));
const build = spawnSync(process.execPath, ['tools/build-hosting.mjs'], { cwd: game, stdio: 'inherit' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);
const destination = new URL('../public/hush-moto-game/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../hush moto/hosting-dist/', import.meta.url), destination, { recursive: true });
// A top-level document gives the game its own keyboard and network lifecycle.
const entry = await readFile(new URL('index.html', destination), 'utf8');
await writeFile(new URL('../public/hushmoto.html', import.meta.url),
  entry.replace('<head>', '<head><base href="/hush-moto-game/">'));
console.log('Hush Moto ready at /hushmoto');
