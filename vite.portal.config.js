import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Builds the gateway as its own site. It shares nothing with src/ — no
// Firebase, no session — so the bundle stays small enough to load on a bad
// connection, which is the one job it has.
//
// Paths hang off this file rather than the working directory, so the site
// builds and serves the same from anywhere.
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: here('./portal'),
  base: './',
  // Nothing in portal/ needs the 165 MB games folder.
  publicDir: false,
  build: {
    outDir: here('./dist-portal'),
    emptyOutDir: true,
    sourcemap: true
  }
});
