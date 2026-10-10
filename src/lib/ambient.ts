"use client";

import { useSyncExternalStore } from "react";

/**
 * One ambient track, one audio element, however many controls.
 *
 * The site header has a sound toggle and the Lab's desk machine has
 * a player. Each owning its own Audio would mean two copies of the
 * same loop running out of phase against each other — which sounds
 * exactly as bad as it reads. So the element lives here and the
 * controls are views onto it: press play on the desk and the header
 * toggle lights up too.
 */

const SRC = "/audio/ambient.mp3";
/** Slow in, quick out. Waiting over a second for silence after
 *  pressing pause reads as the button not having worked. */
const FADE_IN_MS = 1100;
const FADE_OUT_MS = 380;
const STEP_MS = 40;

export type AmbientState = {
  playing: boolean;
  /** False once the file has failed to load, or autoplay was refused. */
  available: boolean;
  volume: number;
};

// 0.22 was inaudible over anything. If someone deliberately turns
// sound on, they should be in no doubt that it worked.
const INITIAL: AmbientState = { playing: false, available: true, volume: 0.46 };

let state: AmbientState = INITIAL;
let audio: HTMLAudioElement | null = null;
let fade: number | null = null;

const listeners = new Set<() => void>();

function set(patch: Partial<AmbientState>) {
  const next = { ...state, ...patch };
  if (
    next.playing === state.playing &&
    next.available === state.available &&
    next.volume === state.volume
  ) {
    return; // Identity has to stay stable or every subscriber re-renders.
  }
  state = next;
  for (const notify of listeners) notify();
}

function ensure(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (audio) return audio;

  const el = new Audio(SRC);
  el.loop = true;
  el.preload = "none";
  el.volume = 0;
  el.addEventListener("error", () => set({ available: false, playing: false }));
  audio = el;
  return el;
}

function stopFade() {
  if (fade !== null) {
    window.clearInterval(fade);
    fade = null;
  }
}

/**
 * Every play or pause takes the next token.
 *
 * A fade owns a callback that runs up to a second later, and the
 * fade-out's callback is `el.pause()`. Press pause then play again
 * before it lands and that stale callback pauses the playback you
 * just started — the button appears to work, then the music dies a
 * beat later for no visible reason. The token means a fade can
 * only finish the job it was started for.
 */
let token = 0;

function fadeTo(el: HTMLAudioElement, to: number, ms: number, onDone?: () => void) {
  stopFade();

  const mine = ++token;
  const from = el.volume;
  const steps = Math.max(1, Math.round(ms / STEP_MS));
  let step = 0;

  fade = window.setInterval(() => {
    if (mine !== token) {
      stopFade();
      return;
    }
    step += 1;
    const t = Math.min(1, step / steps);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t >= 1) {
      stopFade();
      if (mine === token) onDone?.();
    }
  }, STEP_MS);
}

export async function playAmbient(): Promise<void> {
  const el = ensure();
  if (!el || !state.available) return;

  try {
    await el.play();
    fadeTo(el, state.volume, FADE_IN_MS);
    set({ playing: true });
  } catch {
    // Autoplay refusal or a missing file. The site works in
    // silence, so this stays quiet — but it does NOT latch
    // `available` off. A refusal is usually about this particular
    // gesture, and permanently disabling the button over one of
    // them leaves someone staring at a dead control they can
    // never retry.
    set({ playing: false });
  }
}

export function pauseAmbient(): void {
  set({ playing: false });
  const el = audio;
  if (!el) return;
  fadeTo(el, 0, FADE_OUT_MS, () => el.pause());
}

export function toggleAmbient(): void {
  if (state.playing) pauseAmbient();
  else void playAmbient();
}

export function setAmbientVolume(v: number): void {
  const volume = Math.max(0, Math.min(1, v));
  set({ volume });
  // Dragging a slider mid-fade should win: the fade is a transition
  // between two intents, and the drag is a newer one.
  if (audio && state.playing) {
    stopFade();
    audio.volume = volume;
  }
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function useAmbient(): AmbientState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}
