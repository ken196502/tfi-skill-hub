"use client";

import { Hand } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/i18n";

/**
 * Home-page teaser (easter egg). Press `0` anywhere on the landing page:
 * a black curtain drops in with 「即将发布」 and a row of handprints, the
 * wheel resizes the prints, ↑/↓ slides them, Enter runs a 5-4-1 countdown
 * that detonates and lifts the curtain off the page.
 */

type Stage = "hidden" | "title" | "countdown" | "boom";

const COUNTDOWN_FROM = 5;
/** One beat per digit. */
const TICK_MS = 800;
/** Flash + shockwave + particles + curtain lift; keep in sync with the CSS. */
const BOOM_MS = 1180;

const HANDS = 7;

/** Per-print tilt and drift so the row reads as prints rather than copies. */
const HAND_SHAPES = [
  { rotate: -8, mirror: false, dy: 5 },
  { rotate: 5, mirror: true, dy: -3 },
  { rotate: -4, mirror: false, dy: 7 },
  { rotate: 9, mirror: true, dy: 0 },
  { rotate: -6, mirror: false, dy: 4 },
  { rotate: 3, mirror: true, dy: -5 },
  { rotate: -9, mirror: false, dy: 6 },
];

/** Mostly white embers with a few warm brand sparks. */
const PARTICLE_COLORS = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#fdf898", "#fae752"];

const SCALE_MIN = 0.45;
const SCALE_MAX = 2.4;
const SHIFT_STEP = 16;
const SHIFT_MIN = -240;
const SHIFT_MAX = 340;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Never hijack keystrokes aimed at a field. */
function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
}

function makeParticles() {
  return Array.from({ length: 90 }, (_, index) => {
    const angle = (index / 90) * Math.PI * 2 + Math.random() * 0.22;
    const distance = 170 + Math.random() * 660;
    return {
      id: index,
      // Wider than tall so the blast matches the screen.
      tx: Math.cos(angle) * distance * 1.35,
      ty: Math.sin(angle) * distance * 0.8,
      size: 4 + Math.random() * 10,
      duration: 820 + Math.random() * 560,
      delay: Math.random() * 70,
      round: Math.random() > 0.18,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    };
  });
}

export function LaunchOverlay() {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>("hidden");
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [scale, setScale] = useState(1);
  const [shift, setShift] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setStage("hidden");
  }, [clearTimers]);

  /** Enter → 5 · 4 · 3 · 2 · 1 → boom → back to the page. */
  const detonate = useCallback(() => {
    clearTimers();
    setStage("countdown");
    setCount(COUNTDOWN_FROM);

    let next = COUNTDOWN_FROM;
    const beat = () => {
      next -= 1;
      if (next >= 1) {
        setCount(next);
        timers.current.push(window.setTimeout(beat, TICK_MS));
        return;
      }
      // Last digit has had its beat — go straight to the blast so the screen
      // never sits empty between the countdown and the explosion.
      setStage("boom");
      timers.current.push(window.setTimeout(() => setStage("hidden"), BOOM_MS));
    };

    timers.current.push(window.setTimeout(beat, TICK_MS));
  }, [clearTimers]);

  // Summon + in-curtain controls.
  useEffect(() => {
    if (stage === "hidden") {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.repeat || isTyping(event.target)) return;
        if (event.key !== "0" || event.metaKey || event.ctrlKey || event.altKey) return;
        setScale(1);
        setShift(0);
        setCount(COUNTDOWN_FROM);
        setStage("title");
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (stage !== "title") return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setShift((value) => clamp(value - SHIFT_STEP, SHIFT_MIN, SHIFT_MAX));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setShift((value) => clamp(value + SHIFT_STEP, SHIFT_MIN, SHIFT_MAX));
      } else if (event.key === "Enter") {
        event.preventDefault();
        detonate();
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (stage !== "title") return;
      event.preventDefault();
      setScale((value) => clamp(value * Math.exp(-event.deltaY * 0.0016), SCALE_MIN, SCALE_MAX));
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
    };
  }, [stage, close, detonate]);

  // Freeze the page behind the curtain, and drop every pending timer on unmount.
  useEffect(() => {
    if (stage === "hidden") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [stage]);

  useEffect(() => clearTimers, [clearTimers]);

  const particles = useMemo(() => (stage === "boom" ? makeParticles() : []), [stage]);

  if (stage === "hidden") return null;

  return (
    <div className={stage === "boom" ? "launch-root launch-boom-out" : "launch-root"} aria-hidden>
      <div className="launch-glow" />

      {stage === "boom" ? (
        <div className="launch-boom">
          <div className="launch-flash" />
          <div className="launch-core" />
          <div className="launch-rays" />
          <div className="launch-ring" />
          <div className="launch-ring launch-ring-late" />
          {particles.map((particle) => (
            <span
              key={particle.id}
              className="launch-particle"
              style={
                {
                  width: particle.size,
                  height: particle.size,
                  background: particle.color,
                  boxShadow: `0 0 12px ${particle.color}`,
                  borderRadius: particle.round ? "9999px" : "1px",
                  animationDuration: `${particle.duration}ms`,
                  animationDelay: `${particle.delay}ms`,
                  "--tx": `${particle.tx}px`,
                  "--ty": `${particle.ty}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : (
        // Title and countdown share one slot: the handprints stay mounted and
        // untouched, only the word above them swaps for the digit.
        <div className="launch-center">
          <div className="launch-word">
            <h2
              className={stage === "countdown" ? "launch-title launch-title-muted" : "launch-title"}
            >
              {t("home.launchSoon")}
            </h2>
            {stage === "countdown" ? (
              <div className="launch-count-slot">
                <div key={`ring-${count}`} className="launch-count-ring" />
                <div key={`digit-${count}`} className="launch-count">
                  {count}
                </div>
              </div>
            ) : null}
          </div>
          <div className="launch-hands" style={{ transform: `translateY(${shift}px)` }}>
            {HAND_SHAPES.slice(0, HANDS).map((shape, index) => (
              <Hand
                key={index}
                className="launch-hand"
                strokeWidth={1.4}
                style={
                  {
                    width: `calc(var(--hand-base) * ${scale})`,
                    height: `calc(var(--hand-base) * ${scale})`,
                    marginTop: shape.dy,
                    rotate: `${shape.rotate}deg`,
                    scale: shape.mirror ? "-1 1" : undefined,
                    "--i": index,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
