"use client";

import dynamic from "next/dynamic";
import EarthVeil from "./EarthVeil";

/**
 * Two globes, stacked.
 *
 * Underneath: the procedural canvas globe. Draws instantly, no
 * network, no WebGL.
 *
 * On top: the WebGL globe carrying NASA's imagery. It renders
 * nothing until its texture has actually loaded, and when it does,
 * .is-ready fades the procedural one out beneath it.
 *
 * So the hero is never blank. No WebGL, no network, retired NASA
 * layer, slow connection — you still get a planet, it's just the
 * hand-drawn one. three.js is loaded with ssr:false because it
 * touches window and document at import time.
 */

const EarthGlobe = dynamic(() => import("./EarthGlobe"), { ssr: false });

export default function HeroBackdrop() {
  return (
    <div className="veil" aria-hidden="true">
      <EarthVeil />
      <EarthGlobe />
      <div className="hero-art" />
    </div>
  );
}
