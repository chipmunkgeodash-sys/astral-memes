// A per-device accent colour. It sets --accent on the root element, and the
// stylesheet derives the hover and soft shades from it for both themes.

const KEY = 'astral-accent';

export const ACCENTS = [
  { id: 'default', label: 'Astral', color: null },
  { id: 'violet', label: 'Violet', color: '#8b5cf6' },
  { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { id: 'emerald', label: 'Emerald', color: '#10b981' },
  { id: 'amber', label: 'Amber', color: '#f59e0b' },
  { id: 'rose', label: 'Rose', color: '#f43f5e' },
  { id: 'pink', label: 'Pink', color: '#ec4899' },
  { id: 'sky', label: 'Sky', color: '#3b82f6' }
];

export function readAccent() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function applyAccent(color) {
  const root = document.documentElement;
  if (color) {
    root.style.setProperty('--accent', color);
    root.setAttribute('data-accent', '');
  } else {
    root.style.removeProperty('--accent');
    root.removeAttribute('data-accent');
  }
}

export function saveAccent(color) {
  try {
    if (color) localStorage.setItem(KEY, color);
    else localStorage.removeItem(KEY);
  } catch { /* the colour still applies for this visit */ }
  applyAccent(color);
}
