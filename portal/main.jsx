import React from 'react';
import { createRoot } from 'react-dom/client';
import PortalApp from './PortalApp';
import './portal.css';

// The gateway is deliberately standalone: no Firebase, no shared src/, nothing
// to sign in to. One page, whose only job is to hand you a link that works.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PortalApp />
  </React.StrictMode>
);
