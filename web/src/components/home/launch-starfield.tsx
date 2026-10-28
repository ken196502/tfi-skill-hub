"use client";

import { useEffect, useRef } from "react";

/** Cached particle sprites keep the slow star rivers and blooms inexpensive. */
export function LaunchStarfield({ paused, center }: {
  paused: boolean;
  center: { x: number; y: number; scale: number };
}) {
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
    // Create gradients once; each frame only copies small cached images.
    const makeSprite = (color: string, angle?: number) => {
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 64;
      const paint = sprite.getContext("2d")!;
      if (angle !== undefined) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const trail = paint.createLinearGradient(32 - dx * 26, 32 - dy * 26, 32, 32);
        trail.addColorStop(0, "transparent");
        trail.addColorStop(1, color);
        paint.strokeStyle = trail;
        paint.lineWidth = 1.4;
        paint.lineCap = "round";
        paint.beginPath();
        paint.moveTo(32 - dx * 26, 32 - dy * 26);
        paint.lineTo(32, 32);
        paint.stroke();
      }
      const glow = paint.createRadialGradient(32, 32, 0, 32, 32, 8);
      glow.addColorStop(0, color);
      glow.addColorStop(0.15, color);
      glow.addColorStop(1, "transparent");
      paint.fillStyle = glow;
      paint.fillRect(24, 24, 16, 16);
      return sprite;
    };
    const colors = ["#def8ff", "#ffffff", "#89dcff", "#499bff", "#ffe5a5"];
    const sprites = colors.map((color) => makeSprite(color));
    const stars = Array.from({ length: 1000 }, (_, index) => ({
      side: index % 2 ? 1 : -1,
      t: random(),
      spread: (random() + random() + random() - 1.5) * 0.105,
      lane: random(),
      size: 0.35 + random() ** 3 * 2,
      phase: random() * Math.PI * 2,
      speed: 0.008 + random() * 0.018,
      color: Math.floor(random() * 12) % colors.length,
    }));
    const dust = Array.from({ length: 180 }, () => ({
      x: random(), y: random(), size: 0.3 + random() * 0.8, alpha: 0.15 + random() * 0.3,
    }));
    const sparks = Array.from({ length: 96 }, (_, index) => {
      const angle = index / 96 * Math.PI * 2 + (random() - 0.5) * 0.035;
      return {
        dx: Math.cos(angle), dy: Math.sin(angle),
        reach: 0.7 + random() * 0.55,
        delay: random() * 0.12,
        size: 0.6 + random() * 1.2,
        sprite: makeSprite(index % 17 === 0 ? "#ffe5a5" : index % 3 === 0 ? "#ffffff" : "#87e6ff", angle),
      };
    });
    // Look up the river curve instead of recalculating powers per particle.
    const curve = Array.from({ length: 1025 }, (_, step) => {
      const t = step / 1024;
      return {
        x: 0.055 + 0.49 * (1 - t) ** 0.7,
        y: 0.025 + 0.88 * t ** 0.62,
        spread: 0.55 + Math.sin(t * Math.PI) * 0.65,
      };
    });
    const backdrop = document.createElement("canvas");
    const backdropCtx = backdrop.getContext("2d")!;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let elapsed = 0;
    let last = 0;
    const draw = (time: number) => {
      const animated = !paused && !document.hidden && !reducedMotion.matches;
      // Ambient motion is slow: 30 fps leaves time for the digits and handprints.
      if (animated && last && time - last < 1000 / 30 - 1) {
        frame = requestAnimationFrame(draw);
        return;
      }
      if (last && animated) elapsed += Math.min(time - last, 100) / 1000;
      last = time;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(backdrop, 0, 0, width, height);
      const scale = Math.max(0.65, Math.min(width / 1280, 1.6));
      const cx = center.x * width;
      const cy = center.y * height;
      const reach = Math.min(width * 0.32, height * 0.46) * center.scale;
      for (let bloom = 0; bloom < 2; bloom++) {
        for (const spark of sparks) {
          const progress = ((elapsed / 6 + bloom * 0.5 + 0.25 - spark.delay) % 1 + 1) % 1;
          const radius = (0.06 + (1 - (1 - progress) ** 1.65) * spark.reach) * reach;
          const x = cx + spark.dx * radius;
          const y = cy + spark.dy * radius + progress * progress * reach * 0.055;
          const size = 64 * scale * (0.65 + spark.size * 0.25);
          ctx.globalAlpha = Math.sin(progress * Math.PI) ** 1.4 * 0.6;
          ctx.drawImage(spark.sprite, x - size / 2, y - size / 2, size, size);
        }
      }
      for (const star of stars) {
        const t = (star.t + elapsed * star.speed) % 1;
        const point = curve[Math.floor(t * 1024)];
        const x = (0.5 + star.side * point.x + star.spread * point.spread) * width;
        const y = (point.y + (star.lane - 0.5) * 0.08) * height;
        const radius = star.size * scale;
        const fade = Math.min(1, t * 15, (1 - t) * 12);
        ctx.globalAlpha = fade * (0.725 + 0.275 * Math.sin(elapsed * (0.8 + star.lane) + star.phase)) * 0.85;
        if (star.size > 1.5) {
          const size = radius * 24;
          ctx.drawImage(sprites[star.color], x - size / 2, y - size / 2, size, size);
        } else {
          ctx.fillStyle = colors[star.color];
          ctx.fillRect(x, y, radius * 1.5, radius * 1.5);
        }
      }
      ctx.globalAlpha = 1;
      if (animated) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      // Cap the backing store at one million pixels, including on 4K/Retina screens.
      const resolution = Math.min(1, Math.sqrt(1_000_000 / Math.max(1, width * height)));
      canvas.width = Math.max(1, Math.round(width * resolution));
      canvas.height = Math.max(1, Math.round(height * resolution));
      ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
      backdrop.width = canvas.width;
      backdrop.height = canvas.height;
      backdropCtx.setTransform(resolution, 0, 0, resolution, 0, 0);
      const scale = Math.max(0.65, Math.min(width / 1280, 1.6));
      backdropCtx.fillStyle = "#a3dcff";
      for (const star of dust) {
        backdropCtx.globalAlpha = star.alpha;
        backdropCtx.fillRect(star.x * width, star.y * height, star.size * scale, star.size * scale);
      }
      // Static orbit lines and distant dust are painted only when the canvas resizes.
      for (const side of [-1, 1]) {
        for (let lane = 0; lane < 3; lane++) {
          backdropCtx.beginPath();
          for (let step = 0; step <= 100; step++) {
            const point = curve[Math.round(step / 100 * 1024)];
            const x = (0.5 + side * (point.x + lane * 0.013)) * width;
            const y = (point.y - lane * 0.032) * height;
            if (!step) backdropCtx.moveTo(x, y); else backdropCtx.lineTo(x, y);
          }
          backdropCtx.globalAlpha = lane === 1 ? 0.18 : 0.08;
          backdropCtx.strokeStyle = lane === 1 ? "#ffe6af" : "#95dfff";
          backdropCtx.lineWidth = 0.65 * scale;
          backdropCtx.stroke();
        }
      }
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
  }, [paused, center.x, center.y, center.scale]);

  return <canvas ref={canvasRef} className="launch-starfield" aria-hidden="true" />;
}
