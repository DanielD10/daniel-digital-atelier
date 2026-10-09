"use client";

import { useEffect, useRef } from "react";
import { cities } from "@/lib/cities";
import { landmasses } from "@/lib/landmasses";

/**
 * Earth at night, drawn live on a canvas and spinning in real time.
 *
 * What makes it honest rather than decorative:
 *
 *   1. 221 cities at real coordinates. You don't recognise Earth from
 *      coastlines — you recognise it from where the light is.
 *
 *   2. The day/night line comes from the actual sub-solar point for
 *      this moment. Whichever half of Earth is dark right now is the
 *      half lit up here.
 *
 * Performance note: the glow sprite is rendered once into an
 * offscreen canvas and then blitted ~1500 times per frame. Building
 * a radial gradient per light per frame is the obvious way to write
 * this and it drops you to single-digit FPS — gradient construction,
 * not fill rate, is the bottleneck.
 */

const SPIN_PERIOD_MS = 90_000; // one full turn every 90s — visibly live
const DEG = Math.PI / 180;

/** Sub-solar point: the lat/lon where the sun is directly overhead. */
function subsolarPoint(now: Date): { lat: number; lon: number } {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = (now.getTime() - start) / 86_400_000;

  const lat = 23.44 * Math.sin(((360 / 365.24) * (dayOfYear - 81)) * DEG);

  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;

  let lon = -15 * (utcHours - 12);
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return { lat, lon };
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** One radial glow, rendered once and reused for every city. */
function makeGlowSprite(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;

  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,241,214,1)");
  grad.addColorStop(0.12, "rgba(255,214,150,0.92)");
  grad.addColorStop(0.34, "rgba(232,168,80,0.42)");
  grad.addColorStop(0.68, "rgba(188,126,48,0.12)");
  grad.addColorStop(1, "rgba(182,135,63,0)");

  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export default function EarthVeil() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SPRITE = 64;
    const glow = makeGlowSprite(SPRITE);

    let width = 0;
    let height = 0;
    let radius = 0;
    let cx = 0;
    let cy = 0;
    let frame = 0;
    let running = true;

    // Expand each city into a cluster so lights read as sprawl.
    const points: Array<{ lon: number; lat: number; i: number; seed: number }> = [];
    cities.forEach((c, index) => {
      const [lon, lat, intensity] = c;
      points.push({ lon, lat, i: intensity, seed: index * 7.3 });

      const sprawl = Math.round(3 + intensity * 9);
      for (let s = 0; s < sprawl; s++) {
        const h1 = hash(index * 31.7 + s * 2.3);
        const h2 = hash(index * 17.3 + s * 5.1);
        const spread = 1.2 + intensity * 3.0;
        points.push({
          lon: lon + (h1 - 0.5) * spread * 2.1,
          lat: lat + (h2 - 0.5) * spread,
          i: intensity * (0.2 + h1 * 0.45),
          seed: index * 7.3 + s * 1.7,
        });
      }
    });

    // Fixed starfield in screen space.
    const stars = Array.from({ length: 220 }, (_, i) => ({
      x: hash(i * 3.1),
      y: hash(i * 5.7 + 11),
      r: 0.3 + hash(i * 9.2) * 0.9,
      a: 0.12 + hash(i * 13.4) * 0.5,
      seed: i * 2.7,
    }));

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();

      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The whole sphere visible, sitting right of the wordmark.
      radius = Math.min(width * 0.33, height * 0.46);
      cx = width * 0.68;
      cy = height * 0.47;
    }

    function project(lon: number, lat: number, spin: number) {
      const latR = lat * DEG;
      const lonR = (lon + spin) * DEG;
      return {
        x: Math.cos(latR) * Math.sin(lonR),
        y: Math.sin(latR),
        z: Math.cos(latR) * Math.cos(lonR),
      };
    }

    function draw(time: number) {
      if (!running) return;

      const spin = reduced ? 0 : ((time % SPIN_PERIOD_MS) / SPIN_PERIOD_MS) * 360;
      const sun = subsolarPoint(new Date());

      ctx!.clearRect(0, 0, width, height);

      // ── Stars ──────────────────────────────────────────────────
      ctx!.save();
      for (const s of stars) {
        const sxp = s.x * width;
        const syp = s.y * height;
        const d = Math.hypot(sxp - cx, syp - cy);
        if (d < radius * 1.02) continue; // occluded by the planet

        const tw = reduced ? 1 : 0.7 + 0.3 * Math.sin(time * 0.0008 + s.seed);
        ctx!.fillStyle = `rgba(214,222,236,${s.a * tw})`;
        ctx!.beginPath();
        ctx!.arc(sxp, syp, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();

      // Sun direction in the rotated frame.
      const sunLatR = sun.lat * DEG;
      const sunLonR = (sun.lon + spin) * DEG;
      const sx = Math.cos(sunLatR) * Math.sin(sunLonR);
      const sy = Math.sin(sunLatR);
      const sz = Math.cos(sunLatR) * Math.cos(sunLonR);

      // Screen-space direction of the sun, for the limb gradient.
      const sunScreenLen = Math.hypot(sx, sy) || 1;
      const sunNx = sx / sunScreenLen;
      const sunNy = -sy / sunScreenLen;

      // ── Outer atmosphere ──────────────────────────────────────
      const halo = ctx!.createRadialGradient(cx, cy, radius * 0.97, cx, cy, radius * 1.3);
      halo.addColorStop(0, "rgba(96,140,186,0.3)");
      halo.addColorStop(0.35, "rgba(58,92,132,0.13)");
      halo.addColorStop(1, "rgba(7,6,5,0)");
      ctx!.fillStyle = halo;
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
      ctx!.fill();

      // ── Ocean body ────────────────────────────────────────────
      const body = ctx!.createRadialGradient(
        cx - radius * 0.35, cy - radius * 0.35, radius * 0.04,
        cx, cy, radius,
      );
      body.addColorStop(0, "#101d2e");
      body.addColorStop(0.5, "#0a1320");
      body.addColorStop(1, "#050810");
      ctx!.fillStyle = body;
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.fill();

      // ── Continents. Low contrast on purpose — they sit under the
      //    lights the way they do in a real night-side photo. ─────
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.clip();
      ctx!.fillStyle = "rgba(38,54,74,0.55)";

      for (const ring of landmasses) {
        let started = false;
        ctx!.beginPath();
        for (const [lon, lat] of ring) {
          const p = project(lon, lat, spin);
          if (p.z <= 0) {
            started = false;
            continue;
          }
          const px = cx + p.x * radius;
          const py = cy - p.y * radius;
          if (!started) {
            ctx!.moveTo(px, py);
            started = true;
          } else {
            ctx!.lineTo(px, py);
          }
        }
        ctx!.closePath();
        ctx!.fill();
      }
      ctx!.restore();

      // ── Daylight wash on the sunlit face ──────────────────────
      const dayX = cx + sx * radius * 0.78;
      const dayY = cy - sy * radius * 0.78;

      if (sz > -0.55) {
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx!.clip();
        const day = ctx!.createRadialGradient(dayX, dayY, 0, dayX, dayY, radius * 1.25);
        day.addColorStop(0, "rgba(138,172,208,0.42)");
        day.addColorStop(0.4, "rgba(74,104,142,0.2)");
        day.addColorStop(0.75, "rgba(30,44,62,0.06)");
        day.addColorStop(1, "rgba(7,6,5,0)");
        ctx!.fillStyle = day;
        ctx!.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx!.restore();
      }

      // ── City lights ───────────────────────────────────────────
      ctx!.globalCompositeOperation = "lighter";

      for (const p of points) {
        const pr = project(p.lon, p.lat, spin);
        if (pr.z <= 0.02) continue;

        const sunDot = pr.x * sx + pr.y * sy + pr.z * sz;
        const lit = Math.max(0, Math.min(1, -sunDot * 2.8));
        if (lit <= 0.015) continue;

        const limb = Math.pow(pr.z, 0.6);
        const tw = reduced ? 1 : 0.8 + 0.2 * Math.sin(time * 0.0013 + p.seed * 2.4);
        const alpha = lit * limb * tw * (0.34 + p.i * 0.78);
        if (alpha < 0.015) continue;

        const px = cx + pr.x * radius;
        const py = cy - pr.y * radius;
        const size = (radius * 0.018 + p.i * radius * 0.05) * limb;

        ctx!.globalAlpha = Math.min(1, alpha);
        ctx!.drawImage(glow, px - size, py - size, size * 2, size * 2);
      }

      ctx!.globalAlpha = 1;

      // ── The hot limb. This is the signature of the reference:
      //    a bright amber crescent where the atmosphere catches the
      //    sun. Stroked as a ring, masked by a linear gradient along
      //    the sun's screen direction so it only burns on that side.
      const g0x = cx - sunNx * radius;
      const g0y = cy - sunNy * radius;
      const g1x = cx + sunNx * radius;
      const g1y = cy + sunNy * radius;

      const limbGrad = ctx!.createLinearGradient(g0x, g0y, g1x, g1y);
      limbGrad.addColorStop(0, "rgba(255,168,64,0)");
      limbGrad.addColorStop(0.42, "rgba(255,150,52,0.1)");
      limbGrad.addColorStop(0.72, "rgba(255,176,78,0.72)");
      limbGrad.addColorStop(0.9, "rgba(255,214,150,0.95)");
      limbGrad.addColorStop(1, "rgba(255,236,198,1)");

      ctx!.save();
      ctx!.strokeStyle = limbGrad;
      ctx!.lineWidth = Math.max(1.6, radius * 0.016);
      ctx!.shadowColor = "rgba(255,160,60,0.85)";
      ctx!.shadowBlur = radius * 0.1;
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius * 0.995, 0, Math.PI * 2);
      ctx!.stroke();
      // Second, wider pass for the outer bloom.
      ctx!.lineWidth = Math.max(1, radius * 0.006);
      ctx!.shadowBlur = radius * 0.22;
      ctx!.stroke();
      ctx!.restore();

      ctx!.globalCompositeOperation = "source-over";

      // ── Terminator haze along the day/night boundary ──────────
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.clip();
      const term = ctx!.createRadialGradient(dayX, dayY, radius * 0.5, dayX, dayY, radius * 1.15);
      term.addColorStop(0, "rgba(214,138,66,0)");
      term.addColorStop(0.6, "rgba(214,138,66,0.13)");
      term.addColorStop(1, "rgba(214,138,66,0)");
      ctx!.fillStyle = term;
      ctx!.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx!.restore();

      frame = requestAnimationFrame(draw);
    }

    resize();
    frame = requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener("resize", onResize, { passive: true });

    // Don't burn a visitor's battery rendering a planet nobody sees.
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
