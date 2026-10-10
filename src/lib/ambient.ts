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
const FADE_MS = 1200;
const STEP_MS = 40;

export type AmbientState = {
  playing: boolean;
  /** False once the file has failed to load, or autoplay was refused. */
  available: boolean;
  volume: number;
};

const INITIAL: AmbientState = { playing: false, available: true, volume: 0.22 };

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

function fadeTo(el: HTMLAudioElement, to: number, onDone?: () => void) {
  stopFade();

  const from = el.volume;
  const steps = Math.max(1, Math.round(FADE_MS / STEP_MS));
  let step = 0;

  fade = window.setInterval(() => {
    step += 1;
    const t = Math.min(1, step / steps);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t >= 1) {
      stopFade();
      onDone?.();
    }
  }, STEP_MS);
}

export async function playAmbient(): Promise<void> {
  const el = ensure();
  if (!el || !state.available) return;

  try {
    await el.play();
    fadeTo(el, state.volume);
    set({ playing: true });
  } catch {
    // Autoplay refusal or a missing file. The site works in silence;
    // an error toast here would be noise about something optional.
    set({ available: false, playing: false });
  }
}

export function pauseAmbient(): void {
  set({ playing: false });
  const el = audio;
  if (!el) return;
  fadeTo(el, 0, () => el.pause());
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
