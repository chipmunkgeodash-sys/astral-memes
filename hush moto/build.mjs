import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'dist/game.js',
  format: 'iife',
  target: ['es2022'],
  minify: !process.argv.includes('--dev'),
  sourcemap: process.argv.includes('--dev') ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  define: { HUSH_MULTIPLAYER_URL: JSON.stringify(process.env.HUSH_MULTIPLAYER_URL || '') },
  alias: { 'three/addons': 'three/examples/jsm' },
};

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log('watching…');
} else {
  await esbuild.build(opts);
}
