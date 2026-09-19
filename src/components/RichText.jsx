import { useState } from 'react';
import { navigateTo } from './ui';

// Turns plain post, comment and chat text into something a little richer:
//   :fire:        → 🔥            (emoji shortcodes)
//   ||secret||    → tap to reveal (spoilers)
//   #tag          → tag feed link
//   @name         → profile link, highlighted when it's you
//   https://…     → clickable link
// Everything is rendered as React nodes, never as HTML, so nothing typed can
// inject markup.

export const SHORTCODES = {
  fire: '🔥', skull: '💀', joy: '😂', lol: '😂', sob: '😭', cry: '😭', heart: '❤️', love: '😍',
  eyes: '👀', thumbsup: '👍', '+1': '👍', thumbsdown: '👎', clap: '👏', pray: '🙏', wave: '👋',
  star: '⭐', sparkles: '✨', rocket: '🚀', moon: '🌙', sun: '☀️', rainbow: '🌈', 100: '💯',
  crown: '👑', gem: '💎', money: '💰', coin: '🪙', dice: '🎲', game: '🎮', trophy: '🏆',
  cool: '😎', think: '🤔', shock: '😱', angry: '😡', sleep: '😴', party: '🥳', clown: '🤡',
  ghost: '👻', alien: '👽', robot: '🤖', cat: '🐱', dog: '🐶', frog: '🐸', goat: '🐐', cap: '🧢',
  check: '✅', x: '❌', warn: '⚠️', zap: '⚡', boom: '💥', pizza: '🍕', cake: '🎂', nerd: '🤓'
};

export const expandShortcodes = (text) => (text || '').replace(/:([a-z0-9+_]+):/gi, (m, code) => SHORTCODES[code.toLowerCase()] || m);

const TOKEN = /(\|\|[^|]+\|\||https?:\/\/[^\s]+|#[\p{L}\p{N}_]{2,40}|@[\p{L}\p{N}_.-]+)/gu;

function Spoiler({ children }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      className={shown ? 'spoiler shown' : 'spoiler'}
      onClick={(e) => { e.stopPropagation(); setShown(true); }}
      role="button"
      tabIndex={0}
      title={shown ? undefined : 'Spoiler — tap to reveal'}
      onKeyDown={(e) => { if (e.key === 'Enter') setShown(true); }}
    >
      {children}
    </span>
  );
}

export default function RichText({ text, me = [] }) {
  if (!text) return null;
  const parts = expandShortcodes(text).split(TOKEN);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith('||')) return <Spoiler key={i}>{part.slice(2, -2)}</Spoiler>;
    if (part.startsWith('http')) {
      return <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="rich-link" onClick={(e) => e.stopPropagation()}>{part}</a>;
    }
    if (part.startsWith('#')) {
      const tag = part.slice(1).toLowerCase();
      return (
        <button key={i} type="button" className="hashtag" onClick={(e) => { e.stopPropagation(); navigateTo(`/tag/${encodeURIComponent(tag)}`); }}>
          {part}
        </button>
      );
    }
    const handle = part.slice(1).toLowerCase();
    return (
      <button
        key={i}
        type="button"
        className={me.includes(handle) ? 'mention mention-me' : 'mention'}
        onClick={(e) => { e.stopPropagation(); navigateTo(`/u/${encodeURIComponent(handle)}`); }}
      >
        {part}
      </button>
    );
  });
}

export const hashtagsIn = (text) => [...new Set(((text || '').match(/#[\p{L}\p{N}_]{2,40}/gu) || []).map((t) => t.slice(1).toLowerCase()))];

export const myHandles = (profile) => [profile?.username, (profile?.displayName || '').replace(/\s+/g, '')]
  .filter(Boolean)
  .map((h) => h.toLowerCase());

export const mentionsHandle = (text, handles) => ((text || '').match(/@[\p{L}\p{N}_.-]+/gu) || [])
  .some((m) => handles.includes(m.slice(1).toLowerCase()));
