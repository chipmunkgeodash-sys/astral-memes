import React from 'react';
import { createRoot } from 'react-dom/client';
import { SessionProvider } from './lib/session';
import App from './App';
import { applyAccent, readAccent } from './lib/accent';
import { applyDisplay, readDisplay } from './lib/display';
import './styles.css';

// Before the first render, so a custom accent never flashes the default.
applyAccent(readAccent());
applyDisplay(readDisplay());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>
);
