import { useEffect, useState } from 'react';

const KEY = 'astral-theme';

// Three states: "light", "dark", or "system" (no attribute, CSS follows
// prefers-color-scheme). Stored per browser; storage can throw in private
// windows, so every access is guarded.
function read() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(read);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable — the attribute above still applies for this page */
    }
  }, [theme]);

  // Toggle flips to the opposite of what is currently showing.
  const toggle = () => {
    const showingDark = theme === 'dark'
      || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setTheme(showingDark ? 'light' : 'dark');
  };

  const isDark = theme === 'dark'
    || (theme === 'system' && typeof window !== 'undefined'
        && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return { theme, setTheme, toggle, isDark };
}
