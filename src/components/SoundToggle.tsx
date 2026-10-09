"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ambient sound control.
 *
 * Uses the native Audio element rather than Howler — one fade and one
 * loop doesn't justify a dependency, and this keeps the bundle small.
 *
 * The page is silent until clicked. Browsers block autoplay with
 * sound and that is correct behaviour, not a bug to work around.
 *
 * If /audio/ambient.mp3 is missing, the button disables itself
 * rather than throwing on every click.
 */

const SRC = "/audio/ambient.mp3";
const TARGET_VOLUME = 0.22;
const FADE_MS = 1200;

export default function SoundToggle() {
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
      audioRef.current?.pause();
    };
  }, []);

  const fadeTo = useCallback((audio: HTMLAudioElement, to: number, onDone?: () => void) => {
    if (fadeRef.current !== null) window.clearInterval(fadeRef.current);

    const from = audio.volume;
    const steps = Math.max(1, Math.round(FADE_MS / 40));
    let step = 0;

    fadeRef.current = window.setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / steps);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * progress));

      if (progress >= 1) {
        if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
        fadeRef.current = null;
        onDone?.();
      }
    }, 40);
  }, []);

  const toggle = useCallback(async () => {
    if (!available) return;

    if (!audioRef.current) {
      const audio = new Audio(SRC);
      audio.loop = true;
      audio.preload = "none";
      audio.volume = 0;
      audio.addEventListener("error", () => {
        setAvailable(false);
        setPlaying(false);
      });
      audioRef.current = audio;
    }

    const audio = audioRef.current;

    if (playing) {
      fadeTo(audio, 0, () => audio.pause());
      setPlaying(false);
      return;
    }

    try {
      await audio.play();
      fadeTo(audio, TARGET_VOLUME);
      setPlaying(true);
    } catch {
      // Autoplay rejection or missing file. Fail quietly — the site
      // works without sound and an error toast here would be noise.
      setAvailable(false);
    }
  }, [available, playing, fadeTo]);

  return (
    <button
      type="button"
      className="sound"
      onClick={toggle}
      aria-pressed={playing}
      disabled={!available}
      aria-label={playing ? "Turn ambient sound off" : "Turn ambient sound on"}
      title={available ? undefined : "Ambient track not loaded"}
    >
      Sound
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
