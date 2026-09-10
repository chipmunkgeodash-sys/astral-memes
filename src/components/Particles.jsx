import { useEffect, useRef } from 'react';

// Drifting starfield with links between nearby points. Sits behind everything,
// reads its colour from the current theme, and pauses when the tab is hidden.
export default function Particles({ density = 1 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let w = 0;
    let h = 0;
    let points = [];
    let tint = '139,139,240';

    const readTint = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c);
      if (m) tint = `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(120, Math.round((w * h) / 16000 * density));
      points = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: Math.random() * 1.6 + 0.6,
        a: Math.random() * 0.5 + 0.25
      }));
    };

    const frame = () => {
      ctx.clearRect(0, 0, w, h);

      // Links first, so dots sit on top of them.
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 15000) continue;
          ctx.strokeStyle = `rgba(${tint},${(1 - d2 / 15000) * 0.16})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }

      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;

        ctx.fillStyle = `rgba(${tint},${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };

    const start = () => { if (!raf && !reduced) raf = requestAnimationFrame(frame); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVisibility = () => (document.hidden ? stop() : start());

    readTint();
    resize();
    if (reduced) frame(); else start();

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);

    // Re-read the accent when the theme flips.
    const observer = new MutationObserver(readTint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [density]);

  return <canvas className="particles" ref={ref} aria-hidden="true" />;
}
