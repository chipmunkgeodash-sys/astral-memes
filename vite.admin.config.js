import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Builds the Owner console as its own site. It shares src/ with the member app
// but ships separately to astral-owner.web.app, and never bundles the games.
export default defineConfig({
  plugins: [react()],
  root: resolve(process.cwd(), 'admin'),
  base: './',
  // Nothing in admin/ needs the 166 MB public folder.
  publicDir: false,
  build: {
    outDir: resolve(process.cwd(), 'dist-admin'),
    emptyOutDir: true,
    sourcemap: true
  }
});
