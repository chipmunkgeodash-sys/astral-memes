import { levelFor, levelTitle, xpFor } from '../lib/levels';

export default function LevelBadge({ account, followers = 0, compact = false }) {
  const { level } = levelFor(xpFor(account, followers));
  return (
    <span className={compact ? 'level-badge compact' : 'level-badge'} title={`Level ${level} · ${levelTitle(level)}`}>
      Lv {level}{!compact && <em>{levelTitle(level)}</em>}
    </span>
  );
}
