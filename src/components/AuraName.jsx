import { auraById } from '../lib/rng';

export const auraVars = (aura) => ({ '--aura': aura.color, '--aura2': aura.color2 || aura.color });

// Letter-by-letter effects need each character in its own span.
const LETTER_FX = new Set(['wave', 'cosmic']);

export default function AuraName({ aura, as: Tag = 'span', className = '', reveal = false }) {
  const letters = LETTER_FX.has(aura.fx) || reveal;
  return (
    <Tag
      className={`aura aura-${aura.fx}${reveal ? ' aura-reveal' : ''} ${className}`}
      style={auraVars(aura)}
      aria-label={aura.name}
    >
      {letters
        ? [...aura.name].map((ch, i) => (
          <span key={i} className="aura-ch" style={{ '--i': i }} aria-hidden="true">
            {ch === ' ' ? ' ' : ch}
          </span>
        ))
        : aura.name}
    </Tag>
  );
}

// The aura a member has equipped as their title, if any.
export function AuraTitle({ account }) {
  if (!account?.title) return null;
  const aura = auraById(account.title);
  if (aura.id !== account.title) return null;
  return <span className="aura-title" title={`Equipped aura: ${aura.name}`}><AuraName aura={aura} /></span>;
}
