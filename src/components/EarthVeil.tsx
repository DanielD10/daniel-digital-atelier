"use client";

import { useEffect, useRef } from "react";
import { cities } from "@/lib/cities";

/**
 * Earth at night, drawn live on a canvas.
 *
 * Two things make this honest rather than decorative:
 *
 *   1. The city lights are at real coordinates. You don't recognise
 *      Earth from coastlines — you recognise it from where the light
 *      is. Europe's sprawl, the Indian subcontinent, the Japanese
 *      arc, two American coasts, and the dark middle of Africa,
 *      Australia and the Sahara.
 *
 *   2. The day/night line is computed from the actual sun position
 *      for the current moment. Whatever half of Earth is dark right
 *      now is the half that's lit up here. Open the page at 3am and
 *      it is a different planet than at noon.
 *
 * Canvas 2D with hand-rolled spherical projection rather than
 * three.js — a sphere of points doesn't need a WebGL context, a
 * scene graph, or 600KB of library. It also means no second GPU
 * context fighting the CSS 3D stage.
 */

const ROTATION_PERIOD_MS = 240_000; // one turn every four minutes
const DEG = Math.PI / 180;

type Pt = { x: number; y: number; z: number; lit: number; i: number; seed: number };

/**
 * Sub-solar point for a given moment: the lat/lon where the sun is
 * directly overhead. Declination from day-of-year, longitude from
 * UTC time. Accurate to well under a degree, which is far beyond
 * what anyone can perceive here.
 */
function subsolarPoint(now: Date): { lat: number; lon: number } {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = (now.getTime() - start) / 86_400_000;

  // Axial tilt projected through the year.
  const lat = 23.44 * Math.sin(((360 / 365.24) * (dayOfYear - 81)) * DEG);

  const utcHours =
    now.getUTCHours() +
    now.getUTCMinutes() / 60 +
    now.getUTCSeconds() / 3600;

  // Noon UTC puts the sun over the prime meridian; 15 deg per hour.
  let lon = -15 * (utcHours - 12);
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return { lat, lon };
}

/** Deterministic noise so light sprawl is stable between frames. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export default function EarthVeil() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let radius = 0;
    let cx = 0;
    let cy = 0;
    let frame = 0;
    let running = true;

    // Pre-expand each city into a small cluster so lights read as
    // urban sprawl rather than as pins on a map.
    const points: Array<{ lon: number; lat: number; i: number; seed: number }> = [];
    cities.forEach((c, index) => {
      const [lon, lat, intensity] = c;
      points.push({ lon, lat, i: intensity, seed: index * 7.3 });

      const sprawl = Math.round(2 + intensity * 7);
      for (let s = 0; s < sprawl; s++) {
        const h1 = hash(index * 31.7 + s * 2.3);
        const h2 = hash(index * 17.3 + s * 5.1);
        const spread = 1.1 + intensity * 2.6;
        points.push({
          lon: lon + (h1 - 0.5) * spread * 2,
          lat: lat + (h2 - 0.5) * spread,
          i: intensity * (0.18 + h1 * 0.4),
          seed: index * 7.3 + s * 1.7,
        });
      }
    });

    function resize() {
      // Render at device resolution. This is what keeps it sharp on
      // a retina display instead of soft and upscaled.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();

      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Oversized and pushed right, so the globe bleeds off the top
      // and right edges and the type keeps the left third clear.
      radius = Math.max(width, height) * 0.58;
      cx = width * 0.68;
      cy = height * 0.42;
    }

    function draw(time: number) {
      if (!running) return;

      const spin = reduced ? 0 : ((time % ROTATION_PERIOD_MS) / ROTATION_PERIOD_MS) * 360;
      const sun = subsolarPoint(new Date());

      ctx!.clearRect(0, 0, width, height);

      // ── Atmosphere. A cold rim halo outside the disc. ──────────
      const halo = ctx!.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.32);
      halo.addColorStop(0, "rgba(86,128,168,0.22)");
      halo.addColorStop(0.45, "rgba(52,80,112,0.1)");
      halo.addColorStop(1, "rgba(7,6,5,0)");
      ctx!.fillStyle = halo;
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius * 1.32, 0, Math.PI * 2);
      ctx!.fill();

      // ── Ocean body. Nearly black, just enough to read as a sphere.
      const body = ctx!.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        radius * 0.05,
        cx,
        cy,
        radius,
      );
      body.addColorStop(0, "#0d1420");
      body.addColorStop(0.55, "#080d15");
      body.addColorStop(1, "#04060a");
      ctx!.fillStyle = body;
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.fill();

      // Sun direction as a unit vector in the same space as the points.
      const sunLatR = sun.lat * DEG;
      const sunLonR = (sun.lon + spin) * DEG;
      const sx = Math.cos(sunLatR) * Math.sin(sunLonR);
      const sy = Math.sin(sunLatR);
      const sz = Math.cos(sunLatR) * Math.cos(sunLonR);

      // ── Project every point. ──────────────────────────────────
      const visible: Pt[] = [];

      for (const p of points) {
        const latR = p.lat * DEG;
        const lonR = (p.lon + spin) * DEG;

        const x = Math.cos(latR) * Math.sin(lonR);
        const y = Math.sin(latR);
        const z = Math.cos(latR) * Math.cos(lonR);

        // Back-face cull: z <= 0 is the far side of the planet.
        if (z <= 0.02) continue;

        // Dot product with the sun vector gives how lit this point
        // is. Negative means night, which is when its lights show.
        const sunDot = x * sx + y * sy + z * sz;
        const lit = Math.max(0, Math.min(1, -sunDot * 2.6));
        if (lit <= 0.01) continue;

        visible.push({ x, y, z, lit, i: p.i, seed: p.seed });
      }

      // ── Daylight wash on the sunlit limb. ─────────────────────
      const dayX = cx + sx * radius * 0.72;
      const dayY = cy - sy * radius * 0.72;
      if (sz > -0.4) {
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx!.clip();
        const day = ctx!.createRadialGradient(dayX, dayY, 0, dayX, dayY, radius * 1.15);
        day.addColorStop(0, "rgba(120,146,178,0.3)");
        day.addColorStop(0.5, "rgba(60,80,104,0.12)");
        day.addColorStop(1, "rgba(7,6,5,0)");
        ctx!.fillStyle = day;
        ctx!.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx!.restore();
      }

      // ── City lights. ──────────────────────────────────────────
      ctx!.globalCompositeOperation = "lighter";

      for (const p of visible) {
        const px = cx + p.x * radius;
        const py = cy - p.y * radius;

        // Points near the limb are seen at a glancing angle, so they
        // dim and compress. That curvature is most of what sells the
        // sphere.
        const limb = Math.pow(p.z, 0.65);

        // Twinkle. Each light has its own phase from its seed, so
        // the field shimmers instead of pulsing in unison.
        const tw = reduced
          ? 1
          : 0.78 + 0.22 * Math.sin(time * 0.0011 + p.seed * 2.4);

        const alpha = p.lit * limb * tw * (0.3 + p.i * 0.7);
        if (alpha < 0.012) continue;

        const size = (0.9 + p.i * 3.1) * limb;

        // Warm sodium-vapour amber — the same family as the page's
        // bronze accent, which is why this sits in the palette
        // instead of fighting it.
        const glow = ctx!.createRadialGradient(px, py, 0, px, py, size * 4.2);
        glow.addColorStop(0, `rgba(255,214,150,${alpha})`);
        glow.addColorStop(0.3, `rgba(226,166,86,${alpha * 0.5})`);
        glow.addColorStop(1, "rgba(182,135,63,0)");
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(px, py, size * 4.2, 0, Math.PI * 2);
        ctx!.fill();

        // Hot core, only on the brighter lights.
        if (p.i > 0.45) {
          ctx!.fillStyle = `rgba(255,238,206,${alpha * 0.85})`;
          ctx!.beginPath();
          ctx!.arc(px, py, size * 0.52, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      ctx!.globalCompositeOperation = "source-over";

      // ── Terminator haze: the warm band along the day/night line.
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.clip();
      const term = ctx!.createRadialGradient(dayX, dayY, radius * 0.55, dayX, dayY, radius * 1.1);
      term.addColorStop(0, "rgba(198,136,74,0)");
      term.addColorStop(0.62, "rgba(198,136,74,0.09)");
      term.addColorStop(1, "rgba(198,136,74,0)");
      ctx!.fillStyle = term;
      ctx!.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx!.restore();

      frame = requestAnimationFrame(draw);
    }

    resize();
    frame = requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener("resize", onResize, { passive: true });

    // Stop drawing when the tab is hidden. No reason to burn a
    // visitor's battery rendering a planet nobody is looking at.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        frame = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="veil" aria-hidden="true">
      <canvas ref={canvasRef} className="earth-canvas" />
      <div className="hero-art" />
    </div>
  );
}
