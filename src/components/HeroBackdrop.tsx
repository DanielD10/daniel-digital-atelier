"use client";

import dynamic from "next/dynamic";
import EarthVeil from "./EarthVeil";

/**
 * The space layer. Fixed to the viewport and sitting behind the
 * whole document, not clipped inside the hero — so the starfield
 * runs the full height of the page and you stay in space as you
 * scroll rather than falling out of it at the first section break.
 *
 * Two globes, stacked. Underneath, the procedural canvas one: draws
 * instantly, no network, no WebGL. On top, the WebGL globe carrying
 * NASA's imagery, which renders nothing until its texture genuinely
 * loads and then fades the stand-in out beneath it.
 *
 * So the hero is never blank. No WebGL, dead CDN, retired NASA
 * layer, slow connection — you still get a planet.
 */

const EarthGlobe = dynamic(() => import("./EarthGlobe"), { ssr: false });

export default function HeroBackdrop() {
  /**
   * The real globe loads immediately. It used to wait for a
   * requestIdleCallback gap, which read beautifully on paper —
   * nothing competing with first paint — and was wrong.
   *
   * Measured against the build before it: the planet went from
   * being on screen at 1034ms to 2321ms. Over a second of extra
   * waiting, spent looking at the stand-in, to buy main-thread
   * headroom that first paint did not actually need; blocking
   * before paint is 0ms either way. The globe is the first thing
   * anyone sees on this site, so it arrives as fast as it can.
   *
   * What genuinely cost something was never the loading. It was
   * EarthVeil continuing to draw after this took over, which is
   * fixed in EarthVeil itself and is independent of when the
   * globe mounts.
   */
  return (
    <div className="space-layer" aria-hidden="true">
      <div className="veil">
        <EarthVeil />
        <EarthGlobe />
      </div>
    </div>
  );
}
