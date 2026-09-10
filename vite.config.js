import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The original deploy used relative asset URLs (./assets/...), so keep that.
  base: './',
  build: {
    outDir: 'dist',
    // Ship source maps this time. The original build did not, which is the
    // entire reason this project had to be reconstructed from a bundle.
    sourcemap: true
  }
});
