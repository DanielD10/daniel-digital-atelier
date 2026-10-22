"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
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
   * And the real globe waits for a gap.
   *
   * It is decorative, it is behind the text, and there is already
   * a planet drawn under it — so there is no reason for three.js
   * and four textures to be competing with first paint and
   * hydration for the main thread. Measured on the home page
   * before this: twenty-six long tasks, 8.6 seconds of them, the
   * worst a single 1.4-second block. Held back to the first idle
   * gap, with a timeout so a page that never goes idle still gets
   * its globe.
   */
  const [lift, setLift] = useState(false);
  useEffect(() => {
    type Idle = {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const w = window as unknown as Idle;
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(() => setLift(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(h);
    }
    const h = window.setTimeout(() => setLift(true), 1200);
    return () => window.clearTimeout(h);
  }, []);

  return (
    <div className="space-layer" aria-hidden="true">
      <div className="veil">
        <EarthVeil />
        {lift ? <EarthGlobe /> : null}
      </div>
    </div>
  );
}
