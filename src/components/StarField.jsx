import { useEffect, useRef } from 'react';

// The auth screen sits on an animated particle canvas that the user can pause
// with the "Particles" control.
export default function StarField({ running = true }) {
  const ref = useRef(null);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let stars = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(160, Math.round((w * h) / 9000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3,
        a: Math.random() * 0.6 + 0.2,
        vy: Math.random() * 0.12 + 0.02,
        tw: Math.random() * 0.02 + 0.004
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.a += s.tw * (Math.random() > 0.5 ? 1 : -1);
        if (s.a < 0.15) s.a = 0.15;
        if (s.a > 0.9) s.a = 0.9;
        s.y -= s.vy;
        if (s.y < -2) { s.y = h + 2; s.x = Math.random() * w; }
        ctx.globalAlpha = s.a;
        ctx.fillStyle = '#dfe7ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);

    if (running) raf.current = requestAnimationFrame(draw);
    else draw(); // paint one static frame

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', resize);
    };
  }, [running]);

  return <canvas className="star-field" ref={ref} aria-hidden="true" />;
}
