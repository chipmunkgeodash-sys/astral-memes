import React from 'react';
import { createRoot } from 'react-dom/client';
import { SessionProvider } from '../src/lib/session';
import AdminApp from './AdminApp';
import '../src/styles.css';
import './admin.css';

// Separate origin, separate sign-in, same Firestore project — so everything
// changed here lands on astral-memes.web.app immediately.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SessionProvider>
      <AdminApp />
    </SessionProvider>
  </React.StrictMode>
);
