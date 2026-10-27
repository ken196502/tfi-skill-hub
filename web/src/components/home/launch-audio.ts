/**
 * Countdown sound for the launch teaser — Web Audio synthesis, no assets.
 *
 * The brief: a racing-game start cue, i.e. low, round "doo" hits rather than
 * bright beeps. Built from a triangle body at ~170 Hz plus a sine sub an
 * octave down and a tiny filtered click, so it lands soft and heavy instead of
 * shrill. The final beat drops lower/longer and lets the engine catch.
 */

let ctx: AudioContext | null = null;

let countdownVoice: SpeechSynthesisVoice | null = null;
let voiceChangeListenerAttached = false;
let pendingVoicePromise: Promise<SpeechSynthesisVoice | null> | null = null;
let speechRequestId = 0;

const COUNTDOWN_WORDS = ["零", "一", "二", "三", "四", "五"];
const FEMALE_VOICE_HINTS = [
  "tingting",
  "meijia",
  "sinji",
  "xiaoxiao",
  "xiaoyi",
  "huihui",
  "yaoyao",
  "female",
  "女",
];
const MALE_VOICE_HINTS = ["kangkang", "yunxi", "yunyang", "male", "男"];
const VOICE_LIST_TIMEOUT_MS = 750;

function speech(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function normalizeVoiceName(name: string) {
  return name.toLocaleLowerCase().replace(/[\s_-]+/g, "");
}

function chooseChineseVoice(voices: SpeechSynthesisVoice[]) {
  const chineseVoices = voices.filter((voice) => {
    const lang = voice.lang.toLowerCase().replace("_", "-");
    return lang.startsWith("zh-") || lang === "zh" || /中文|普通话|粤语|cantonese|chinese/i.test(voice.name);
  });

  const ranked = chineseVoices
    .map((voice) => {
      // macOS exposes its built-in female Mandarin voices as Ting-Ting,
      // Mei-Jia and Sin-ji. Normalising the name also covers variants such as
      // "Ting Ting" and "TingTing" returned by different browsers.
      const name = normalizeVoiceName(voice.name);
      const lang = voice.lang.toLowerCase().replace("_", "-");
      const femaleHint = FEMALE_VOICE_HINTS.some((hint) => name.includes(hint));
      const maleHint = MALE_VOICE_HINTS.some((hint) => name.includes(hint));
      const score =
        (femaleHint ? 1000 : 0) -
        (maleHint ? 1000 : 0) +
        (lang === "zh-cn" ? 20 : lang.startsWith("zh-") ? 10 : 0) +
        (voice.localService ? 5 : 0);
      return { voice, score, maleHint };
    })
    .sort((a, b) => b.score - a.score);

  // Never let an explicitly male voice win just because it happens to be the
  // first voice returned by Safari/Chrome. If the platform has no gender
  // metadata, an unlabelled Chinese voice is still a better fallback than a
  // known male voice.
  return ranked.find(({ maleHint }) => !maleHint)?.voice;
}

function refreshCountdownVoice(synth: SpeechSynthesis) {
  countdownVoice = chooseChineseVoice(synth.getVoices()) ?? countdownVoice;
  return countdownVoice;
}

function ensureVoiceListener(synth: SpeechSynthesis) {
  // Some browsers populate the voice list asynchronously. Refresh the choice
  // when that list becomes available so the first countdown can use the
  // system's Chinese female voice instead of the browser default.
  if (!voiceChangeListenerAttached) {
    synth.addEventListener("voiceschanged", () => {
      countdownVoice = chooseChineseVoice(synth.getVoices()) ?? countdownVoice;
    });
    voiceChangeListenerAttached = true;
  }
}

function ensureCountdownVoice(synth: SpeechSynthesis) {
  ensureVoiceListener(synth);
  return refreshCountdownVoice(synth);
}

/**
 * Safari and Chromium on macOS can return an empty voice list on the first
 * call and fill it shortly afterwards. Waiting for voiceschanged prevents the
 * first digit from falling through to the browser's default (often male)
 * zh-CN voice.
 */
function waitForCountdownVoice(synth: SpeechSynthesis) {
  const immediate = ensureCountdownVoice(synth);
  if (immediate) return Promise.resolve(immediate);
  if (pendingVoicePromise) return pendingVoicePromise;

  pendingVoicePromise = new Promise<SpeechSynthesisVoice | null>((resolve) => {
    let settled = false;

    const finish = (voice: SpeechSynthesisVoice | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      synth.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(voice);
    };

    const onVoicesChanged = () => {
      const voice = refreshCountdownVoice(synth);
      if (voice) finish(voice);
    };

    synth.addEventListener("voiceschanged", onVoicesChanged);
    const timeoutId = window.setTimeout(
      () => finish(refreshCountdownVoice(synth)),
      VOICE_LIST_TIMEOUT_MS,
    );
  }).finally(() => {
    pendingVoicePromise = null;
  });

  return pendingVoicePromise;
}

/** Read one countdown number with the best available Chinese female voice. */
export function speakCountdownNumber(number: number) {
  const synth = speech();
  if (!synth) return;

  const text = COUNTDOWN_WORDS[number] ?? String(number);
  const requestId = ++speechRequestId;
  synth.cancel();

  void waitForCountdownVoice(synth).then((voice) => {
    // A newer digit or a close/restart supersedes this delayed request.
    if (requestId !== speechRequestId) return;

    try {
      // Do not speak until a Chinese voice is known. This keeps an unloaded
      // macOS voice list from silently selecting the platform default voice.
      if (!voice) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice.lang;
      utterance.rate = 0.85;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      utterance.voice = voice;
      synth.cancel();
      synth.speak(utterance);
    } catch {
      // Speech synthesis is an optional enhancement; the visual countdown and
      // Web Audio cue should continue if a browser rejects the utterance.
    }
  });
}

/** Stop any countdown speech when the launch overlay is closed or restarted. */
export function stopCountdownSpeech() {
  speechRequestId += 1;
  speech()?.cancel();
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A soft "doo". The last beat is bigger and held. */
export function playTick(step: number) {
  const ac = audio();
  if (!ac) return;
  const finalBeat = step <= 1;
  const t = ac.currentTime;

  const body = finalBeat ? 196 : 168;
  const hold = finalBeat ? 0.34 : 0.16;
  const tail = finalBeat ? 0.62 : 0.3;
  const level = finalBeat ? 0.17 : 0.14;

  // Body — triangle keeps it warm, no square-wave buzz.
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(body * 1.06, t);
  osc.frequency.exponentialRampToValueAtTime(body, t + 0.05);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
  gain.gain.setValueAtTime(level * 0.82, t + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + tail);

  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + tail + 0.02);

  // Sub an octave down — the weight you feel rather than hear.
  const sub = ac.createOscillator();
  const subGain = ac.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(body / 2, t);
  subGain.gain.setValueAtTime(0.0001, t);
  subGain.gain.exponentialRampToValueAtTime(level * 0.55, t + 0.02);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t + tail * 0.9);
  sub.connect(subGain).connect(ac.destination);
  sub.start(t);
  sub.stop(t + tail);

  // Short filtered click for attack definition.
  const clickFrames = Math.floor(ac.sampleRate * 0.02);
  const clickBuffer = ac.createBuffer(1, clickFrames, ac.sampleRate);
  const clickData = clickBuffer.getChannelData(0);
  for (let i = 0; i < clickFrames; i += 1) {
    clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickFrames) ** 3;
  }
  const click = ac.createBufferSource();
  click.buffer = clickBuffer;
  const clickFilter = ac.createBiquadFilter();
  clickFilter.type = "lowpass";
  clickFilter.frequency.value = 900;
  const clickGain = ac.createGain();
  clickGain.gain.value = 0.05;
  click.connect(clickFilter).connect(clickGain).connect(ac.destination);
  click.start(t);
}

/** Detonation: a short crack, a falling boom, and the engine pulling away. */
export function playBoom() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const dur = 1.7;

  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    const decay = 1 - i / frames;
    samples[i] = (Math.random() * 2 - 1) * decay * decay;
  }

  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const lowpass = ac.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(7200, t);
  lowpass.frequency.exponentialRampToValueAtTime(240, t + dur);

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.3, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  noise.connect(lowpass).connect(noiseGain).connect(ac.destination);
  noise.start(t);

  const sub = ac.createOscillator();
  const subGain = ac.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(120, t);
  sub.frequency.exponentialRampToValueAtTime(34, t + 1.2);
  subGain.gain.setValueAtTime(0.26, t);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
  sub.connect(subGain).connect(ac.destination);
  sub.start(t);
  sub.stop(t + 1.3);

  // Engine pulling away — filtered saw whose filter opens as the revs climb.
  const engine = ac.createOscillator();
  const engineFilter = ac.createBiquadFilter();
  const engineGain = ac.createGain();
  engine.type = "sawtooth";
  engine.frequency.setValueAtTime(64, t + 0.05);
  engine.frequency.exponentialRampToValueAtTime(190, t + 1.2);
  engineFilter.type = "lowpass";
  engineFilter.frequency.setValueAtTime(420, t);
  engineFilter.frequency.exponentialRampToValueAtTime(2200, t + 1.2);
  engineGain.gain.setValueAtTime(0.0001, t);
  engineGain.gain.exponentialRampToValueAtTime(0.075, t + 0.1);
  engineGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  engine.connect(engineFilter).connect(engineGain).connect(ac.destination);
  engine.start(t);
  engine.stop(t + 1.65);
}
