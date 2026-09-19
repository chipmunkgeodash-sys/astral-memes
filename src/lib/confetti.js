// A quick burst of confetti from a point on screen (the centre by default).
// Plain DOM, cleaned up when the animation ends; skipped for reduced motion.

const COLOURS = ['#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#facc15'];

export function confetti({ x = window.innerWidth / 2, y = window.innerHeight / 2, count = 80 } = {}) {
  if (document.documentElement.getAttribute('data-motion') === 'reduced') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let i = 0; i < count; i += 1) {
    const bit = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const power = 120 + Math.random() * 320;
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    bit.style.background = COLOURS[i % COLOURS.length];
    bit.style.setProperty('--dx', `${Math.cos(angle) * power}px`);
    bit.style.setProperty('--dy', `${Math.sin(angle) * power - 160}px`);
    bit.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    bit.style.setProperty('--dur', `${0.9 + Math.random() * 0.8}s`);
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2000);
}

export const confettiFrom = (el, count) => {
  const r = el?.getBoundingClientRect?.();
  confetti(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, count } : { count });
};
