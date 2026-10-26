"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { BrandLogo } from "@/components/common/brand-logo";
import { Handprint } from "@/components/home/handprint";
import { playBoom, playTick } from "@/components/home/launch-audio";
import { useI18n } from "@/i18n";

/**
 * Home-page teaser (easter egg).
 *
 * `0` plays it: a black curtain drops in with 「即将发布」 and a row of
 * handprints, Enter runs a 5-4-1 countdown that detonates and lifts the
 * curtain off the page.
 *
 * `1` opens the layout editor: drag either block to move it, scroll to resize,
 * arrows to nudge. Positions are stored as fractions of the viewport, so a
 * layout tuned on a laptop lands the same way on a smaller venue screen.
 */

type Stage = "hidden" | "title" | "countdown" | "boom";
type BlockId = "title" | "hands";

interface BlockLayout {
  /** Centre of the block, as a fraction of the viewport (0–1). */
  x: number;
  y: number;
  /** Multiplier on top of the responsive base size. */
  scale: number;
}

type Layout = Record<BlockId, BlockLayout>;

interface DragState {
  kind: "move" | "size";
  block: BlockId;
  /** Screen start point, and the block centre it started from. */
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  startScale: number;
  startDistance: number;
}

const COUNTDOWN_FROM = 5;
/** One beat per digit. */
const TICK_MS = 800;
/** Flash + shockwave + particles + curtain lift; keep in sync with the CSS.
 *  The glow burns down over ~3s, so the curtain holds black until 2.1s. */
const BOOM_MS = 3250;

/** Three prints per side, mirrored about the centre — right hands | left hands. */
const HANDS_PER_SIDE = 3;

/** Print box is 1250 × 1290, so height follows width at this ratio. */
const HAND_RATIO = 1290 / 1250;

/** Mostly white embers with a few warm brand sparks. */
const PARTICLE_COLORS = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#fdf898", "#fae752"];

/** Autosaved layout. Bump the suffix if the shape ever changes. */
const STORAGE_KEY = "tfi.launch.layout.v1";

/** Matches the composition the curtain had before it became editable. */
const DEFAULT_LAYOUT: Layout = {
  title: { x: 0.5, y: 0.44, scale: 1 },
  hands: { x: 0.5, y: 0.68, scale: 1 },
};

const SCALE_MIN = 0.25;
const SCALE_MAX = 3.5;
const SCALE_STEP = 1.08;
/** Arrow-key nudge, in viewport fractions (Shift = 5×). */
const NUDGE = 0.002;

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

function readBlock(value: unknown, fallback: BlockLayout): BlockLayout {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const num = (candidate: unknown, byDefault: number) =>
    typeof candidate === "number" && Number.isFinite(candidate) ? candidate : byDefault;
  return {
    x: clamp(num(raw.x, fallback.x), 0, 1),
    y: clamp(num(raw.y, fallback.y), 0, 1),
    scale: clamp(num(raw.scale, fallback.scale), SCALE_MIN, SCALE_MAX),
  };
}

function readLayout(): Layout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      title: readBlock(parsed?.title, DEFAULT_LAYOUT.title),
      hands: readBlock(parsed?.hands, DEFAULT_LAYOUT.hands),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
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
      duration: 1200 + Math.random() * 1200,
      delay: Math.random() * 70,
      round: Math.random() > 0.18,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    };
  });
}

function ResizeGlyph() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden focusable="false">
      <path
        d="M3.6 10.4 L10.4 3.6 M4.8 3.6 H10.4 V9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LaunchOverlay() {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>("hidden");
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [selected, setSelected] = useState<BlockId>("title");
  const timers = useRef<number[]>([]);
  const drag = useRef<DragState | null>(null);
  const hovered = useRef<BlockId | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setEditing(false);
    setStage("hidden");
  }, [clearTimers]);

  /** Enter → 5 · 4 · 3 · 2 · 1 → boom → back to the page. */
  const detonate = useCallback(() => {
    clearTimers();
    setStage("countdown");
    setCount(COUNTDOWN_FROM);
    playTick(COUNTDOWN_FROM);

    let next = COUNTDOWN_FROM;
    const beat = () => {
      next -= 1;
      if (next >= 1) {
        setCount(next);
        playTick(next);
        timers.current.push(window.setTimeout(beat, TICK_MS));
        return;
      }
      // Last digit has had its beat — go straight to the blast so the screen
      // never sits empty between the countdown and the explosion.
      setStage("boom");
      playBoom();
      timers.current.push(window.setTimeout(() => setStage("hidden"), BOOM_MS));
    };

    timers.current.push(window.setTimeout(beat, TICK_MS));
  }, [clearTimers]);

  const open = useCallback((mode: "play" | "edit") => {
    clearTimers();
    setCount(COUNTDOWN_FROM);
    setEditing(mode === "edit");
    setStage("title");
  }, [clearTimers]);

  const updateBlock = useCallback((block: BlockId, patch: Partial<BlockLayout>) => {
    setLayout((prev) => ({ ...prev, [block]: { ...prev[block], ...patch } }));
  }, []);

  const scaleBy = useCallback(
    (factor: number) => {
      setLayout((prev) => ({
        ...prev,
        [selected]: {
          ...prev[selected],
          scale: clamp(prev[selected].scale * factor, SCALE_MIN, SCALE_MAX),
        },
      }));
    },
    [selected],
  );

  // Every tweak is written straight through — there is no "save" button to miss.
  // Comparing against the layout we started with keeps a visitor who never
  // opens the editor from leaving anything behind (every edit makes a new
  // object, so identity is enough).
  const initialLayout = useRef(layout);
  useEffect(() => {
    if (layout === initialLayout.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Private mode / quota — the show still runs on the defaults.
    }
  }, [layout]);

  // `0` plays, `1` edits. Inside the curtain: Enter detonates, Esc leaves,
  // arrows nudge the selected block while editing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTyping(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;

      if (stage === "hidden") {
        if (key === "0") {
          event.preventDefault();
          open("play");
        } else if (key === "1") {
          event.preventDefault();
          open("edit");
        }
        return;
      }

      if (key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (stage !== "title") return;

      if (key === "1" && !editing) {
        event.preventDefault();
        setEditing(true);
        return;
      }
      if (key === "0" && editing) {
        event.preventDefault();
        setEditing(false);
        return;
      }

      if (editing) {
        if (key === "Enter") {
          event.preventDefault();
          setEditing(false);
          detonate();
          return;
        }
        const step = event.shiftKey ? NUDGE * 5 : NUDGE;
        const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
        const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
        if (!dx && !dy) return;
        event.preventDefault();
        setLayout((prev) => ({
          ...prev,
          [selected]: {
            ...prev[selected],
            x: clamp(prev[selected].x + dx, 0, 1),
            y: clamp(prev[selected].y + dy, 0, 1),
          },
        }));
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        detonate();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stage, editing, selected, close, detonate, open]);

  // Wheel over a block resizes it. React's own wheel listener is passive, so
  // the browser cannot be stopped from scrolling unless we add ours natively.
  // Chrome retargets wheel events to the nearest scroll container, so the
  // hovered block (not `event.target`) decides what grows.
  useEffect(() => {
    if (!editing || stage !== "title") return;
    const node = stageRef.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      let block = hovered.current;
      if (event.clientX || event.clientY) {
        const under = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest("[data-block]");
        const id = under?.getAttribute("data-block") as BlockId | null;
        if (id) block = id;
      }
      block ??= selected;

      const factor = Math.exp(-event.deltaY * 0.0015);
      setSelected(block);
      setLayout((prev) => ({
        ...prev,
        [block]: {
          ...prev[block],
          scale: clamp(prev[block].scale * factor, SCALE_MIN, SCALE_MAX),
        },
      }));
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [editing, stage, selected]);

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

  const beginDrag = (block: BlockId) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(block);
    drag.current = {
      kind: "move",
      block,
      startX: event.clientX,
      startY: event.clientY,
      originX: layout[block].x,
      originY: layout[block].y,
      startScale: layout[block].scale,
      startDistance: 0,
    };
  };

  const beginResize = (block: BlockId) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(block);

    const centreX = layout[block].x * (window.innerWidth || 1);
    const centreY = layout[block].y * (window.innerHeight || 1);
    drag.current = {
      kind: "size",
      block,
      startX: event.clientX,
      startY: event.clientY,
      originX: layout[block].x,
      originY: layout[block].y,
      startScale: layout[block].scale,
      // Floored so a grab right on the centre does not explode the scale.
      startDistance: Math.max(
        24,
        Math.hypot(event.clientX - centreX, event.clientY - centreY),
      ),
    };
  };

  const onDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state) return;
    event.preventDefault();

    if (state.kind === "move") {
      const viewportWidth = window.innerWidth || 1;
      const viewportHeight = window.innerHeight || 1;
      updateBlock(state.block, {
        x: clamp(state.originX + (event.clientX - state.startX) / viewportWidth, 0, 1),
        y: clamp(state.originY + (event.clientY - state.startY) / viewportHeight, 0, 1),
      });
      return;
    }

    const centreX = state.originX * (window.innerWidth || 1);
    const centreY = state.originY * (window.innerHeight || 1);
    const distance = Math.hypot(event.clientX - centreX, event.clientY - centreY);
    updateBlock(state.block, {
      scale: clamp((state.startScale * distance) / state.startDistance, SCALE_MIN, SCALE_MAX),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture already gone (pointer left the window) — nothing to release.
    }
  };

  const particles = useMemo(() => (stage === "boom" ? makeParticles() : []), [stage]);

  if (stage === "hidden") return null;

  const block = (id: BlockId, label: string, content: ReactNode) => {
    const state = layout[id];
    const classes = [
      "launch-block",
      editing ? "launch-block-editing" : "",
      editing && selected === id ? "launch-block-selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        key={id}
        data-block={id}
        className={classes}
        style={
          {
            left: `${state.x * 100}%`,
            top: `${state.y * 100}%`,
            "--block-scale": state.scale,
            // Keeps the editor chrome at a constant size while the art zooms.
            "--block-inverse": 1 / state.scale,
          } as CSSProperties
        }
        onPointerDown={beginDrag(id)}
        onPointerEnter={() => {
          hovered.current = id;
        }}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {content}
        {editing ? (
          <>
            <span className="launch-block-label">{label}</span>
            <span
              className="launch-block-handle"
              role="presentation"
              onPointerDown={beginResize(id)}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <ResizeGlyph />
            </span>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={
        stage === "boom" ? "launch-root launch-boom-out" : "launch-root"
      }
      aria-hidden={editing ? undefined : true}
    >
      <div className="launch-glow" />
      {/* Slow rotating rays behind the word — 10% opacity, always running. */}
      <div className="launch-halo" />

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
        <>
          <div className="launch-stage" ref={stageRef}>
            {/* Title and countdown share one slot: the handprints stay mounted
                and untouched, only the word above them swaps for the digit. */}
            {block(
              "title",
              t("home.launchCfgBlockTitle"),
              <div className="launch-center">
                <div
                  className={
                    stage === "countdown" ? "launch-brand launch-brand-muted" : "launch-brand"
                  }
                >
                  <BrandLogo />
                </div>
                <div className="launch-word">
                  <h2
                    className={
                      stage === "countdown" ? "launch-title launch-title-muted" : "launch-title"
                    }
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
              </div>,
            )}

            {block(
              "hands",
              t("home.launchCfgBlockHands"),
              <div className="launch-hands">
                {Array.from({ length: HANDS_PER_SIDE * 2 }, (_, index) => {
                  // Left trio is the source art (left hand); right trio is mirrored.
                  const mirror = index >= HANDS_PER_SIDE;
                  return (
                    <span
                      key={index}
                      className="launch-hand"
                      style={
                        {
                          // Base size only — the block's own scale does the zooming.
                          width: "var(--hand-base)",
                          height: `calc(var(--hand-base) * ${HAND_RATIO})`,
                          "--i": index,
                        } as CSSProperties
                      }
                    >
                      <Handprint style={{ transform: `scaleX(${mirror ? -1 : 1})` }} />
                    </span>
                  );
                })}
              </div>,
            )}
          </div>

          {editing ? (
            <div className="launch-cfg">
              <div className="launch-cfg-row">
                <button
                  type="button"
                  className="launch-cfg-chip"
                  data-on={selected === "title" ? "true" : "false"}
                  onClick={() => setSelected("title")}
                >
                  {t("home.launchCfgBlockTitle")}
                </button>
                <button
                  type="button"
                  className="launch-cfg-chip"
                  data-on={selected === "hands" ? "true" : "false"}
                  onClick={() => setSelected("hands")}
                >
                  {t("home.launchCfgBlockHands")}
                </button>
              </div>

              <div className="launch-cfg-row">
                <span className="launch-cfg-label">{t("home.launchCfgSize")}</span>
                <button
                  type="button"
                  className="launch-cfg-step"
                  aria-label="-"
                  onClick={() => scaleBy(1 / SCALE_STEP)}
                >
                  −
                </button>
                <span className="launch-cfg-value">
                  {Math.round(layout[selected].scale * 100)}%
                </span>
                <button
                  type="button"
                  className="launch-cfg-step"
                  aria-label="+"
                  onClick={() => scaleBy(SCALE_STEP)}
                >
                  +
                </button>
                <span className="launch-cfg-divider" />
                <button type="button" onClick={() => setLayout(DEFAULT_LAYOUT)}>
                  {t("home.launchCfgReset")}
                </button>
                <button
                  type="button"
                  className="launch-cfg-play"
                  onClick={() => {
                    setEditing(false);
                    detonate();
                  }}
                >
                  {t("home.launchCfgPlay")}
                </button>
              </div>

              <p className="launch-cfg-hint">{t("home.launchCfgHint")}</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
