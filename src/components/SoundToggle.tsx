"use client";

import { toggleAmbient, useAmbient } from "@/lib/ambient";

/**
 * Ambient sound control.
 *
 * All the machinery lives in lib/ambient — this is a view onto it,
 * so the desk player in the Lab and this button stay in agreement
 * instead of each running their own copy of the loop.
 *
 * The page is silent until clicked. Browsers block autoplay with
 * sound and that is correct behaviour, not a bug to work around.
 */
export default function SoundToggle() {
  const { playing, available } = useAmbient();

  return (
    <button
      type="button"
      className="sound"
      onClick={toggleAmbient}
      aria-pressed={playing}
      disabled={!available}
      aria-label={playing ? "Turn ambient sound off" : "Turn ambient sound on"}
      title={available ? undefined : "Ambient track not loaded"}
      data-playing={playing ? "true" : "false"}
    >
      {/* The state has to be on the label. Three two-pixel bars is
          not feedback — people clicked it and could not tell
          whether anything had happened. */}
      {playing ? "Sound on" : "Sound"}
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
