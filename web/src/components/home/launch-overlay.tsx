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
import {
  playCountdownAudio,
  preloadCountdownAudio,
  stopCountdownAudio,
} from "@/components/home/launch-audio";
import { useI18n } from "@/i18n";
import { Eye, EyeOff } from "lucide-react";

/**
 * Home-page launch curtain.
 *
 * It is shown by default on the home page with 「即将发布」 and a row of
 * handprints. Double-Enter runs a 5-4-1 countdown that detonates and lifts
 * the curtain off the page.
 *
 * `1` opens the layout editor: drag the title or any individual hand to move
 * it, scroll to resize, and use the eye buttons to toggle individual hands.
 * All hands share one scale value. Positions are stored as fractions of the
 * viewport, so a layout tuned on a laptop lands the same way on a smaller
 * venue screen.
 */

type Stage = "hidden" | "title" | "countdown" | "boom";
type Selection = "title" | number;
type IntroState = "visible" | "fading" | "hidden";

interface BlockLayout {
  /** Centre of the block, as a fraction of the viewport (0–1). */
  x: number;
  y: number;
  /** Multiplier on top of the responsive base size. */
  scale: number;
}

interface HandLayout {
  /** Centre of this hand, as a fraction of the viewport (0–1). */
  x: number;
  y: number;
  visible: boolean;
}

interface HandsLayout {
  /** One shared multiplier for all handprints. */
  scale: number;
  items: HandLayout[];
}

interface Layout {
  title: BlockLayout;
  hands: HandsLayout;
  /** How long the title remains visible after double-Enter, in milliseconds. */
  titleHoldMs: number;
}

interface DragState {
  kind: "move" | "size";
  selection: Selection;
  /** Screen start point, and the block centre it started from. */
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  startScale: number;
  startDistance: number;
}

const COUNTDOWN_FROM = 5;
/** The visible digit is split into enter → hold → exit phases. */
const COUNTDOWN_ENTER_MS = 150;
const COUNTDOWN_EXIT_MS = 150;
/** The countdown changes digits every 3 seconds. */
const COUNTDOWN_BEAT_MS = 3000;
const COUNTDOWN_HOLD_MS = COUNTDOWN_BEAT_MS - COUNTDOWN_ENTER_MS - COUNTDOWN_EXIT_MS;
/** Keep the soundtrack's established one-second delay after double-Enter. */
const COUNTDOWN_AUDIO_DELAY_MS = 0;
/** The soundtrack's first audible countdown hit lands about 0.5s in. */
const COUNTDOWN_AUDIO_LEAD_MS = 0;
const TITLE_HOLD_MS_MIN = 0;
const TITLE_HOLD_MS_MAX = 5000;
const TITLE_HOLD_MS_STEP = 100;
const DEFAULT_TITLE_HOLD_MS = 500;
/** Require an intentional rapid double-Enter before starting playback. */
const DOUBLE_ENTER_WINDOW_MS = 450;
/** Let the reference intro cover the curtain before the headline appears. */
const INTRO_FADE_AT_MS = 2500;
const INTRO_FADE_MS = 500;
const INTRO_FALLBACK_MS = INTRO_FADE_AT_MS + INTRO_FADE_MS + 800;
/** Flash + shockwave + particles + curtain lift; keep in sync with the CSS.
 *  The glow burns down over ~3s, so the curtain holds black until 2.1s. */
const BOOM_MS = 3250;

/** Five prints per side, mirrored about the centre — left hands | right hands. */
const HANDS_PER_SIDE = 5;

/** Print box is 1250 × 1290, so height follows width at this ratio. */
const HAND_RATIO = 1290 / 1250;

/** Ice-blue sparks with a few pale-gold accents sampled from the reference. */
const PARTICLE_COLORS = [
  "#ffffff",
  "#e8fbff",
  "#b6f1ff",
  "#6de2ff",
  "#24bfff",
  "#6f9dff",
  "#ffe7a2",
];

/** Autosaved layout. Bump the suffix if the shape ever changes. */
const STORAGE_KEY = "tfi.launch.layout.v8";
const LEGACY_STORAGE_KEYS = [
  "tfi.launch.layout.v7",
  "tfi.launch.layout.v6",
  "tfi.launch.layout.v5",
  "tfi.launch.layout.v4",
  "tfi.launch.layout.v3",
  "tfi.launch.layout.v2",
  "tfi.launch.layout.v1",
];

/** Matches the composition the curtain had before it became editable. */
const DEFAULT_HAND_X = [0.24, 0.3, 0.36, 0.42, 0.47, 0.53, 0.58, 0.64, 0.7, 0.76];
const LEGACY_HANDS_POSITION = { x: 0.5, y: 0.68 };

function makeDefaultLayout(): Layout {
  return {
    title: { x: 0.5, y: 0.44, scale: 1 },
    hands: {
      scale: 1,
      items: DEFAULT_HAND_X.map((x) => ({ x, y: LEGACY_HANDS_POSITION.y, visible: true })),
    },
    titleHoldMs: DEFAULT_TITLE_HOLD_MS,
  };
}

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

function readHand(value: unknown, fallback: HandLayout): HandLayout {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const num = (candidate: unknown, byDefault: number) =>
    typeof candidate === "number" && Number.isFinite(candidate) ? candidate : byDefault;
  return {
    x: clamp(num(raw.x, fallback.x), 0, 1),
    y: clamp(num(raw.y, fallback.y), 0, 1),
    visible: typeof raw.visible === "boolean" ? raw.visible : fallback.visible,
  };
}

function readHands(value: unknown, fallback: HandsLayout): HandsLayout {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const num = (candidate: unknown, byDefault: number) =>
    typeof candidate === "number" && Number.isFinite(candidate) ? candidate : byDefault;
  const scale = clamp(num(raw.scale, fallback.scale), SCALE_MIN, SCALE_MAX);

  if (Array.isArray(raw.items)) {
    const items = raw.items as unknown[];
    if (items.length < fallback.items.length) {
      // The v2 editor had three hands per side. Keep those hands on their
      // original side, then use the new five-per-side defaults for the rest.
      const migrated = [...fallback.items];
      const legacyPerSide = Math.floor(items.length / 2);
      items.forEach((item, index) => {
        const target =
          index < legacyPerSide ? index : HANDS_PER_SIDE + (index - legacyPerSide);
        if (target < migrated.length) migrated[target] = readHand(item, migrated[target]);
      });
      return { scale, items: migrated };
    }
    return {
      scale,
      items: fallback.items.map((hand, index) => readHand(items[index], hand)),
    };
  }

  // Migrate the original grouped-hand layout. Its x/y moved the whole row,
  // so apply that same offset to the new individual hand positions.
  const legacyX = num(raw.x, LEGACY_HANDS_POSITION.x);
  const legacyY = num(raw.y, LEGACY_HANDS_POSITION.y);
  const offsetX = legacyX - LEGACY_HANDS_POSITION.x;
  const offsetY = legacyY - LEGACY_HANDS_POSITION.y;
  return {
    scale,
    items: fallback.items.map((hand) => ({
      ...hand,
      x: clamp(hand.x + offsetX, 0, 1),
      y: clamp(hand.y + offsetY, 0, 1),
    })),
  };
}

function readTitleHoldMs(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(
    Math.round(value / TITLE_HOLD_MS_STEP) * TITLE_HOLD_MS_STEP,
    TITLE_HOLD_MS_MIN,
    TITLE_HOLD_MS_MAX,
  );
}

function readLayout(): Layout {
  const fallback = makeDefaultLayout();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]
      .map((key) => window.localStorage.getItem(key))
      .find((value): value is string => Boolean(value));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      title: readBlock(parsed?.title, fallback.title),
      hands: readHands(parsed?.hands, fallback.hands),
      titleHoldMs: readTitleHoldMs(parsed?.titleHoldMs, fallback.titleHoldMs),
    };
  } catch {
    return fallback;
  }
}

function getSelectionLayout(layout: Layout, selection: Selection): BlockLayout {
  if (selection === "title") return layout.title;
  const hand = layout.hands.items[selection] ?? layout.hands.items[0];
  return { x: hand.x, y: hand.y, scale: layout.hands.scale };
}

function parseSelection(value: string | null): Selection | null {
  if (value === "title") return "title";
  if (!value?.startsWith("hand-")) return null;
  const index = Number(value.slice("hand-".length));
  return Number.isInteger(index) && index >= 0 && index < HANDS_PER_SIDE * 2 ? index : null;
}

function makeParticles() {
  // Keep the burst dense enough to read as an explosion without creating a
  // separate animated, glowing layer for every spark on slower GPUs.
  const particleCount = 48;
  return Array.from({ length: particleCount }, (_, index) => {
    const angle = (index / particleCount) * Math.PI * 2 + Math.random() * 0.22;
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
  // The launch teaser is the default home-page opening. Double-Enter plays it;
  // `1` reveals the editor while keeping the curtain in place.
  const [stage, setStage] = useState<Stage>("title");
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [countdownDigitVisible, setCountdownDigitVisible] = useState(false);
  const [introState, setIntroState] = useState<IntroState>("visible");
  const introVisible = introState !== "hidden";
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [selected, setSelected] = useState<Selection>("title");
  const timers = useRef<number[]>([]);
  const drag = useRef<DragState | null>(null);
  const hovered = useRef<Selection | null>(null);
  const lastEnterAt = useRef(0);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const finishIntro = useCallback(() => {
    setIntroState("hidden");
  }, []);

  const fadeIntro = useCallback(() => {
    setIntroState((current) => (current === "visible" ? "fading" : current));
  }, []);

  useEffect(() => {
    preloadCountdownAudio();
  }, []);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
    stopCountdownAudio();
  }, []);

  const close = useCallback(() => {
    clearTimers();
    lastEnterAt.current = 0;
    finishIntro();
    setEditing(false);
    setCountdownDigitVisible(false);
    setStage("hidden");
  }, [clearTimers, finishIntro]);

  /** Hold the title, then run 5 · 4 · 3 · 2 · 1 → boom → back to the page. */
  const detonate = useCallback(() => {
    clearTimers();
    lastEnterAt.current = 0;
    finishIntro();
    setStage("title");
    setCount(COUNTDOWN_FROM);
    setCountdownDigitVisible(false);

    // The title hold only adds time before the visual countdown. Keep the
    // soundtrack on its fixed one-second cue so changing the hold does not
    // move the music.
    timers.current.push(window.setTimeout(playCountdownAudio, COUNTDOWN_AUDIO_DELAY_MS));

    const startCountdown = () => {
      // Let the title-removal render commit first, then mount the first digit
      // on its own frame so 5 receives the same entrance animation as later
      // digits.
      setStage("countdown");
      setCountdownDigitVisible(false);
      timers.current.push(window.setTimeout(() => setCountdownDigitVisible(true), 0));

      let next = COUNTDOWN_FROM;
      const beat = () => {
        next -= 1;
        if (next >= 1) {
          setCount(next);
          timers.current.push(window.setTimeout(beat, COUNTDOWN_BEAT_MS));
          return;
        }
        // Last digit has had its beat — go straight to the blast so the screen
        // never sits empty between the countdown and the explosion.
        setStage("boom");
        timers.current.push(
          window.setTimeout(() => {
            stopCountdownAudio();
            setStage("hidden");
          }, BOOM_MS),
        );
      };

      timers.current.push(window.setTimeout(beat, COUNTDOWN_BEAT_MS));
    };

    // The audio has its fixed start delay, then a short lead-in before the
    // first hit. The configurable title hold is extra time on top of that.
    timers.current.push(
      window.setTimeout(
        startCountdown,
        COUNTDOWN_AUDIO_DELAY_MS + layout.titleHoldMs + COUNTDOWN_AUDIO_LEAD_MS,
      ),
    );
  }, [clearTimers, finishIntro, layout.titleHoldMs]);

  const openEditor = useCallback(() => {
    clearTimers();
    lastEnterAt.current = 0;
    finishIntro();
    setCount(COUNTDOWN_FROM);
    setCountdownDigitVisible(false);
    setEditing(true);
    setStage("title");
  }, [clearTimers, finishIntro]);

  const playAfterDoubleEnter = useCallback(() => {
    const now = Date.now();
    if (now - lastEnterAt.current <= DOUBLE_ENTER_WINDOW_MS) {
      lastEnterAt.current = 0;
      setEditing(false);
      detonate();
      return;
    }
    lastEnterAt.current = now;
  }, [detonate]);

  const updateSelection = useCallback((selection: Selection, patch: Partial<BlockLayout>) => {
    setLayout((prev) => {
      if (selection === "title") {
        return { ...prev, title: { ...prev.title, ...patch } };
      }
      const item = prev.hands.items[selection];
      if (!item) return prev;
      const { scale, ...handPatch } = patch;
      return {
        ...prev,
        hands: {
          ...prev.hands,
          // A hand's resize handle still updates the one shared scale.
          scale: scale === undefined ? prev.hands.scale : clamp(scale, SCALE_MIN, SCALE_MAX),
          items: prev.hands.items.map((hand, index) =>
            index === selection ? { ...hand, ...handPatch } : hand,
          ),
        },
      };
    });
  }, []);

  const toggleHand = useCallback((index: number) => {
    setLayout((prev) => ({
      ...prev,
      hands: {
        ...prev.hands,
        items: prev.hands.items.map((hand, handIndex) =>
          handIndex === index ? { ...hand, visible: !hand.visible } : hand,
        ),
      },
    }));
  }, []);

  const scaleBy = useCallback(
    (factor: number) => {
      setLayout((prev) => {
        if (selected === "title") {
          return {
            ...prev,
            title: {
              ...prev.title,
              scale: clamp(prev.title.scale * factor, SCALE_MIN, SCALE_MAX),
            },
          };
        }
        return {
          ...prev,
          hands: {
            ...prev.hands,
            scale: clamp(prev.hands.scale * factor, SCALE_MIN, SCALE_MAX),
          },
        };
      });
    },
    [selected],
  );

  const adjustTitleHold = useCallback((delta: number) => {
    setLayout((prev) => ({
      ...prev,
      titleHoldMs: clamp(
        prev.titleHoldMs + delta,
        TITLE_HOLD_MS_MIN,
        TITLE_HOLD_MS_MAX,
      ),
    }));
  }, []);

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

  // Double-Enter plays, `1` edits. Inside the curtain, Esc leaves and arrows
  // nudge the selected block while editing. `0` is intentionally inert.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTyping(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key !== "Enter") lastEnterAt.current = 0;

      if (stage === "hidden") {
        if (key === "1") {
          event.preventDefault();
          openEditor();
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

      if (editing) {
        if (key === "Enter") {
          event.preventDefault();
          playAfterDoubleEnter();
          return;
        }
        const step = event.shiftKey ? NUDGE * 5 : NUDGE;
        const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
        const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
        if (!dx && !dy) return;
        event.preventDefault();
        updateSelection(selected, {
          x: clamp(getSelectionLayout(layout, selected).x + dx, 0, 1),
          y: clamp(getSelectionLayout(layout, selected).y + dy, 0, 1),
        });
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        playAfterDoubleEnter();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    stage,
    editing,
    selected,
    layout,
    close,
    detonate,
    openEditor,
    playAfterDoubleEnter,
    updateSelection,
  ]);

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
      let selection = hovered.current;
      if (event.clientX || event.clientY) {
        const under = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest("[data-block]");
        const underSelection = parseSelection(under?.getAttribute("data-block") ?? null);
        if (underSelection !== null) selection = underSelection;
      }
      selection ??= selected;

      const factor = Math.exp(-event.deltaY * 0.0015);
      setSelected(selection);
      setLayout((prev) => {
        if (selection === "title") {
          return {
            ...prev,
            title: {
              ...prev.title,
              scale: clamp(prev.title.scale * factor, SCALE_MIN, SCALE_MAX),
            },
          };
        }
        return {
          ...prev,
          hands: {
            ...prev.hands,
            // Hovering any hand adjusts this one shared scale.
            scale: clamp(prev.hands.scale * factor, SCALE_MIN, SCALE_MAX),
          },
        };
      });
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

  // The muted clip normally ends itself after three seconds. The fallback
  // prevents a stalled media request from leaving the homepage covered.
  useEffect(() => {
    if (!introVisible) return;
    const fadeTimeout = window.setTimeout(fadeIntro, INTRO_FADE_AT_MS);
    const fallbackTimeout = window.setTimeout(finishIntro, INTRO_FALLBACK_MS);
    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(fallbackTimeout);
    };
  }, [fadeIntro, finishIntro, introVisible]);

  useEffect(() => clearTimers, [clearTimers]);

  const beginDrag = (selection: Selection) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const state = getSelectionLayout(layout, selection);
    setSelected(selection);
    drag.current = {
      kind: "move",
      selection,
      startX: event.clientX,
      startY: event.clientY,
      originX: state.x,
      originY: state.y,
      startScale: state.scale,
      startDistance: 0,
    };
  };

  const beginResize = (selection: Selection) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const state = getSelectionLayout(layout, selection);
    setSelected(selection);

    const centreX = state.x * (window.innerWidth || 1);
    const centreY = state.y * (window.innerHeight || 1);
    drag.current = {
      kind: "size",
      selection,
      startX: event.clientX,
      startY: event.clientY,
      originX: state.x,
      originY: state.y,
      startScale: state.scale,
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
      updateSelection(state.selection, {
        x: clamp(state.originX + (event.clientX - state.startX) / viewportWidth, 0, 1),
        y: clamp(state.originY + (event.clientY - state.startY) / viewportHeight, 0, 1),
      });
      return;
    }

    const centreX = state.originX * (window.innerWidth || 1);
    const centreY = state.originY * (window.innerHeight || 1);
    const distance = Math.hypot(event.clientX - centreX, event.clientY - centreY);
    updateSelection(state.selection, {
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

  const block = (id: "title", label: string, content: ReactNode) => {
    const state = layout.title;
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

  const hand = (index: number) => {
    const state = layout.hands.items[index];
    if (!state.visible) return null;

    const selectedHand = selected === index;
    const classes = [
      "launch-block",
      "launch-hand",
      editing ? "launch-block-editing" : "",
      editing && selectedHand ? "launch-block-selected" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const label = t("home.launchCfgHand", { index: index + 1 });

    return (
      <span
        key={index}
        data-block={`hand-${index}`}
        className={classes}
        style={
          {
            left: `${state.x * 100}%`,
            top: `${state.y * 100}%`,
            width: "var(--hand-base)",
            height: `calc(var(--hand-base) * ${HAND_RATIO})`,
            // All handprints deliberately read from the same scale value.
            "--block-scale": layout.hands.scale,
            "--block-inverse": 1 / layout.hands.scale,
          } as CSSProperties
        }
        onPointerDown={beginDrag(index)}
        onPointerEnter={() => {
          hovered.current = index;
        }}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="launch-hand-art" style={{ "--i": index } as CSSProperties}>
          <Handprint style={{ transform: `scaleX(${index >= HANDS_PER_SIDE ? -1 : 1})` }} />
        </span>
        {editing ? (
          <>
            <span className="launch-block-label">{label}</span>
            <span
              className="launch-block-handle"
              role="presentation"
              onPointerDown={beginResize(index)}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <ResizeGlyph />
            </span>
          </>
        ) : null}
      </span>
    );
  };

  const selectedScale = selected === "title" ? layout.title.scale : layout.hands.scale;

  return (
    <div
      className={[
        "launch-root",
        stage === "countdown" ? "launch-countdown" : "",
        stage === "boom" ? "launch-boom-out" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={editing ? undefined : true}
    >
      {introVisible ? (
        <div
          className={introState === "fading" ? "launch-intro launch-intro-fading" : "launch-intro"}
          style={{ "--intro-fade-ms": `${INTRO_FADE_MS}ms` } as CSSProperties}
          aria-hidden="true"
        >
          <video
            className="launch-intro-video"
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={finishIntro}
            onError={finishIntro}
          >
            <source src="/video/launch-intro-3s.mp4" type="video/mp4" />
          </video>
        </div>
      ) : null}
      <div className="launch-glow" />
      <div className="launch-ribbons" />
      {/* Slow rotating rays behind the word — a dimmed version of the reference burst. */}
      <div className="launch-halo" />
      <div className="launch-grain" />

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
            {/* Title and countdown share one slot; the handprints stay mounted
                and untouched, only the word above them swaps for the digit. */}
            {block(
              "title",
              t("home.launchCfgBlockTitle"),
              <div className="launch-center">
                <div
                  className={
                    stage !== "title" ? "launch-brand launch-brand-muted" : "launch-brand"
                  }
                >
                  <BrandLogo />
                </div>
                <div className="launch-word">
                  <h2
                    className={
                      stage !== "title" ? "launch-title launch-title-muted" : "launch-title"
                    }
                  >
                    {t("home.launchSoon")}
                  </h2>
                  {stage === "countdown" && countdownDigitVisible ? (
                    <div className="launch-count-slot">
                      <div key={`digit-${count}`} className="launch-count">
                        <span
                          className="launch-count-ink"
                          style={
                            {
                              "--countdown-hold-ms": `${COUNTDOWN_HOLD_MS}ms`,
                            } as CSSProperties
                          }
                        >
                          {count}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>,
            )}

            {Array.from({ length: HANDS_PER_SIDE * 2 }, (_, index) => hand(index))}
          </div>

          {editing ? (
            <div className="launch-cfg">
              <div className="launch-cfg-row launch-cfg-selection-row">
                <button
                  type="button"
                  className="launch-cfg-chip"
                  data-on={selected === "title" ? "true" : "false"}
                  onClick={() => setSelected("title")}
                >
                  {t("home.launchCfgBlockTitle")}
                </button>
                <span className="launch-cfg-label launch-cfg-group-label">
                  {t("home.launchCfgBlockHands")}
                </span>
                {layout.hands.items.map((item, index) => {
                  const label = t("home.launchCfgHand", { index: index + 1 });
                  return (
                    <span key={index} className="launch-cfg-hand-control">
                      <button
                        type="button"
                        className="launch-cfg-chip launch-cfg-hand-chip"
                        data-on={selected === index ? "true" : "false"}
                        data-hidden={item.visible ? "false" : "true"}
                        aria-pressed={selected === index}
                        aria-label={label}
                        title={label}
                        onClick={() => setSelected(index)}
                      >
                        {index + 1}
                      </button>
                      <button
                        type="button"
                        className="launch-cfg-visibility"
                        data-hidden={item.visible ? "false" : "true"}
                        aria-pressed={item.visible}
                        aria-label={t(
                          item.visible ? "home.launchCfgHideHand" : "home.launchCfgShowHand",
                          { index: index + 1 },
                        )}
                        title={t(
                          item.visible ? "home.launchCfgHideHand" : "home.launchCfgShowHand",
                          { index: index + 1 },
                        )}
                        onClick={() => {
                          setSelected(index);
                          toggleHand(index);
                        }}
                      >
                        {item.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                      </button>
                    </span>
                  );
                })}
              </div>

              <div className="launch-cfg-row">
                <span className="launch-cfg-label">{t("home.launchCfgTitleHold")}</span>
                <button
                  type="button"
                  className="launch-cfg-step"
                  aria-label="-"
                  onClick={() => adjustTitleHold(-TITLE_HOLD_MS_STEP)}
                >
                  −
                </button>
                <span className="launch-cfg-value">
                  {t("home.launchCfgSeconds", {
                    seconds: (layout.titleHoldMs / 1000).toFixed(1),
                  })}
                </span>
                <button
                  type="button"
                  className="launch-cfg-step"
                  aria-label="+"
                  onClick={() => adjustTitleHold(TITLE_HOLD_MS_STEP)}
                >
                  +
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
                  {Math.round(selectedScale * 100)}%
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
                <button
                  type="button"
                  onClick={() => {
                    setLayout(makeDefaultLayout());
                    setSelected("title");
                  }}
                >
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
