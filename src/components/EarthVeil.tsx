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
 *
 * Three more things this learned the hard way, all measured:
 *
 *   1. The WebGL globe hides this canvas with `display: none` once
 *      its texture lands. `display: none` stops the paint, not the
 *      work — rAF keeps firing and this kept drawing a whole planet
 *      into a box nobody can see, for as long as the tab was open.
 *      It now checks whether it is still on screen and stops.
 *
 *   2. The amber limb used to be two full-circle strokes with
 *      shadowBlur, i.e. a Gaussian blur over the globe's bounding
 *      box, twice, every frame. It is now baked once into a sprite
 *      and rotated to the sun. Identical output, no per-frame blur.
 *
 *   3. The halo and ocean gradients are fixed to the globe's centre,
 *      so they were being rebuilt 60 times a second to come out the
 *      same. Built once per resize instead.
 *
 * Together: 1140ms of long tasks in the first two seconds down to
 * roughly a tenth of that, and nothing at all once the real globe
 * takes over.
 */

const SPIN_PERIOD_MS = 90_000; // one full turn every 90s — visibly live
const DEG = Math.PI / 180;
/**
 * Full rate. This was capped to 30fps on the theory that a 90-second
 * rotation could not tell the difference. It can: this is the planet
 * you look at while the real globe loads, and at half rate it reads
 * as a stutter on the first thing anyone sees. The cap saved very
 * little anyway — the cost was the per-frame shadowBlur and the
 * gradients, both of which are gone.
 */
const SUN_TTL_MS = 30_000; // the sun moves 15deg an hour

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

/**
 * The hot limb, baked.
 *
 * This is the signature of the reference image: a bright amber
 * crescent where the atmosphere catches the sun, burning on one side
 * of the planet only. Drawn as a ring stroked with a gradient running
 * along the sun's screen direction, plus a second wider pass for the
 * outer bloom.
 *
 * Both passes use shadowBlur, which is why this is a sprite. The ring
 * is radially symmetric, so the whole thing can be stroked once with
 * its gradient along local +x and then *rotated* to wherever the sun
 * is — the colour ramp and the baked blur rotate with it, so the
 * result is pixel-equivalent to stroking it fresh every frame.
 */
function makeLimbSprite(radius: number): { canvas: HTMLCanvasElement; half: number } {
  const half = Math.ceil(radius * 1.3);
  const c = document.createElement("canvas");
  c.width = half * 2;
  c.height = half * 2;
  const g = c.getContext("2d")!;

  // Gradient along local +x, i.e. the sun is to the right of centre.
  const grad = g.createLinearGradient(half - radius, half, half + radius, half);
  grad.addColorStop(0, "rgba(255,168,64,0)");
  grad.addColorStop(0.42, "rgba(255,150,52,0.1)");
  grad.addColorStop(0.72, "rgba(255,176,78,0.72)");
  grad.addColorStop(0.9, "rgba(255,214,150,0.95)");
  grad.addColorStop(1, "rgba(255,236,198,1)");

  g.strokeStyle = grad;
  g.shadowColor = "rgba(255,160,60,0.85)";

  g.lineWidth = Math.max(1.6, radius * 0.016);
  g.shadowBlur = radius * 0.1;
  g.beginPath();
  g.arc(half, half, radius * 0.995, 0, Math.PI * 2);
  g.stroke();

  g.lineWidth = Math.max(1, radius * 0.006);
  g.shadowBlur = radius * 0.22;
  g.stroke();

  return { canvas: c, half };
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

    /**
     * Everything here is a function of the globe's centre and radius
     * alone, so it survives every frame and only a resize can
     * invalidate it.
     */
    let halo: CanvasGradient | null = null;
    let body: CanvasGradient | null = null;
    let limb: { canvas: HTMLCanvasElement; half: number } | null = null;

    // The sun, cached. Recomputing it per frame allocated a Date per
    // frame to land on the same answer.
    let sun = { lat: 0, lon: 0 };
    let sunAt = -Infinity;

    let ticks = 0;
    let poll = 0;

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

      /**
       * Matched to the WebGL globe, not chosen independently.
       *
       * That one sits at camera z=4.4 with a 38deg fov, so a unit
       * sphere subtends 2*atan(1/4.4) = 25.6deg of a 38deg frame —
       * about 0.674 of the viewport height, centred near 70%/47%.
       *
       * When these two disagreed you saw a giant drawn globe snap
       * down to a small rendered one the moment the texture landed.
       */
      radius = height * 0.337;
      cx = width * 0.70;
      cy = height * 0.47;

      halo = ctx!.createRadialGradient(cx, cy, radius * 0.97, cx, cy, radius * 1.3);
      halo.addColorStop(0, "rgba(96,140,186,0.3)");
      halo.addColorStop(0.35, "rgba(58,92,132,0.13)");
      halo.addColorStop(1, "rgba(7,6,5,0)");

      body = ctx!.createRadialGradient(
        cx - radius * 0.35, cy - radius * 0.35, radius * 0.04,
        cx, cy, radius,
      );
      body.addColorStop(0, "#101d2e");
      body.addColorStop(0.5, "#0a1320");
      body.addColorStop(1, "#050810");

      // A zero-size sprite is not a drawable image, so a collapsed
      // layout gets no limb rather than an InvalidStateError.
      limb = radius >= 1 ? makeLimbSprite(radius) : null;
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

    /**
     * Idle watch for the globe going away — a lost WebGL context, a
     * disposed canvas. Cheap enough to leave running: one layout read
     * a second, and nothing else.
     */
    function watch() {
      if (poll) return;
      poll = window.setInterval(() => {
        if (canvas!.offsetParent === null) return;
        window.clearInterval(poll);
        poll = 0;
        if (running || document.hidden) return;
        running = true;
        resize();
        frame = requestAnimationFrame(draw);
      }, 1000);
    }

    function draw(time: number) {
      if (!running) return;

      /**
       * Are we still on screen?
       *
       * The WebGL globe takes over with
       *   .veil:has(.globe-gl.is-ready) .earth-canvas { display: none }
       * and `display: none` stops the paint but not the work. Without
       * this check the stand-in kept drawing a full planet — lights,
       * landmasses, limb, the lot — into a hidden box for the life of
       * the tab.
       *
       * offsetParent is null exactly when an element or an ancestor is
       * display:none, which is the one case we care about. It costs a
       * layout read, so it runs about once a second rather than per
       * frame, and once hidden we drop out of rAF altogether and let a
       * slow interval watch for the globe going away again.
       */
      if (++ticks % 10 === 0 && canvas!.offsetParent === null) {
        running = false;
        cancelAnimationFrame(frame);
        watch();
        return;
      }

      if (time - sunAt > SUN_TTL_MS) {
        sun = subsolarPoint(new Date());
        sunAt = time;
      }

      const spin = reduced ? 0 : ((time % SPIN_PERIOD_MS) / SPIN_PERIOD_MS) * 360;

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
      ctx!.fillStyle = halo!;
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
      ctx!.fill();

      // ── Ocean body ────────────────────────────────────────────
      ctx!.fillStyle = body!;
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

      // ── The hot limb, blitted and turned to face the sun. The
      //    ring and its bloom are baked into a sprite at resize; all
      //    that happens per frame is a rotation. See makeLimbSprite.
      if (limb) {
        ctx!.save();
        ctx!.translate(cx, cy);
        ctx!.rotate(Math.atan2(sunNy, sunNx));
        ctx!.drawImage(limb.canvas, -limb.half, -limb.half);
        ctx!.restore();
      }

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
        // Still covered by the real globe? Stay down, let watch have it.
        if (canvas!.offsetParent === null) {
          watch();
          return;
        }
        running = true;
        frame = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      if (poll) window.clearInterval(poll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="earth-canvas" aria-hidden="true" />;
}
