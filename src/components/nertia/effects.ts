/**
 * NERTIA effect engine — five 2D particle systems, one per finish.
 *
 * Every effect consumes the same Emitter, so the demo runner and the
 * live camera feed drive them identically:
 *
 *   path      polyline the garment surface emits from (screen px)
 *   scale     shoulder- or hip-width in px; every size and speed is
 *             a multiple of it, so effects read the same on a phone
 *             held close and a laptop across the room
 *   bodyVel   how fast the wearer is moving across the screen
 *   worldVel  how fast the still air is moving across the screen.
 *             Camera mode: zero (the camera is fixed). Demo mode: the
 *             camera tracks the runner, so the world slides back.
 *
 * Particles are born carrying the body's velocity and relax toward
 * the air's. That one rule is what makes fire trail behind a runner
 * and stars hang where you were.
 */

import type { EffectId } from "@/lib/nertia";

export type Vec = { x: number; y: number };

export type Emitter = {
  path: Vec[];
  scale: number;
  bodyVel: Vec;
  worldVel: Vec;
  /** Footwear only: where a foot touched down this frame. */
  strikes?: Vec[];
};

export interface Effect {
  /** intensity 0..1 — ramps in when a unit is tapped. */
  update(dt: number, emitter: Emitter | null, intensity: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  clear(): void;
  /** A one-off burst, fired when the chip is read. */
  ignite(emitter: Emitter): void;
}

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  seed: number;
  /** effect-specific variant: color index, sprite index, kind flag */
  k: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ─────────────────────────── geometry ─────────────────────────── */

function pathLength(path: Vec[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return len;
}

/** A uniformly distributed point along the polyline. */
function samplePath(path: Vec[], total?: number): Vec {
  if (path.length === 1) return { ...path[0] };
  const len = total ?? pathLength(path);
  let d = Math.random() * len;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= seg || i === path.length - 1) {
      const t = seg > 0 ? Math.min(1, d / seg) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= seg;
  }
  return { ...path[path.length - 1] };
}

function centroid(path: Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of path) {
    x += p.x;
    y += p.y;
  }
  return { x: x / path.length, y: y / path.length };
}

/* ─────────────────────────── sprites ─────────────────────────── */

/**
 * Soft round sprites are pre-rendered once per color. Building a
 * radial gradient per particle per frame is what makes canvas
 * particle systems crawl on phones; drawImage of a cached bitmap
 * does not.
 */
function softSprite(color: string, size = 64, core = 0): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color);
  if (core > 0) grad.addColorStop(core, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ─────────────────────────── base system ─────────────────────── */

abstract class System implements Effect {
  protected ps: P[] = [];
  protected t = 0;
  protected carry = 0;
  protected abstract max: number;

  /** particles per second at intensity 1 */
  protected abstract rate(e: Emitter): number;
  protected abstract spawn(e: Emitter, at: Vec): P | null;
  protected abstract step(p: P, dt: number, e: Emitter | null): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;
  protected onDeath(_p: P): void {}

  /** last emitter seen, so dying particles keep relaxing to the air */
  protected last: Emitter | null = null;

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;

    if (e && intensity > 0 && e.path.length) {
      this.carry += this.rate(e) * intensity * dt;
      const total = pathLength(e.path);
      while (this.carry >= 1) {
        this.carry -= 1;
        if (this.ps.length >= this.max) break;
        const p = this.spawn(e, samplePath(e.path, total));
        if (p) this.ps.push(p);
      }
    } else {
      this.carry = 0;
    }

    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.onDeath(p);
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      this.step(p, dt, this.last);
    }
  }

  ignite(e: Emitter) {
    const total = pathLength(e.path);
    const n = Math.min(this.max - this.ps.length, Math.round(this.rate(e) * 0.45));
    for (let i = 0; i < n; i++) {
      const p = this.spawn(e, samplePath(e.path, total));
      if (p) {
        p.vx *= 1.6;
        p.vy *= 1.6;
        this.ps.push(p);
      }
    }
  }

  clear() {
    this.ps.length = 0;
    this.carry = 0;
  }

  /** exponential relax of velocity toward the air */
  protected drag(p: P, dt: number, e: Emitter | null, k: number) {
    const wx = e ? e.worldVel.x : 0;
    const wy = e ? e.worldVel.y : 0;
    const f = 1 - Math.exp(-k * dt);
    p.vx += (wx - p.vx) * f;
    p.vy += (wy - p.vy) * f;
  }
}

/* ═══════════════════════ HEAT SHIFT — FLAMES ═══════════════════════ */

class Flames extends System {
  protected max = 900;
  private ramp: HTMLCanvasElement[];
  private ember: HTMLCanvasElement;

  constructor() {
    super();
    // white-hot core → Heat Shift orange → magenta → nothing
    const steps = [
      "rgba(255,236,190,0.75)",
      "rgba(255,196,96,0.72)",
      "rgba(255,140,44,0.68)",
      "rgba(255,92,26,0.6)",
      "rgba(236,52,70,0.45)",
      "rgba(224,33,138,0.3)",
      "rgba(120,20,80,0.14)",
    ];
    this.ramp = steps.map((c) => softSprite(c, 64));
    this.ember = softSprite("rgba(255,200,120,1)", 16, 0.25);
  }

  protected rate(e: Emitter) {
    return 110 + e.scale * 3;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    const ember = Math.random() < 0.08;
    return {
      x: at.x + rand(-0.04, 0.04) * s,
      y: at.y + rand(-0.04, 0.04) * s,
      vx: e.bodyVel.x * 0.85 + rand(-0.3, 0.3) * s,
      vy: e.bodyVel.y * 0.85 - rand(0.6, 1.4) * s,
      age: 0,
      life: ember ? rand(0.9, 1.6) : rand(0.4, 0.8),
      size: ember ? rand(0.018, 0.03) * s : rand(0.1, 0.22) * s,
      seed: Math.random() * 100,
      k: ember ? 1 : 0,
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const s = e ? e.scale : 100;
    this.drag(p, dt, e, p.k ? 1.6 : 4.2);
    // buoyancy: hot gas keeps climbing even as the air drags it back
    p.vy -= s * (p.k ? 1.2 : 2.6) * dt;
    // curl the tongues so they lick instead of float
    p.vx += Math.sin(this.t * 9 + p.seed) * s * 2.2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const n = this.ramp.length;
    for (const p of this.ps) {
      const f = p.age / p.life;
      if (p.k) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const a = 1 - f;
        ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(this.t * 30 + p.seed));
        const d = p.size * 2;
        ctx.drawImage(this.ember, p.x - d / 2, p.y - d / 2, d, d);
        continue;
      }
      // tongue profile: swell fast, taper slow
      const swell = Math.sin(Math.PI * Math.min(1, f * 1.6));
      const d = p.size * (0.55 + 0.7 * swell) * (1 - f * 0.55) * 2;
      const idx = Math.min(n - 1, Math.floor(f * n));
      ctx.globalAlpha = 1 - f * f;
      // stretch each puff along its motion so it reads as a tongue
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const st = Math.min(2.4, 1 + sp / (this.last ? this.last.scale * 6 : 600));
      ctx.setTransform(1, 0, 0, 1, p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.drawImage(this.ramp[idx], (-d * st) / 2, -d / 2, d * st, d);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.restore();
  }
}

/* ═══════════════════════ DEEP SPACE — STAR TRAIL ═══════════════════ */

class Stars extends System {
  protected max = 1100;
  private glow: HTMLCanvasElement[];
  private nebula: HTMLCanvasElement[];
  private tints = ["#ffffff", "#d8d0ff", "#9fe8ff", "#ffd9f4"];

  constructor() {
    super();
    this.glow = this.tints.map((c) => softSprite(c, 32, 0.12));
    this.nebula = [
      softSprite("rgba(110,70,255,0.5)", 96),
      softSprite("rgba(40,170,190,0.45)", 96),
      softSprite("rgba(200,60,200,0.4)", 96),
    ];
  }

  protected rate(e: Emitter) {
    return 60 + e.scale * 1.1;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    const neb = Math.random() < 0.07;
    const r = s * (neb ? 0.15 : 0.35);
    const a = Math.random() * Math.PI * 2;
    return {
      x: at.x + Math.cos(a) * r * Math.random(),
      y: at.y + Math.sin(a) * r * Math.random(),
      // stars are flung off and then hang in the world
      vx: e.bodyVel.x * 0.5 + rand(-0.25, 0.25) * s,
      vy: e.bodyVel.y * 0.5 + rand(-0.25, 0.15) * s,
      age: 0,
      life: neb ? rand(1.6, 2.6) : rand(1.4, 3.2),
      size: neb ? rand(0.6, 1.1) * s : rand(0.012, 0.03) * s,
      seed: Math.random() * 100,
      k: neb ? 10 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 4),
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    this.drag(p, dt, e, 3.2);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // nebula haze under the stars
    for (const p of this.ps) {
      if (p.k < 10) continue;
      const f = p.age / p.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.22;
      const d = p.size * (0.8 + f * 0.6);
      ctx.drawImage(this.nebula[p.k - 10], p.x - d / 2, p.y - d / 2, d, d);
    }

    for (const p of this.ps) {
      if (p.k >= 10) continue;
      const f = p.age / p.life;
      const fade = Math.min(1, f * 8) * (1 - f);
      const tw = 0.55 + 0.45 * Math.sin(this.t * (6 + (p.seed % 5)) + p.seed);
      const a = fade * tw;
      const d = p.size * 7;
      ctx.globalAlpha = a;
      ctx.drawImage(this.glow[p.k], p.x - d / 2, p.y - d / 2, d, d);

      // the brightest stars get a four-point flare
      if (p.seed < 14) {
        const L = p.size * 9 * tw;
        ctx.globalAlpha = a * 0.7;
        ctx.strokeStyle = this.tints[p.k];
        ctx.lineWidth = Math.max(0.6, p.size * 0.18);
        ctx.beginPath();
        ctx.moveTo(p.x - L, p.y);
        ctx.lineTo(p.x + L, p.y);
        ctx.moveTo(p.x, p.y - L);
        ctx.lineTo(p.x, p.y + L);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/* ═══════════════════════ BONE PEARL — MIST ═════════════════════════ */

class Mist extends System {
  protected max = 260;
  private sprites: HTMLCanvasElement[];

  constructor() {
    super();
    this.sprites = [
      softSprite("rgba(244,238,228,0.55)", 128),
      softSprite("rgba(246,214,228,0.5)", 128),
      softSprite("rgba(208,240,232,0.5)", 128),
      softSprite("rgba(255,250,240,0.6)", 128),
    ];
  }

  protected rate(e: Emitter) {
    return 18 + e.scale * 0.26;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    return {
      x: at.x + rand(-0.08, 0.08) * s,
      y: at.y + rand(-0.05, 0.08) * s,
      vx: e.bodyVel.x * 0.6 + rand(-0.3, 0.3) * s,
      // mist is heavier than air — it rolls down and out
      vy: e.bodyVel.y * 0.6 + rand(-0.15, 0.3) * s,
      age: 0,
      life: rand(1.4, 3.4),
      size: rand(0.18, 0.55) * s,
      seed: Math.random() * 100,
      k: Math.floor(Math.random() * 4),
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const s = e ? e.scale : 100;
    this.drag(p, dt, e, 1.6);
    p.vx += Math.sin(this.t * 1.3 + p.seed) * s * 0.25 * dt;
    // it settles toward the road as it thins out
    p.vy += s * 0.18 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of this.ps) {
      const f = p.age / p.life;
      ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, f * 1.15)) * 0.24;
      const d = p.size * (1 + f * 2.2) * 2;
      ctx.drawImage(this.sprites[p.k], p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ LIQUID CHROME — BUBBLES ═══════════════════ */

class Bubbles extends System {
  protected max = 140;
  private bubble: HTMLCanvasElement;
  private pops: { x: number; y: number; r: number; age: number }[] = [];
  private drops: P[] = [];
  private drop: HTMLCanvasElement;

  constructor() {
    super();
    this.bubble = Bubbles.render(128);
    this.drop = softSprite("rgba(220,250,255,0.9)", 16, 0.3);
  }

  /** One chrome bubble: clear body, iridescent rim, window highlight. */
  private static render(size: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const r = size / 2;

    // faint body so it reads against dark and light video alike
    const body = g.createRadialGradient(r, r, r * 0.55, r, r, r);
    body.addColorStop(0, "rgba(200,230,255,0.02)");
    body.addColorStop(0.82, "rgba(190,220,255,0.10)");
    body.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = body;
    g.fillRect(0, 0, size, size);

    // iridescent rim — conic where supported, banded arcs elsewhere
    g.lineWidth = size * 0.035;
    const ringR = r * 0.9;
    const hues = ["#ff7ad9", "#8a7cff", "#3fd1c6", "#d9f99d", "#ffb627", "#ff7ad9"];
    if (typeof g.createConicGradient === "function") {
      const cg = g.createConicGradient(-Math.PI / 3, r, r);
      hues.forEach((h, i) => cg.addColorStop(i / (hues.length - 1), h));
      g.strokeStyle = cg;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(r, r, ringR, 0, Math.PI * 2);
      g.stroke();
    } else {
      const step = (Math.PI * 2) / (hues.length - 1);
      for (let i = 0; i < hues.length - 1; i++) {
        g.strokeStyle = hues[i];
        g.globalAlpha = 0.85;
        g.beginPath();
        g.arc(r, r, ringR, i * step, (i + 1) * step);
        g.stroke();
      }
    }

    // chrome window highlight + specular
    g.globalAlpha = 0.75;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = size * 0.03;
    g.beginPath();
    g.arc(r, r, r * 0.68, Math.PI * 1.1, Math.PI * 1.45);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.arc(r * 0.62, r * 0.55, size * 0.035, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  protected rate(e: Emitter) {
    return 9 + e.scale * 0.1;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    return {
      x: at.x + rand(-0.05, 0.05) * s,
      y: at.y,
      vx: e.bodyVel.x * 0.7 + rand(-0.15, 0.15) * s,
      vy: e.bodyVel.y * 0.7 - rand(0.35, 0.8) * s,
      age: 0,
      life: rand(1.6, 3),
      size: rand(0.055, 0.15) * s,
      seed: Math.random() * 100,
      k: Math.random() * Math.PI * 2,
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const s = e ? e.scale : 100;
    this.drag(p, dt, e, 1.1);
    p.vy -= s * 0.5 * dt;
    p.vx += Math.sin(this.t * 3 + p.seed) * s * 0.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  protected onDeath(p: P) {
    this.pops.push({ x: p.x, y: p.y, r: p.size, age: 0 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random();
      const sp = p.size * rand(4, 8);
      this.drops.push({
        x: p.x + Math.cos(a) * p.size,
        y: p.y + Math.sin(a) * p.size,
        vx: Math.cos(a) * sp + p.vx * 0.5,
        vy: Math.sin(a) * sp + p.vy * 0.5,
        age: 0,
        life: rand(0.25, 0.45),
        size: Math.max(1.5, p.size * 0.12),
        seed: 0,
        k: 0,
      });
    }
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    super.update(dt, e, intensity);
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const q = this.pops[i];
      q.age += dt;
      if (q.age > 0.22) this.pops.splice(i, 1);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age > d.life) {
        this.drops.splice(i, 1);
        continue;
      }
      d.vy += 900 * dt * 0.3;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
  }

  clear() {
    super.clear();
    this.pops.length = 0;
    this.drops.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.ps) {
      const f = p.age / p.life;
      ctx.globalAlpha = Math.min(1, f * 6) * (f > 0.92 ? (1 - f) / 0.08 : 1);
      const d = p.size * 2;
      // rotate the sprite so the rim colors don't all line up
      const wob = 1 + Math.sin(this.t * 7 + p.seed) * 0.04;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.k + this.t * 0.4);
      ctx.scale(wob, 2 - wob);
      ctx.drawImage(this.bubble, -d / 2, -d / 2, d, d);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.strokeStyle = "rgba(220,245,255,0.9)";
    for (const q of this.pops) {
      const f = q.age / 0.22;
      ctx.globalAlpha = 1 - f;
      ctx.lineWidth = Math.max(1, q.r * 0.08);
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (1 + f * 1.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "lighter";
    for (const d of this.drops) {
      ctx.globalAlpha = 1 - d.age / d.life;
      const s = d.size * 2.5;
      ctx.drawImage(this.drop, d.x - s / 2, d.y - s / 2, s, s);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ FULL REFLECT — LIGHT STREAKS ══════════════ */

class Streaks extends System {
  protected max = 520;
  private flare: HTMLCanvasElement;
  private flareAt = 1.2;
  private flares: { x: number; y: number; s: number; age: number }[] = [];

  constructor() {
    super();
    this.flare = softSprite("rgba(255,255,255,0.9)", 128, 0.04);
  }

  protected rate(e: Emitter) {
    return 55 + e.scale * 0.9;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    // streaks fly the way the air is moving relative to the wearer
    let dx = e.worldVel.x - e.bodyVel.x;
    let dy = e.worldVel.y - e.bodyVel.y;
    const m = Math.hypot(dx, dy);
    const minSpeed = s * 5;
    if (m < s * 1.2) {
      // standing still: throw light outward from the body's centre
      const c = centroid(e.path);
      dx = at.x < c.x ? -1 : 1;
      dy = rand(-0.12, 0.12);
    } else {
      dx /= m;
      dy /= m;
    }
    const sp = Math.max(m * 1.4, minSpeed) * rand(0.8, 1.3);
    return {
      x: at.x,
      y: at.y + rand(-0.03, 0.03) * s,
      vx: dx * sp,
      vy: dy * sp,
      age: 0,
      life: rand(0.25, 0.55),
      size: rand(0.6, 1.8),
      seed: Math.random() * 100,
      k: Math.random() < 0.18 ? 1 : 0,
    };
  }

  protected step(p: P, dt: number) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    super.update(dt, e, intensity);
    // a headlight sweep every couple of seconds
    if (e && intensity > 0.5) {
      this.flareAt -= dt;
      if (this.flareAt <= 0) {
        this.flareAt = rand(1.8, 3.2);
        const c = centroid(e.path);
        this.flares.push({ x: c.x, y: c.y, s: e.scale, age: 0 });
      }
    }
    for (let i = this.flares.length - 1; i >= 0; i--) {
      this.flares[i].age += dt;
      if (this.flares[i].age > 0.5) this.flares.splice(i, 1);
    }
  }

  clear() {
    super.clear();
    this.flares.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const s0 = this.last ? this.last.scale : 100;

    for (const p of this.ps) {
      const f = p.age / p.life;
      const a = Math.min(1, f * 10) * (1 - f);
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const L = sp * 0.09 + s0 * 0.25;
      const tx = p.x - (p.vx / sp) * L;
      const ty = p.y - (p.vy / sp) * L;
      const w = p.size * (s0 / 120) * (p.k ? 2.2 : 1);

      // chromatic fringe: cool above, warm below, white core
      ctx.globalAlpha = a * 0.45;
      ctx.lineWidth = w * 2.4;
      ctx.strokeStyle = "#6fa8ff";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - w * 0.8);
      ctx.lineTo(tx, ty - w * 0.8);
      ctx.stroke();
      ctx.strokeStyle = "#ffbf73";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + w * 0.8);
      ctx.lineTo(tx, ty + w * 0.8);
      ctx.stroke();

      const g = ctx.createLinearGradient(p.x, p.y, tx, ty);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = a;
      ctx.lineWidth = w;
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    for (const q of this.flares) {
      const f = q.age / 0.5;
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.55;
      const d = q.s * (2.2 + f * 1.2);
      ctx.drawImage(this.flare, q.x - d / 2, q.y - d / 2, d, d);
      // anamorphic bar — the tell of a real lens catching a headlight
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.35;
      ctx.drawImage(this.flare, q.x - d * 1.6, q.y - d * 0.04, d * 3.2, d * 0.08);
    }
    ctx.restore();
  }
}


/* ═══════════════════════ FOOTWEAR — FOOTSTRIKE ═════════════════════
   The one effect that isn't continuous. The emitter's path is the two
   shoes; each shoe draws a light ribbon behind it, and every touchdown
   in `strikes` lands as a ground shockwave plus a spray of sparks. */

type Ripple = { x: number; y: number; s: number; age: number };
type Trail = { x: number; y: number; age: number }[];

class Strike implements Effect {
  private t = 0;
  private sparks: P[] = [];
  private ripples: Ripple[] = [];
  private trails: Trail[] = [[], []];
  private last: Emitter | null = null;
  private intensity = 0;
  private spark: HTMLCanvasElement;
  private colors = ["#fff1c9", "#ffb627", "#ff5c1a", "#e0218a"];

  constructor() {
    this.spark = softSprite("rgba(255,214,140,1)", 24, 0.2);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const air = (this.last ?? e)?.worldVel ?? { x: 0, y: 0 };

    // ribbons: the world carries old points away, so they stretch out
    // behind a runner and pile up under someone standing still
    for (let i = 0; i < 2; i++) {
      const tr = this.trails[i];
      for (const q of tr) {
        q.age += dt;
        q.x += air.x * dt;
        q.y += air.y * dt;
      }
      while (tr.length && tr[0].age > 0.42) tr.shift();
      const foot = e?.path[i];
      if (foot && intensity > 0.05) tr.push({ x: foot.x, y: foot.y, age: 0 });
      else if (!e) tr.length = 0;
    }

    if (e?.strikes && intensity > 0.3) {
      for (const at of e.strikes) this.land(at, e);
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      r.x += air.x * dt;
      r.y += air.y * dt;
      if (r.age > 0.7) this.ripples.splice(i, 1);
    }

    const s = this.last?.scale ?? 100;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.sparks[i] = this.sparks[this.sparks.length - 1];
        this.sparks.pop();
        continue;
      }
      const f = 1 - Math.exp(-2.2 * dt);
      p.vx += (air.x - p.vx) * f;
      p.vy += s * 7 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private land(at: Vec, e: Emitter) {
    const s = e.scale;
    this.ripples.push({ x: at.x, y: at.y, s, age: 0 });
    const n = Math.round(14 + s * 0.12);
    for (let i = 0; i < n && this.sparks.length < 400; i++) {
      const a = -Math.PI / 2 + rand(-1.25, 1.25);
      const sp = rand(1.2, 3.2) * s;
      this.sparks.push({
        x: at.x + rand(-0.06, 0.06) * s,
        y: at.y,
        vx: Math.cos(a) * sp + e.worldVel.x * 0.4,
        vy: Math.sin(a) * sp,
        age: 0,
        life: rand(0.35, 0.75),
        size: rand(0.8, 1.8),
        seed: Math.random() * 100,
        k: Math.floor(Math.random() * this.colors.length),
      });
    }
  }

  ignite(e: Emitter) {
    for (const f of e.path) this.land(f, e);
  }

  clear() {
    this.sparks.length = 0;
    this.ripples.length = 0;
    this.trails = [[], []];
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s = this.last?.scale ?? 100;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // shockwaves: flat ellipses on the ground plane
    for (const r of this.ripples) {
      const f = r.age / 0.7;
      const ease = 1 - Math.pow(1 - f, 3);
      for (let k = 0; k < 2; k++) {
        const g = Math.max(0, ease - k * 0.18);
        if (g <= 0) continue;
        const rx = r.s * (0.15 + g * 1.5);
        ctx.globalAlpha = (1 - f) * (k ? 0.45 : 0.9);
        ctx.strokeStyle = k ? "#e0218a" : "#ffb627";
        ctx.lineWidth = Math.max(1, r.s * 0.022 * (1 - f * 0.6));
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rx, rx * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // the flash at contact
      if (f < 0.25) {
        ctx.globalAlpha = (1 - f / 0.25) * 0.8;
        const d = r.s * 0.9;
        ctx.drawImage(this.spark, r.x - d / 2, r.y - d / 4, d, d / 2);
      }
    }

    // light ribbons off each shoe
    for (const tr of this.trails) {
      if (tr.length < 2) continue;
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1];
        const b = tr[i];
        const life = 1 - b.age / 0.42;
        if (life <= 0) continue;
        ctx.globalAlpha = life * 0.85 * this.intensity;
        ctx.strokeStyle = i > tr.length - 4 ? "#fff1c9" : life > 0.5 ? "#ff8a3a" : "#e0218a";
        ctx.lineWidth = Math.max(1, s * 0.03 * life);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // sparks as short motion streaks with a glowing head
    for (const p of this.sparks) {
      const f = p.age / p.life;
      const a = 1 - f;
      ctx.globalAlpha = a;
      ctx.strokeStyle = this.colors[p.k];
      ctx.lineWidth = p.size * (s / 110);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
      ctx.stroke();
      const d = p.size * (s / 110) * 5;
      ctx.drawImage(this.spark, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ─────────────────────────── factory ─────────────────────────── */

export function createEffect(id: EffectId): Effect {
  switch (id) {
    case "flames":
      return new Flames();
    case "stars":
      return new Stars();
    case "mist":
      return new Mist();
    case "bubbles":
      return new Bubbles();
    case "streaks":
      return new Streaks();
    case "strike":
      return new Strike();
  }
}

export { rgba };
