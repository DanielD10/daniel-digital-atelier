"use client";

import { useEffect } from "react";

import { armAmbient, toggleAmbient, useAmbient } from "@/lib/ambient";

/**
 * Ambient sound control.
 *
 * All the machinery lives in lib/ambient — this is a view onto it,
 * so the desk player in the Lab and this button stay in agreement
 * instead of each running their own copy of the loop.
 *
 * Sound arms itself on mount. Browsers refuse audible media until
 * a page has had a real user gesture, so the first attempt often
 * fails and the next touch or scroll starts it instead — see
 * armAmbient.
 */
export default function SoundToggle() {
  const { playing, available } = useAmbient();

  // The header is on every page, so this is the one place that
  // reliably mounts once per visit.
  useEffect(() => {
    armAmbient();
  }, []);

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
