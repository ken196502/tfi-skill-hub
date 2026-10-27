/**
 * The launch countdown soundtrack extracted from the reference video.
 *
 * Its first five impact points are roughly 2.9s apart, followed by the
 * detonation. Keeping the soundtrack as one file lets the visual digits and
 * the original sound design land on the same beats instead of racing two
 * independent synth timers.
 */

const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");
const COUNTDOWN_AUDIO_SRC = `${BASE_PATH}/audio/home-countdown.mp3`;

let countdownAudio: HTMLAudioElement | null = null;

function getCountdownAudio() {
  if (typeof window === "undefined") return null;
  if (!countdownAudio) {
    countdownAudio = new Audio(COUNTDOWN_AUDIO_SRC);
    countdownAudio.preload = "auto";
    countdownAudio.volume = 0.95;
  }
  return countdownAudio;
}

/** Start the extracted 5→1 countdown and detonation soundtrack. */
export function playCountdownAudio() {
  const player = getCountdownAudio();
  if (!player) return;

  player.pause();
  player.currentTime = 0;
  void player.play().catch(() => {
    // Browsers can still reject playback when the gesture is not considered
    // user-initiated. The visual countdown should remain usable in that case.
  });
}

/** Stop and rewind the soundtrack when the curtain closes or restarts. */
export function stopCountdownAudio() {
  const player = countdownAudio;
  if (!player) return;

  player.pause();
  player.currentTime = 0;
}
