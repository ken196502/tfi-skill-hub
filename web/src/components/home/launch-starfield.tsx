"use client";

import { useEffect, useRef } from "react";

/** Two flowing, irregular star rivers curve from the edges into the lower centre. */
export function LaunchStarfield({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let seed = 7919;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const colors = ["#def8ff", "#ffffff", "#89dcff", "#499bff", "#ffe5a5"];
    const stars = Array.from({ length: 1800 }, (_, index) => ({
      side: index % 2 ? 1 : -1,
      t: random(),
      spread: (random() + random() + random() - 1.5) * 0.105,
      lane: random(),
      size: 0.35 + random() ** 3 * 2,
      phase: random() * Math.PI * 2,
      speed: 0.008 + random() * 0.018,
      color: colors[Math.floor(random() * 12) % colors.length],
    }));
    const dust = Array.from({ length: 180 }, () => ({
      x: random(), y: random(), size: 0.3 + random() * 0.8, phase: random() * 6.28,
    }));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let elapsed = 0;
    let last = 0;
    const draw = (time: number) => {
      if (last && !paused && !document.hidden && !reducedMotion.matches) {
        elapsed += Math.min(time - last, 50) / 1000;
      }
      last = time;
      ctx.clearRect(0, 0, width, height);
      const scale = Math.max(0.65, Math.min(width / 1280, 1.6));
      for (const star of dust) {
        ctx.globalAlpha = 0.15 + 0.18 * (1 + Math.sin(elapsed * 0.5 + star.phase));
        ctx.fillStyle = "#a3dcff";
        ctx.fillRect(star.x * width, star.y * height, star.size * scale, star.size * scale);
      }
      // Fine orbit lines follow the same curves as the particle ribbons.
      for (const side of [-1, 1]) {
        for (let lane = 0; lane < 3; lane++) {
          ctx.beginPath();
          for (let step = 0; step <= 100; step++) {
            const t = step / 100;
            const x = (0.5 + side * (0.055 + 0.49 * (1 - t) ** 0.7 + lane * 0.013)) * width;
            const y = (0.025 + 0.88 * t ** 0.62 - lane * 0.032) * height;
            if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.globalAlpha = lane === 1 ? 0.18 : 0.08;
          ctx.strokeStyle = lane === 1 ? "#ffe6af" : "#95dfff";
          ctx.lineWidth = 0.65 * scale;
          ctx.stroke();
        }
      }
      for (const star of stars) {
        const t = (star.t + elapsed * star.speed) % 1;
        const widthAtT = 0.55 + Math.sin(t * Math.PI) * 0.65;
        const x = (0.5 + star.side * (0.055 + 0.49 * (1 - t) ** 0.7)
          + star.spread * widthAtT) * width;
        const y = (0.025 + 0.88 * t ** 0.62 + (star.lane - 0.5) * 0.08) * height;
        const radius = star.size * scale;
        const fade = Math.min(1, t * 15, (1 - t) * 12);
        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(elapsed * (0.8 + star.lane) + star.phase));
        ctx.globalAlpha = fade * twinkle * 0.85;
        ctx.fillStyle = star.color;
        if (star.size > 1.5) {
          const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
          glow.addColorStop(0, star.color);
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fillRect(x - radius * 4, y - radius * 4, radius * 8, radius * 8);
          ctx.fillStyle = star.color;
        }
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!paused && !reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cancelAnimationFrame(frame);
      last = 0;
      draw(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", resize);
    reducedMotion.addEventListener("change", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", resize);
      reducedMotion.removeEventListener("change", resize);
    };
  }, [paused]);

  return <canvas ref={canvasRef} className="launch-starfield" aria-hidden="true" />;
}
