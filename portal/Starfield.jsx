import { useEffect, useRef } from 'react';

// Stars falling toward the portal at the centre of the screen.
//
// Deliberately not the member app's Particles component: that one drifts
// sideways and links neighbours, this one pulls everything inward so the ring
// reads as something you travel through. Pauses with the tab, and holds still
// for anyone who asked for reduced motion.
export default function Starfield() {
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
    let stars = [];

    const spawn = () => {
      // Polar coordinates keep the drift radial without any per-frame trig.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * Math.max(w, h) * 0.75 + 40;
      return {
        angle,
        radius,
        speed: Math.random() * 0.22 + 0.06,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.6 + 0.2
      };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.min(160, Math.round((w * h) / 11000)) }, spawn);
    };

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;

      for (const star of stars) {
        star.radius -= star.speed * (star.radius * 0.012 + 0.4);
        // Swallowed by the portal — send it back out to the edge.
        if (star.radius < 30) Object.assign(star, spawn(), { radius: Math.max(w, h) * 0.8 });

        const x = cx + Math.cos(star.angle) * star.radius;
        const y = cy + Math.sin(star.angle) * star.radius * 0.72;

        // Fade in from the edge and back out into the ring.
        const edge = Math.min(1, star.radius / (Math.max(w, h) * 0.55));
        const core = Math.min(1, (star.radius - 30) / 90);
        ctx.fillStyle = `rgba(126,231,214,${star.alpha * (1 - edge * 0.55) * core})`;
        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };

    const start = () => { if (!raf && !reduced) raf = requestAnimationFrame(frame); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    if (reduced) frame(); else start();

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas className="starfield" ref={ref} aria-hidden="true" />;
}
