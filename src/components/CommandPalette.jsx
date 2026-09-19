import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, CornerDownLeft, User, History } from 'lucide-react';
import { useAccounts } from '../lib/social';
import { KEYS, readLocal } from '../lib/local';

// Ctrl+K / ⌘K: type to filter pages, arrows to move, Enter to go. Anything that
// isn't a page becomes a site search.
export default function CommandPalette({ items, onGo }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('astral-open-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('astral-open-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setIndex(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const accounts = useAccounts();
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pages = items.filter((it) => !needle
      || it.label.toLowerCase().includes(needle)
      || (it.keywords || '').includes(needle));
    if (!needle) {
      // Recently visited pages first, then everything else.
      const recent = (readLocal(KEYS.recentPages, []) || []).map((r) => ({ ...r, key: `recent:${r.to}`, icon: History, label: `${r.label}`, hint: 'Recent' }));
      return [...recent, ...pages];
    }
    const people = (accounts || [])
      .filter((a) => (a.displayName || '').toLowerCase().includes(needle) || (a.username || '').toLowerCase().includes(needle))
      .slice(0, 5)
      .map((a) => ({ to: `/u/${encodeURIComponent(a.username || a.id)}`, key: `member:${a.id}`, label: a.displayName || a.username, hint: a.username ? `@${a.username}` : 'Member', icon: User }));
    return [...pages, ...people, { to: `/search/${encodeURIComponent(q.trim())}`, label: `Search for “${q.trim()}”`, icon: Search }];
  }, [items, q, accounts, open]);

  useEffect(() => { setIndex(0); }, [q]);

  if (!open) return null;

  const go = (it) => { setOpen(false); onGo(it.to); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && results[index]) { e.preventDefault(); go(results[index]); }
  };

  return createPortal(
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Go to">
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Go to a page or search…"
            aria-label="Go to"
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {results.map((it, i) => {
            const Icon = it.icon;
            return (
              <li key={it.key || it.to}>
                <button
                  className={i === index ? 'palette-item on' : 'palette-item'}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(it)}
                  role="option"
                  aria-selected={i === index}
                >
                  {Icon && <Icon size={16} />}
                  <span className="grow">{it.label}</span>
                  {it.hint && <small className="faint">{it.hint}</small>}
                  {i === index && <CornerDownLeft size={14} className="faint" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="palette-foot faint">↑↓ to move · Enter to open · Ctrl+K to toggle</div>
      </div>
    </div>,
    document.body
  );
}
