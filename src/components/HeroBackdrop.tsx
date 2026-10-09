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
  return (
    <div className="space-layer" aria-hidden="true">
      <div className="veil">
        <EarthVeil />
        <EarthGlobe />
      </div>
    </div>
  );
}
