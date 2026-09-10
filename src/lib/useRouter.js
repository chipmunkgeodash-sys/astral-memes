import { useState, useEffect, useCallback } from 'react';

// The original app used the History API directly rather than react-router, so
// this reproduces that: a path string plus a navigate() that pushes state.

export function useRouter() {
  const [path, setPath] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === window.location.pathname) return;
    if (replace) window.history.replaceState({}, '', to);
    else window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  const segments = path.split('/').filter(Boolean);
  return { path, segments, navigate };
}
