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
  /**
   * Headwear only: the head as a circle. `up` points out of the crown,
   * `fwd` out of the face; both are unit vectors in screen space.
   */
  head?: { c: Vec; r: number; up: Vec; fwd: Vec; front?: boolean };
  /**
   * Mileage level, 0.45 (first miles) to 1.4 (legend). Scales how much
   * an effect emits and how big it reads. Defaults to 1.
   */
  power?: number;
  /** Chest point — where linked runners connect. */
  core?: Vec;
  /** The whole body as capsules [a, b, radius], for full-body effects. */
  body?: [Vec, Vec, number][];
  /**
   * Torso frame for effects anchored to the back. `side` is true when
   * the body is side-on to the camera (both shoulders overlap).
   */
  torso?: { neck: Vec; pelvis: Vec; lSh: Vec; rSh: Vec; up: Vec; fwd: Vec; side: boolean };
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
      const power = e.power ?? 1;
      this.carry += this.rate(e) * intensity * power * dt;
      const total = pathLength(e.path);
      const cap = this.max * Math.max(1, power);
      const grow = 0.7 + 0.3 * power;
      while (this.carry >= 1) {
        this.carry -= 1;
        if (this.ps.length >= cap) break;
        const p = this.spawn(e, samplePath(e.path, total));
        if (p) {
          p.size *= grow;
          this.ps.push(p);
        }
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
    const power = e.power ?? 1;
    this.ripples.push({ x: at.x, y: at.y, s: s * (0.7 + 0.3 * power), age: 0 });
    const n = Math.round((14 + s * 0.12) * power);
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


/* ═══════════════════════ FOOTWEAR — FROST STEP ═════════════════════
   Each touchdown freezes a patch of road: an ice print with crystal
   branches growing out of it, a puff of cold air and a few shards. The
   prints stay put in the world, so a runner leaves a line of them that
   melts away behind. */

type Print = {
  x: number;
  y: number;
  s: number;
  age: number;
  /** crystal branches in unit space: [angle, length, [tickAt, tickLen][]] */
  arms: [number, number, [number, number][]][];
};

class Frost implements Effect {
  private t = 0;
  private prints: Print[] = [];
  private shards: P[] = [];
  private puffs: P[] = [];
  private trails: Trail[] = [[], []];
  private last: Emitter | null = null;
  private intensity = 0;
  private puff: HTMLCanvasElement;
  private glint: HTMLCanvasElement;
  private static LIFE = 2.2;

  constructor() {
    this.puff = softSprite("rgba(214,240,255,0.55)", 96);
    this.glint = softSprite("rgba(230,250,255,1)", 24, 0.2);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const air = (this.last ?? e)?.worldVel ?? { x: 0, y: 0 };
    const s = this.last?.scale ?? 100;

    for (let i = 0; i < 2; i++) {
      const tr = this.trails[i];
      for (const q of tr) {
        q.age += dt;
        q.x += air.x * dt;
        q.y += air.y * dt;
      }
      while (tr.length && tr[0].age > 0.3) tr.shift();
      const foot = e?.path[i];
      if (foot && intensity > 0.05) tr.push({ x: foot.x, y: foot.y, age: 0 });
      else if (!e) tr.length = 0;
    }

    if (e?.strikes && intensity > 0.3) for (const at of e.strikes) this.freeze(at, e);

    for (let i = this.prints.length - 1; i >= 0; i--) {
      const p = this.prints[i];
      p.age += dt;
      p.x += air.x * dt;
      p.y += air.y * dt;
      if (p.age > Frost.LIFE) this.prints.splice(i, 1);
    }
    const tick = (list: P[], grav: number, k: number) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
          list[i] = list[list.length - 1];
          list.pop();
          continue;
        }
        const f = 1 - Math.exp(-k * dt);
        p.vx += (air.x - p.vx) * f;
        p.vy += grav * s * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    };
    tick(this.shards, 6, 2);
    tick(this.puffs, -0.15, 2.5);
  }

  private freeze(at: Vec, e: Emitter) {
    const s = e.scale;
    const arms: Print["arms"] = [];
    const n = 7 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
      const len = rand(0.45, 0.95);
      const ticks: [number, number][] = [];
      for (let k = 0; k < 3; k++) ticks.push([rand(0.3, 0.85), rand(0.12, 0.28)]);
      arms.push([a, len, ticks]);
    }
    this.prints.push({ x: at.x, y: at.y, s, age: 0, arms });
    if (this.prints.length > 14) this.prints.shift();

    const power = e.power ?? 1;
    if (power < 1) for (const arm of arms) arm[1] *= 0.6 + 0.4 * power;
    for (let i = 0; i < Math.round(10 * power) && this.shards.length < 200; i++) {
      const a = -Math.PI / 2 + rand(-1.3, 1.3);
      const sp = rand(0.8, 2.2) * s;
      this.shards.push({
        x: at.x, y: at.y,
        vx: Math.cos(a) * sp + e.worldVel.x * 0.4,
        vy: Math.sin(a) * sp * 0.7,
        age: 0, life: rand(0.35, 0.6), size: rand(0.02, 0.04) * s,
        seed: Math.random() * Math.PI * 2, k: 0,
      });
    }
    for (let i = 0; i < 4 && this.puffs.length < 60; i++) {
      this.puffs.push({
        x: at.x + rand(-0.15, 0.15) * s, y: at.y - rand(0, 0.06) * s,
        vx: e.worldVel.x * 0.5 + rand(-0.4, 0.4) * s, vy: -rand(0.05, 0.25) * s,
        age: 0, life: rand(0.8, 1.3), size: rand(0.25, 0.45) * s,
        seed: 0, k: 0,
      });
    }
  }

  ignite(e: Emitter) {
    for (const f of e.path) this.freeze(f, e);
  }

  clear() {
    this.prints.length = 0;
    this.shards.length = 0;
    this.puffs.length = 0;
    this.trails = [[], []];
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s0 = this.last?.scale ?? 100;
    ctx.save();
    ctx.lineCap = "round";

    // ice prints: a glassy pool plus crystal arms that grow out fast
    for (const p of this.prints) {
      const f = p.age / Frost.LIFE;
      const grow = 1 - Math.pow(1 - Math.min(1, p.age / 0.28), 3);
      const melt = f < 0.55 ? 1 : 1 - (f - 0.55) / 0.45;
      const flat = 0.2; // ground plane squash
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.32 * melt;
      ctx.fillStyle = "#bfe9ff";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.s * 0.34 * grow, p.s * 0.34 * grow * flat, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "#e6f8ff";
      for (const [a, len, ticks] of p.arms) {
        const L = p.s * len * grow;
        const ex = p.x + Math.cos(a) * L;
        const ey = p.y + Math.sin(a) * L * flat;
        ctx.globalAlpha = 0.85 * melt;
        ctx.lineWidth = Math.max(1, p.s * 0.012);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ex, ey);
        for (const [at, tl] of ticks) {
          const bx = p.x + Math.cos(a) * L * at;
          const by = p.y + Math.sin(a) * L * at * flat;
          const tL = p.s * tl * grow;
          for (const side of [-0.7, 0.7]) {
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(a + side) * tL, by + Math.sin(a + side) * tL * flat);
          }
        }
        ctx.stroke();
      }
      if (p.age < 0.2) {
        ctx.globalAlpha = (1 - p.age / 0.2) * 0.9;
        const d = p.s * 0.8;
        ctx.drawImage(this.glint, p.x - d / 2, p.y - d / 4, d, d / 2);
      }
    }

    // cold air
    ctx.globalCompositeOperation = "screen";
    for (const q of this.puffs) {
      const f = q.age / q.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.35;
      const d = q.size * (1 + f * 1.5) * 2;
      ctx.drawImage(this.puff, q.x - d / 2, q.y - d / 2, d, d * 0.6);
    }

    // icy ribbons off the shoes
    ctx.globalCompositeOperation = "lighter";
    for (const tr of this.trails) {
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1];
        const b = tr[i];
        const life = 1 - b.age / 0.3;
        if (life <= 0) continue;
        ctx.globalAlpha = life * 0.7 * this.intensity;
        ctx.strokeStyle = life > 0.6 ? "#f2fcff" : "#7fd3ff";
        ctx.lineWidth = Math.max(1, s0 * 0.022 * life);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // shards: tiny spinning diamonds
    ctx.fillStyle = "#eafaff";
    for (const p of this.shards) {
      const f = p.age / p.life;
      ctx.globalAlpha = 1 - f;
      const r = p.size;
      const a = p.seed + p.age * 14;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      ctx.lineTo(p.x + Math.cos(a + 1.9) * r * 0.4, p.y + Math.sin(a + 1.9) * r * 0.4);
      ctx.lineTo(p.x + Math.cos(a + Math.PI) * r, p.y + Math.sin(a + Math.PI) * r);
      ctx.lineTo(p.x + Math.cos(a - 1.2) * r * 0.4, p.y + Math.sin(a - 1.2) * r * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ═══════════════════════ HEADWEAR — VICTORY LAUREL ═════════════════
   The one effect that is an object, not a particle system: a laurel
   wreath of gold light that grows leaf by leaf around the head, with
   dust shedding off it. A nod to where the brand started — Greek and
   Roman victors wore laurel. */

class Laurel implements Effect {
  private t = 0;
  private grow = 0;
  private dust: P[] = [];
  private head: Emitter["head"] | null = null;
  private last: Emitter | null = null;
  private glow: HTMLCanvasElement;
  private mote: HTMLCanvasElement;
  private static LEAVES = 13; // per branch

  constructor() {
    this.glow = softSprite("rgba(255,200,90,0.5)", 96);
    this.mote = softSprite("rgba(255,224,150,1)", 16, 0.25);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    if (e?.head) this.head = e.head;
    // leaves arrive one by one, fall away faster
    const target = intensity > 0.3 ? 1 : 0;
    this.grow += (target - this.grow) * (1 - Math.exp(-(target ? 1.6 : 6) * dt));

    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    const h = e?.head;
    if (h && this.grow > 0.6 && this.dust.length < 160) {
      const n = Math.random() < dt * 70 * (e?.power ?? 1) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const t = Math.random() * Math.PI * 2;
        const p = this.ring(h, t);
        this.dust.push({
          x: p.x, y: p.y,
          vx: (e?.bodyVel.x ?? 0) * 0.6 + rand(-0.2, 0.2) * h.r,
          vy: -rand(0.3, 0.9) * h.r,
          age: 0, life: rand(0.9, 1.8), size: rand(0.07, 0.15) * h.r,
          seed: Math.random() * 100, k: 0,
        });
      }
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const p = this.dust[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.dust.splice(i, 1);
        continue;
      }
      const f = 1 - Math.exp(-1.8 * dt);
      p.vx += (air.x - p.vx) * f;
      p.vx += Math.sin(this.t * 3 + p.seed) * 0.6 * (this.head?.r ?? 20) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** a point on the wreath; t = 0 is the front of the head */
  private ring(h: NonNullable<Emitter["head"]>, t: number): Vec {
    const c = { x: h.c.x + h.up.x * h.r * 0.3, y: h.c.y + h.up.y * h.r * 0.3 };
    const rx = h.r * 1.3;
    const ry = h.r * 0.4;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    // fwd is the ring's long axis, up tilts it with the head
    return {
      x: c.x + h.fwd.x * x - h.up.x * y,
      y: c.y + h.fwd.y * x - h.up.y * y,
    };
  }

  ignite() {
    this.grow = Math.max(this.grow, 0.05);
  }

  clear() {
    this.dust.length = 0;
    this.grow = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const h = this.head;
    if (!h || this.grow < 0.01) return;
    ctx.save();

    // a warm halo behind everything
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * this.grow;
    const hc = this.ring(h, Math.PI / 2);
    const d = h.r * 7;
    ctx.drawImage(this.glow, (h.c.x + hc.x) / 2 - d / 2, (h.c.y + hc.y) / 2 - d / 2, d, d);

    // two branches start at the back of the head and meet at the brow
    const N = Laurel.LEAVES;
    // early miles grow a sparse sprig; a legend wears the full wreath
    const power = this.last?.power ?? 1;
    const shown = this.grow * N * Math.min(1, 0.35 + 0.65 * power);
    for (const pass of [0, 1]) {
      for (const side of [1, -1]) {
        for (let i = 0; i < N; i++) {
          const k = Math.min(1, Math.max(0, shown - i));
          if (k <= 0) continue;
          // from the back (π) toward the front (0, 2π)
          const u = (i + 0.5) / N;
          const t = side > 0 ? Math.PI - u * Math.PI * 0.92 : Math.PI + u * Math.PI * 0.92;
          // back half (sin > 0 after the up-flip) sits behind the head
          const behind = Math.sin(t) > 0;
          if ((pass === 0) !== behind) continue;
          const p = this.ring(h, t);
          const q = this.ring(h, t - side * 0.15);
          const ang = Math.atan2(q.y - p.y, q.x - p.x);
          const sway = Math.sin(this.t * 2.2 + i * 0.7) * 0.08;
          const len = h.r * 0.55 * k * (1 - u * 0.2);
          const wid = len * 0.36;
          for (const out of [-1, 1]) {
            const a = ang + out * (0.55 + sway);
            this.leaf(ctx, p, a, len, wid, behind ? 0.45 : 1);
          }
        }
      }
    }

    // a ribbon knot at the back
    const back = this.ring(h, Math.PI);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.8 * this.grow;
    ctx.fillStyle = "#ffd36b";
    ctx.beginPath();
    ctx.arc(back.x, back.y, h.r * 0.07, 0, Math.PI * 2);
    ctx.fill();

    for (const p of this.dust) {
      const f = p.age / p.life;
      ctx.globalAlpha = (1 - f) * (0.6 + 0.4 * Math.sin(this.t * 12 + p.seed));
      const dd = p.size * 4;
      ctx.drawImage(this.mote, p.x - dd / 2, p.y - dd / 2, dd, dd);
    }
    ctx.restore();
  }

  private leaf(ctx: CanvasRenderingContext2D, at: Vec, a: number, len: number, wid: number, alpha: number) {
    // the stage draws in device pixels with an identity transform
    ctx.setTransform(1, 0, 0, 1, at.x, at.y);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, -wid, len, wid);
    g.addColorStop(0, "#fff0b8");
    g.addColorStop(0.5, "#ffc94d");
    g.addColorStop(1, "#b6873f");
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha * Math.min(1, this.grow * 1.4);
    ctx.shadowColor = "rgba(255,190,80,0.9)";
    ctx.shadowBlur = wid * 1.6;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha *= 0.6;
    ctx.strokeStyle = "rgba(120,80,20,0.7)";
    ctx.lineWidth = Math.max(0.6, wid * 0.12);
    ctx.beginPath();
    ctx.moveTo(len * 0.08, 0);
    ctx.lineTo(len * 0.85, 0);
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/* ═══════════════════════ HEADWEAR — STEAM ══════════════════════════
   Heat coming off a hard effort: steam rolls up off the crown and the
   air blows it back, and every couple of strides a breath hangs in
   front of the face. */

class Steam extends System {
  protected max = 220;
  private sprites: HTMLCanvasElement[];
  private breathAt = 0.6;

  constructor() {
    super();
    this.sprites = [
      softSprite("rgba(240,244,248,0.5)", 128),
      softSprite("rgba(226,234,242,0.45)", 128),
      softSprite("rgba(255,255,255,0.55)", 128),
    ];
  }

  protected rate(e: Emitter) {
    return 16 + e.scale * 0.2;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const r = e.head?.r ?? e.scale * 0.3;
    const up = e.head?.up ?? { x: 0, y: -1 };
    return {
      x: at.x,
      y: at.y,
      vx: e.bodyVel.x * 0.7 + up.x * r * 1.2 + rand(-0.3, 0.3) * r,
      vy: e.bodyVel.y * 0.7 + up.y * r * rand(1.2, 2.4),
      age: 0,
      life: rand(1.2, 2.2),
      size: rand(0.5, 0.9) * r,
      seed: Math.random() * 100,
      k: Math.floor(Math.random() * 3),
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const r = e?.head?.r ?? 20;
    this.drag(p, dt, e, 1.4);
    p.vy -= r * 1.6 * dt; // warm air keeps rising
    p.vx += Math.sin(this.t * 1.7 + p.seed) * r * 1.4 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    super.update(dt, e, intensity);
    if (!e?.head || intensity < 0.5) return;
    this.breathAt -= dt;
    if (this.breathAt > 0) return;
    this.breathAt = rand(0.9, 1.4);
    const h = e.head;
    const mouth = {
      x: h.c.x + h.fwd.x * h.r * 1.05 - h.up.x * h.r * 0.45,
      y: h.c.y + h.fwd.y * h.r * 1.05 - h.up.y * h.r * 0.45,
    };
    for (let i = 0; i < 5 && this.ps.length < this.max; i++) {
      this.ps.push({
        x: mouth.x,
        y: mouth.y,
        vx: e.bodyVel.x + h.fwd.x * h.r * rand(1.5, 3),
        vy: e.bodyVel.y + h.fwd.y * h.r * rand(1.5, 3) + rand(-0.3, 0.2) * h.r,
        age: 0,
        life: rand(0.8, 1.3),
        size: rand(0.35, 0.6) * h.r,
        seed: Math.random() * 100,
        k: 2,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of this.ps) {
      const f = p.age / p.life;
      ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, f * 1.2)) * (p.k === 2 ? 0.45 : 0.32);
      const d = p.size * (1 + f * 2.4) * 2;
      ctx.drawImage(this.sprites[p.k], p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}


/* ─────────────────────────── shared helpers ─────────────────────── */

function lerpV(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function normV(a: Vec): Vec {
  const m = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / m, y: a.y / m };
}
function levelOf(power: number): 1 | 2 | 3 | 4 {
  return power >= 1.3 ? 4 : power >= 0.95 ? 3 : power >= 0.65 ? 2 : 1;
}
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** sample a color ramp at t in [0, 1] */
function rampAt(stops: string[], t: number, a = 1): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const p = hexRgb(stops[i]);
  const q = hexRgb(stops[i + 1]);
  const c = p.map((v, k) => Math.round(v + (q[k] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function cubic(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}
function quad(p0: Vec, p1: Vec, p2: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}
/** capsule outline as a path (caller fills) */
function capsulePath(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, r: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.moveTo(a.x + Math.cos(ang + Math.PI / 2) * r, a.y + Math.sin(ang + Math.PI / 2) * r);
  ctx.arc(a.x, a.y, r, ang + Math.PI / 2, ang + (3 * Math.PI) / 2);
  ctx.arc(b.x, b.y, r, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}

/* ═══════════════════════ FOOTWEAR — EMBER PRINTS ═══════════════════
   Every footstrike burns a print into the road. It starts white-hot
   and cools through gold, orange and red to char, smoking as it goes.
   Embers drip off the shoes in between. */

type Burn = { x: number; y: number; s: number; age: number; life: number };

class Embers implements Effect {
  private t = 0;
  private prints: Burn[] = [];
  private sparks: P[] = [];
  private smoke: P[] = [];
  private drips: P[] = [];
  private last: Emitter | null = null;
  private intensity = 0;
  private glow: HTMLCanvasElement;
  private dot: HTMLCanvasElement;
  private puff: HTMLCanvasElement;
  private heat = ["#2a1210", "#8f1d16", "#ff5c1a", "#ffb627", "#fff4d6"];

  constructor() {
    this.glow = softSprite("rgba(255,140,50,0.8)", 64);
    this.dot = softSprite("rgba(255,200,120,1)", 16, 0.25);
    this.puff = softSprite("rgba(90,84,80,0.5)", 64);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    const s = this.last?.scale ?? 100;
    const power = this.last?.power ?? 1;

    if (e?.strikes && intensity > 0.3) {
      for (const at of e.strikes) {
        this.prints.push({ x: at.x, y: at.y, s, age: 0, life: 1.0 + 1.2 * power });
        for (let i = 0; i < Math.round(8 * power); i++) {
          const a = -Math.PI / 2 + rand(-1.1, 1.1);
          const sp = rand(0.8, 2.2) * s;
          this.sparks.push({
            x: at.x, y: at.y, vx: Math.cos(a) * sp + air.x * 0.3, vy: Math.sin(a) * sp,
            age: 0, life: rand(0.3, 0.6), size: rand(0.8, 1.6), seed: 0, k: 0,
          });
        }
      }
      if (this.prints.length > 16) this.prints.shift();
    }

    // drips off the shoes
    if (e && intensity > 0.2) {
      for (const f of e.path) {
        if (Math.random() < dt * 14 * power) {
          this.drips.push({
            x: f.x + rand(-0.05, 0.05) * s, y: f.y,
            vx: (e.bodyVel.x ?? 0) * 0.5 + rand(-0.2, 0.2) * s, vy: -rand(0, 0.4) * s,
            age: 0, life: rand(0.4, 0.8), size: rand(0.8, 1.4), seed: Math.random() * 10, k: 0,
          });
        }
      }
    }

    for (let i = this.prints.length - 1; i >= 0; i--) {
      const p = this.prints[i];
      p.age += dt;
      p.x += air.x * dt;
      p.y += air.y * dt;
      if (p.age > p.life) {
        this.prints.splice(i, 1);
        continue;
      }
      // hot prints smoke
      const heat = 1 - p.age / p.life;
      if (heat > 0.2 && Math.random() < dt * 10 && this.smoke.length < 90) {
        this.smoke.push({
          x: p.x + rand(-0.15, 0.15) * p.s, y: p.y,
          vx: air.x * 0.2, vy: -rand(0.2, 0.5) * p.s,
          age: 0, life: rand(0.9, 1.6), size: rand(0.12, 0.22) * p.s, seed: Math.random() * 10, k: 0,
        });
      }
    }

    const move = (list: P[], grav: number, k: number, wobble = 0) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
          list[i] = list[list.length - 1];
          list.pop();
          continue;
        }
        const f = 1 - Math.exp(-k * dt);
        p.vx += (air.x - p.vx) * f;
        p.vy += grav * s * dt;
        if (wobble) p.vx += Math.sin(this.t * 2 + p.seed) * wobble * s * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    };
    move(this.sparks, 6, 2);
    move(this.drips, 3, 2.5);
    move(this.smoke, -0.3, 1.2, 0.6);
  }

  ignite(e: Emitter) {
    for (const f of e.path) {
      this.prints.push({ x: f.x, y: f.y, s: e.scale, age: 0, life: 1.4 + 1.6 * (e.power ?? 1) });
    }
  }

  clear() {
    this.prints.length = 0;
    this.sparks.length = 0;
    this.smoke.length = 0;
    this.drips.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    // prints: forefoot + heel, flat on the road
    for (const p of this.prints) {
      // cools fast from white, then lingers as red and char
      const heat = Math.pow(1 - p.age / p.life, 1.7);
      const fade = heat < 0.06 ? heat / 0.06 : 1;
      const col = rampAt(this.heat, heat, 0.95 * fade);
      ctx.globalCompositeOperation = heat > 0.3 ? "lighter" : "source-over";
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(p.x + p.s * 0.14, p.y, p.s * 0.26, p.s * 0.055, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - p.s * 0.26, p.y, p.s * 0.15, p.s * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      if (heat > 0.3) {
        ctx.globalAlpha = (heat - 0.3) * 1.1;
        const d = p.s * 1.5;
        ctx.drawImage(this.glow, p.x - d / 2, p.y - d * 0.2, d, d * 0.4);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = "source-over";
    for (const q of this.smoke) {
      const f = q.age / q.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.35;
      const d = q.size * (1 + f * 2) * 2;
      ctx.drawImage(this.puff, q.x - d / 2, q.y - d / 2, d, d);
    }
    ctx.globalCompositeOperation = "lighter";
    const s0 = this.last?.scale ?? 100;
    for (const p of [...this.sparks, ...this.drips]) {
      const f = p.age / p.life;
      ctx.globalAlpha = (1 - f) * this.intensity;
      const d = p.size * (s0 / 110) * 4;
      ctx.drawImage(this.dot, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ HEADWEAR — VISOR HUD ══════════════════════
   A holographic readout beside the runner's head. The numbers are
   simulated (and say so); in production a watch feeds them. Higher
   levels unlock more readouts. */

class Hud implements Effect {
  private t = 0;
  private boot = 0;
  private head: Emitter["head"] | null = null;
  private last: Emitter | null = null;
  private dist = 2.84; // a few miles in, so the readout looks like a real run
  private splits: number[] = [];
  private splitAt = 0;

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    if (e?.head) this.head = e.head;
    const target = intensity > 0.3 ? 1 : 0;
    this.boot += (target - this.boot) * (1 - Math.exp(-(target ? 2.2 : 8) * dt));
    const pace = this.pace();
    this.dist += dt / pace; // miles, at seconds-per-mile pace
    this.splitAt -= dt;
    if (this.splitAt <= 0) {
      this.splitAt = 0.35;
      this.splits.push(pace);
      if (this.splits.length > 24) this.splits.shift();
    }
  }

  /** seconds per mile: 7:12 give or take, drifting like a real run */
  private pace() {
    return 432 + Math.sin(this.t * 0.6) * 9 + Math.sin(this.t * 1.7 + 1) * 4;
  }
  private hr() {
    return Math.round(154 + Math.sin(this.t * 0.4) * 5 + Math.sin(this.t * 1.3) * 2);
  }

  ignite() {
    this.boot = Math.max(this.boot, 0.02);
  }

  clear() {
    this.boot = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const h = this.head;
    if (!h || this.boot < 0.01) return;
    const level = levelOf(this.last?.power ?? 1);
    const r = h.r;
    const W = ctx.canvas.width;
    const cyan = "#7ff0ff";

    const rows = level === 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 4;
    const pw = r * 4.2;
    const ph = r * (0.9 + rows * 0.95);
    // ahead of the face; flip to the other side if it would leave the frame
    let side = 1;
    let ax = h.c.x + h.fwd.x * r * 2.1;
    if (ax + pw > W - r * 0.6 || ax < r * 0.6) {
      side = -1;
      ax = h.c.x - h.fwd.x * r * 2.1 - pw;
    }
    const ay = h.c.y - h.up.y * r * 1.1 - ph * 0.5 - r * 0.2;

    ctx.save();
    const flicker = this.boot < 0.98 ? 0.6 + 0.4 * Math.sin(this.t * 60) : 1;
    ctx.globalAlpha = this.boot * flicker;

    // tether from the visor brim to the panel
    const brim = {
      x: h.c.x + h.fwd.x * r * 1.1 * side - h.up.x * r * 0.1,
      y: h.c.y + h.fwd.y * r * 1.1 * side - h.up.y * r * 0.1,
    };
    ctx.strokeStyle = "rgba(127,240,255,0.55)";
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.setLineDash([r * 0.12, r * 0.1]);
    ctx.beginPath();
    ctx.moveTo(brim.x, brim.y);
    ctx.lineTo(side > 0 ? ax : ax + pw, ay + ph * 0.55);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.translate(ax, ay);
    ctx.transform(1, side * -0.05, 0, 1, 0, 0); // a little perspective
    // boot wipe: the panel draws in top to bottom
    ctx.beginPath();
    ctx.rect(-4, -4, pw + 8, (ph + 8) * this.boot);
    ctx.clip();

    ctx.fillStyle = "rgba(8,28,36,0.42)";
    ctx.fillRect(0, 0, pw, ph);
    ctx.fillStyle = "rgba(127,240,255,0.05)";
    for (let y = 0; y < ph; y += Math.max(3, r * 0.08)) ctx.fillRect(0, y, pw, 1);

    // corner brackets
    const c = r * 0.35;
    ctx.strokeStyle = cyan;
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    for (const [x, y, dx, dy] of [
      [0, 0, 1, 1],
      [pw, 0, -1, 1],
      [0, ph, 1, -1],
      [pw, ph, -1, -1],
    ] as const) {
      ctx.moveTo(x + dx * c, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * c);
    }
    ctx.stroke();

    const pad = r * 0.35;
    const lab = `${Math.round(r * 0.26)}px ui-monospace, "SF Mono", Menlo, monospace`;
    const big = `600 ${Math.round(r * 0.62)}px ui-monospace, "SF Mono", Menlo, monospace`;
    const mid = `500 ${Math.round(r * 0.42)}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.shadowColor = "rgba(127,240,255,0.8)";
    ctx.shadowBlur = r * 0.25;
    ctx.textBaseline = "alphabetic";

    ctx.font = lab;
    ctx.fillStyle = "rgba(127,240,255,0.6)";
    ctx.fillText("SIM", pw - pad - ctx.measureText("SIM").width, pad + r * 0.2);

    const p = this.pace();
    const pace = `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`;
    let y = pad + r * 0.25;
    ctx.fillStyle = "rgba(127,240,255,0.7)";
    ctx.fillText("PACE", pad, y);
    y += r * 0.68;
    ctx.font = big;
    ctx.fillStyle = cyan;
    ctx.fillText(pace, pad, y);
    ctx.font = lab;
    ctx.fillText("/MI", pad + r * 2.0, y);

    if (rows >= 2) {
      y += r * 0.72;
      const hr = this.hr();
      const beat = Math.pow(Math.max(0, Math.sin(this.t * Math.PI * (hr / 60))), 8);
      ctx.fillStyle = `rgba(255,110,140,${0.5 + 0.5 * beat})`;
      ctx.beginPath();
      ctx.arc(pad + r * 0.14, y - r * 0.14, r * (0.1 + 0.04 * beat), 0, Math.PI * 2);
      ctx.fill();
      ctx.font = mid;
      ctx.fillStyle = cyan;
      ctx.fillText(String(hr), pad + r * 0.4, y);
      ctx.font = lab;
      ctx.fillText("BPM", pad + r * 1.35, y);
    }
    if (rows >= 3) {
      y += r * 0.7;
      ctx.font = mid;
      ctx.fillStyle = cyan;
      ctx.fillText(this.dist.toFixed(2), pad, y);
      ctx.font = lab;
      ctx.fillText("MI", pad + r * 1.25, y);
      ctx.font = mid;
      ctx.fillText(String(174 + Math.round(Math.sin(this.t * 0.9) * 3)), pad + r * 2.0, y);
      ctx.font = lab;
      ctx.fillText("SPM", pad + r * 2.85, y);
    }
    if (rows >= 4 && this.splits.length > 2) {
      y += r * 0.3;
      const gw = pw - pad * 2;
      const gh = r * 0.5;
      const lo = Math.min(...this.splits) - 2;
      const hi = Math.max(...this.splits) + 2;
      ctx.strokeStyle = cyan;
      ctx.lineWidth = Math.max(1, r * 0.035);
      ctx.beginPath();
      this.splits.forEach((v, i) => {
        const x = pad + (i / (this.splits.length - 1)) * gw;
        const yy = y + ((v - lo) / (hi - lo)) * gh; // faster = higher
        if (i) ctx.lineTo(x, yy);
        else ctx.moveTo(x, yy);
      });
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ═══════════════════════ APPAREL — GHOST RUNNER ════════════════════
   Afterimages of the whole body, snapped every tenth of a second and
   left where they were. Each echo is drawn solid on a scratch canvas
   first, so overlapping limbs don't double up, then laid down as one
   translucent chrome silhouette. */

type Echo = { segs: [Vec, Vec, number][]; age: number; n: number };

class Ghost implements Effect {
  private echoes: Echo[] = [];
  private snapAt = 0;
  private serial = 0;
  private last: Emitter | null = null;
  private intensity = 0;
  private scratch: HTMLCanvasElement | null = null;
  private colors = ["#c9ccd6", "#8a7cff", "#3fd1c6", "#ff7ad9", "#d9dde3"];
  private static EVERY = 0.1;

  update(dt: number, e: Emitter | null, intensity: number) {
    this.intensity = intensity;
    if (e) this.last = e;
    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    const count = [3, 5, 7, 9][levelOf(this.last?.power ?? 1) - 1];
    const life = count * Ghost.EVERY + 0.05;

    for (const q of this.echoes) {
      q.age += dt;
      const ox = air.x * dt;
      const oy = air.y * dt;
      for (const sgm of q.segs) {
        sgm[0] = { x: sgm[0].x + ox, y: sgm[0].y + oy };
        sgm[1] = { x: sgm[1].x + ox, y: sgm[1].y + oy };
      }
    }
    this.echoes = this.echoes.filter((q) => q.age < life);

    this.snapAt -= dt;
    if (this.snapAt <= 0 && e?.body && intensity > 0.3) {
      this.snapAt = Ghost.EVERY;
      this.echoes.push({
        segs: e.body.map(([a, b, r]) => [{ ...a }, { ...b }, r] as [Vec, Vec, number]),
        age: 0,
        n: this.serial++,
      });
    }
  }

  ignite() {
    this.snapAt = 0;
  }

  clear() {
    this.echoes.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.echoes.length) return;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    if (!this.scratch) this.scratch = document.createElement("canvas");
    const sc = this.scratch;
    if (sc.width !== W || sc.height !== H) {
      sc.width = W;
      sc.height = H;
    }
    const g = sc.getContext("2d")!;
    const count = [3, 5, 7, 9][levelOf(this.last?.power ?? 1) - 1];
    const life = count * Ghost.EVERY + 0.05;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const q of this.echoes) {
      // the newest echo sits on the body itself; skip it
      if (q.age < 0.12) continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [a, b, r] of q.segs) {
        x0 = Math.min(x0, a.x - r, b.x - r);
        y0 = Math.min(y0, a.y - r, b.y - r);
        x1 = Math.max(x1, a.x + r, b.x + r);
        y1 = Math.max(y1, a.y + r, b.y + r);
      }
      x0 = Math.max(0, Math.floor(x0 - 2));
      y0 = Math.max(0, Math.floor(y0 - 2));
      x1 = Math.min(W, Math.ceil(x1 + 2));
      y1 = Math.min(H, Math.ceil(y1 + 2));
      if (x1 <= x0 || y1 <= y0) continue;

      g.clearRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = this.colors[q.n % this.colors.length];
      g.beginPath();
      for (const [a, b, r] of q.segs) capsulePath(g, a, b, r);
      g.fill();

      const f = q.age / life;
      ctx.globalAlpha = (1 - f) * 0.24 * this.intensity;
      ctx.drawImage(sc, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ APPAREL — WINGS ═══════════════════════════
   Wings of light off the shoulder blades. Side-on, two wings sweep
   back; facing the camera, they spread left and right. They beat with
   a slow stroke, and higher levels grow the span and the feathers. */

type Feather = { base: Vec; tip: Vec; w: number; row: 0 | 1 };
type Wing = { root: Vec; tip: Vec; ctrl: Vec; feathers: Feather[]; alpha: number };

class Wings implements Effect {
  private t = 0;
  private grow = 0;
  private wings: Wing[] = [];
  private motes: P[] = [];
  private last: Emitter | null = null;
  private mote: HTMLCanvasElement;
  private glow: HTMLCanvasElement;

  constructor() {
    this.mote = softSprite("rgba(255,248,240,1)", 16, 0.25);
    this.glow = softSprite("rgba(255,236,246,0.5)", 96);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    const target = intensity > 0.3 ? 1 : 0;
    this.grow += (target - this.grow) * (1 - Math.exp(-(target ? 1.8 : 6) * dt));
    const air = this.last?.worldVel ?? { x: 0, y: 0 };

    const T = e?.torso;
    if (T && this.grow > 0.01) {
      this.wings = this.build(T, e!.scale, e!.power ?? 1);
      // light sheds off the feather tips
      const rate = 40 * (e!.power ?? 1) * this.grow;
      for (const w of this.wings) {
        if (Math.random() < dt * rate * w.alpha) {
          const f = w.feathers[Math.floor(Math.random() * w.feathers.length)];
          this.motes.push({
            x: f.tip.x, y: f.tip.y,
            vx: (e!.bodyVel.x ?? 0) * 0.5 + rand(-0.2, 0.2) * e!.scale,
            vy: rand(-0.1, 0.25) * e!.scale,
            age: 0, life: rand(0.7, 1.4), size: rand(0.8, 1.8), seed: Math.random() * 10, k: 0,
          });
        }
      }
    } else if (!T) {
      this.wings = [];
    }

    for (let i = this.motes.length - 1; i >= 0; i--) {
      const p = this.motes[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.motes.splice(i, 1);
        continue;
      }
      const f = 1 - Math.exp(-1.6 * dt);
      p.vx += (air.x - p.vx) * f;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private build(T: NonNullable<Emitter["torso"]>, S: number, power: number): Wing[] {
    const span = S * (1.2 + 0.5 * power) * (0.25 + 0.75 * this.grow);
    const N = Math.min(16, Math.round(8 + 6 * power));
    const up = T.up;
    const out: Wing[] = [];

    const make = (root: Vec, dir: Vec, lag: number, alpha: number) => {
      // the stroke swings the wing tip along the up axis
      const a = 0.05 + 0.26 * Math.sin(this.t * Math.PI * 2 * 0.9 - lag);
      const d = normV({ x: dir.x * Math.cos(a) + up.x * Math.sin(a), y: dir.y * Math.cos(a) + up.y * Math.sin(a) });
      // feathers hang along "down", taken square to the wing
      const dn0 = { x: -up.x, y: -up.y };
      const k = dn0.x * d.x + dn0.y * d.y;
      const down = normV({ x: dn0.x - d.x * k, y: dn0.y - d.y * k });
      const tip = { x: root.x + d.x * span, y: root.y + d.y * span };
      const ctrl = {
        x: root.x + d.x * span * 0.3 + up.x * span * 0.22,
        y: root.y + d.y * span * 0.3 + up.y * span * 0.22,
      };
      const feathers: Feather[] = [];
      for (let row = 1; row >= 0; row--) {
        for (let i = 0; i < N; i++) {
          const t = 0.1 + 0.9 * (i / (N - 1));
          const base = quad(root, ctrl, tip, t);
          const lean = 0.1 + 0.75 * t; // outer feathers rake toward the tip
          const fd = normV({ x: down.x + d.x * lean, y: down.y + d.y * lean });
          const len = span * (0.34 + 0.46 * t) * (row ? 0.45 : 1);
          feathers.push({
            base,
            tip: { x: base.x + fd.x * len, y: base.y + fd.y * len },
            w: len * (row ? 0.2 : 0.15),
            row: row as 0 | 1,
          });
        }
      }
      out.push({ root, tip, ctrl, feathers, alpha });
    };

    if (T.side) {
      // shoulder blade sits just behind and below the neck
      const root = {
        x: lerpV(T.neck, T.pelvis, 0.16).x - T.fwd.x * S * 0.22,
        y: lerpV(T.neck, T.pelvis, 0.16).y - T.fwd.y * S * 0.22,
      };
      const back = normV({ x: -T.fwd.x + up.x * 0.55, y: -T.fwd.y + up.y * 0.55 });
      make({ x: root.x + T.fwd.x * S * 0.08, y: root.y + T.fwd.y * S * 0.08 - S * 0.03 }, back, 0.25, 0.55);
      make(root, back, 0, 1);
    } else {
      const across = normV({ x: T.rSh.x - T.lSh.x, y: T.rSh.y - T.lSh.y });
      const lRoot = lerpV(T.lSh, T.neck, 0.35);
      const rRoot = lerpV(T.rSh, T.neck, 0.35);
      make(lRoot, normV({ x: -across.x + up.x * 0.2, y: -across.y + up.y * 0.2 }), 0, 1);
      make(rRoot, normV({ x: across.x + up.x * 0.2, y: across.y + up.y * 0.2 }), 0, 1);
    }
    return out;
  }

  ignite() {
    this.grow = Math.max(this.grow, 0.02);
  }

  clear() {
    this.grow = 0;
    this.wings = [];
    this.motes.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.grow < 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const w of this.wings) {
      const a = this.grow * w.alpha;
      // soft bloom under the wing
      const mid = quad(w.root, w.ctrl, w.tip, 0.55);
      const span = Math.hypot(w.tip.x - w.root.x, w.tip.y - w.root.y);
      ctx.globalAlpha = 0.35 * a;
      ctx.drawImage(this.glow, mid.x - span * 0.7, mid.y - span * 0.45, span * 1.4, span * 1.1);

      for (const f of w.feathers) {
        const dx = f.tip.x - f.base.x;
        const dy = f.tip.y - f.base.y;
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L;
        const ny = dx / L;
        const m = lerpV(f.base, f.tip, 0.45);
        const g = ctx.createLinearGradient(f.base.x, f.base.y, f.tip.x, f.tip.y);
        g.addColorStop(0, "rgba(255,255,255,0.6)");
        g.addColorStop(0.55, f.row ? "rgba(241,217,226,0.42)" : "rgba(216,238,232,0.36)");
        g.addColorStop(1, "rgba(255,236,246,0.04)");
        ctx.globalAlpha = a * (f.row ? 0.4 : 0.5);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(f.base.x, f.base.y);
        ctx.quadraticCurveTo(m.x + nx * f.w, m.y + ny * f.w, f.tip.x, f.tip.y);
        ctx.quadraticCurveTo(m.x - nx * f.w, m.y - ny * f.w, f.base.x, f.base.y);
        ctx.fill();
        // a hairline edge keeps neighbouring feathers apart
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = Math.max(0.6, f.w * 0.05);
        ctx.stroke();
        // the shaft
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = Math.max(0.6, f.w * 0.08);
        ctx.beginPath();
        ctx.moveTo(f.base.x, f.base.y);
        ctx.lineTo(lerpV(f.base, f.tip, 0.85).x, lerpV(f.base, f.tip, 0.85).y);
        ctx.stroke();
      }
      // the leading edge
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = Math.max(1, span * 0.018);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(w.root.x, w.root.y);
      ctx.quadraticCurveTo(w.ctrl.x, w.ctrl.y, w.tip.x, w.tip.y);
      ctx.stroke();
    }
    const s0 = this.last?.scale ?? 100;
    for (const p of this.motes) {
      const f = p.age / p.life;
      ctx.globalAlpha = (1 - f) * this.grow;
      const d = p.size * (s0 / 110) * 4;
      ctx.drawImage(this.mote, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ HEADWEAR — HORNS ══════════════════════════
   Obsidian horns with lava running in the cracks. Side-on they sweep
   back like an ibex; facing the camera they curve out and up. Embers
   lift off the tips. Higher levels grow them longer. */

type Horn = { pts: Vec[]; w: number; alpha: number };

class Horns implements Effect {
  private t = 0;
  private grow = 0;
  private horns: Horn[] = [];
  private embers: P[] = [];
  private last: Emitter | null = null;
  private dot: HTMLCanvasElement;
  private glow: HTMLCanvasElement;

  constructor() {
    this.dot = softSprite("rgba(255,170,80,1)", 16, 0.25);
    this.glow = softSprite("rgba(255,92,26,0.6)", 64);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    const target = intensity > 0.3 ? 1 : 0;
    this.grow += (target - this.grow) * (1 - Math.exp(-(target ? 2 : 6) * dt));
    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    const h = e?.head;
    if (h && this.grow > 0.01) {
      this.horns = this.build(h, e!.power ?? 1);
      for (const hn of this.horns) {
        if (Math.random() < dt * 22 * (e!.power ?? 1) * this.grow * hn.alpha) {
          const tip = hn.pts[hn.pts.length - 1];
          this.embers.push({
            x: tip.x, y: tip.y,
            vx: (e!.bodyVel.x ?? 0) * 0.5 + rand(-0.4, 0.4) * h.r,
            vy: -rand(0.6, 1.4) * h.r,
            age: 0, life: rand(0.5, 1.1), size: rand(0.8, 1.5), seed: Math.random() * 10, k: 0,
          });
        }
      }
    } else if (!h) {
      this.horns = [];
    }
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const p = this.embers[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.embers.splice(i, 1);
        continue;
      }
      const f = 1 - Math.exp(-1.5 * dt);
      p.vx += (air.x - p.vx) * f;
      p.vx += Math.sin(this.t * 6 + p.seed) * 20 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private build(h: NonNullable<Emitter["head"]>, power: number): Horn[] {
    const r = h.r;
    const L = r * (1.5 + 1.0 * power) * (0.2 + 0.8 * this.grow);
    const up = h.up;
    const fw = h.fwd;
    const P = (o: Vec, u: number, f: number): Vec => ({
      x: o.x + up.x * u + fw.x * f,
      y: o.y + up.y * u + fw.y * f,
    });
    const curve = (p0: Vec, p1: Vec, p2: Vec, p3: Vec) => {
      const pts: Vec[] = [];
      for (let i = 0; i <= 14; i++) pts.push(cubic(p0, p1, p2, p3, i / 14));
      return pts;
    };
    if (!h.front) {
      const near = P(h.c, r * 0.6, r * 0.1);
      const far = P(h.c, r * 0.64, -r * 0.08);
      const sweep = (o: Vec) =>
        curve(o, P(o, L * 0.7, L * 0.05), P(o, L * 0.95, -L * 0.55), P(o, L * 0.5, -L * 1.0));
      return [
        { pts: sweep(far), w: r * 0.34, alpha: 0.55 },
        { pts: sweep(near), w: r * 0.38, alpha: 1 },
      ];
    }
    return [-1, 1].map((sd) => {
      const o = P(h.c, r * 0.55, sd * r * 0.55);
      return {
        pts: curve(o, P(o, L * 0.45, sd * L * 0.35), P(o, L * 0.95, sd * L * 0.6), P(o, L * 1.1, sd * L * 0.15)),
        w: r * 0.36,
        alpha: 1,
      };
    });
  }

  ignite() {
    this.grow = Math.max(this.grow, 0.02);
  }

  clear() {
    this.grow = 0;
    this.horns = [];
    this.embers.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.grow < 0.01) return;
    ctx.save();
    for (const hn of this.horns) {
      const n = hn.pts.length;
      const left: Vec[] = [];
      const right: Vec[] = [];
      for (let i = 0; i < n; i++) {
        const a = hn.pts[Math.max(0, i - 1)];
        const b = hn.pts[Math.min(n - 1, i + 1)];
        const d = normV({ x: b.x - a.x, y: b.y - a.y });
        const w = hn.w * Math.pow(1 - i / (n - 1), 0.85) * (0.4 + 0.6 * this.grow);
        left.push({ x: hn.pts[i].x - d.y * w, y: hn.pts[i].y + d.x * w });
        right.push({ x: hn.pts[i].x + d.y * w, y: hn.pts[i].y - d.x * w });
      }
      const shape = new Path2D();
      shape.moveTo(left[0].x, left[0].y);
      for (const p of left.slice(1)) shape.lineTo(p.x, p.y);
      for (const p of right.reverse()) shape.lineTo(p.x, p.y);
      shape.closePath();

      ctx.globalAlpha = this.grow * hn.alpha;
      ctx.globalCompositeOperation = "source-over";
      const g = ctx.createLinearGradient(hn.pts[0].x, hn.pts[0].y, hn.pts[n - 1].x, hn.pts[n - 1].y);
      g.addColorStop(0, "#241718");
      g.addColorStop(1, "#0d0a0b");
      ctx.fillStyle = g;
      ctx.shadowColor = "rgba(255,92,26,0.8)";
      ctx.shadowBlur = hn.w * 0.9;
      ctx.fill(shape);
      ctx.shadowBlur = 0;

      // ram ridges
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = Math.max(0.8, hn.w * 0.06);
      ctx.beginPath();
      for (let i = 2; i < n - 2; i += 2) {
        ctx.moveTo(left[i].x, left[i].y);
        const rr = right[right.length - 1 - i];
        ctx.lineTo(rr.x, rr.y);
      }
      ctx.stroke();

      // lava in the cracks, pulsing
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.55 + 0.45 * Math.sin(this.t * 4);
      ctx.strokeStyle = `rgba(255,${Math.round(110 + 60 * pulse)},40,${0.7 * pulse})`;
      ctx.lineWidth = Math.max(1, hn.w * 0.1);
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 1; i < n - 2; i++) {
        const p = hn.pts[i];
        const j = Math.sin(i * 2.7 + 1.3) * hn.w * 0.25 * (1 - i / n);
        const q = { x: p.x + j, y: p.y - j * 0.5 };
        if (i === 1) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      // rim light
      ctx.strokeStyle = `rgba(255,92,26,${0.35 + 0.25 * pulse})`;
      ctx.lineWidth = Math.max(1, hn.w * 0.07);
      ctx.stroke(shape);
      // hot tip
      const tip = hn.pts[n - 1];
      const d = hn.w * 2.4;
      ctx.globalAlpha = this.grow * hn.alpha * pulse;
      ctx.drawImage(this.glow, tip.x - d / 2, tip.y - d / 2, d, d);
    }
    ctx.globalCompositeOperation = "lighter";
    const r0 = this.last?.head?.r ?? 20;
    for (const p of this.embers) {
      const f = p.age / p.life;
      ctx.globalAlpha = (1 - f) * this.grow;
      const d = p.size * (r0 / 28) * 4;
      ctx.drawImage(this.dot, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ LINKED RUNNERS ════════════════════════════
   Two NERTIA units close together connect. Not an Effect of its own
   unit: it runs between two emitters' chest points, in both runners'
   colors. Bolts are re-rolled every few frames so the link crackles. */

export class LinkArc {
  private on = 0;
  private bolts: Vec[][] = [];
  private regen = 0;
  private a: Vec | null = null;
  private b: Vec | null = null;
  private scale = 100;
  private t = 0;
  private spark: HTMLCanvasElement | null = null;

  update(dt: number, a: Vec | null, b: Vec | null, scale: number, live: boolean) {
    this.t += dt;
    const target = live && a && b ? 1 : 0;
    this.on += (target - this.on) * (1 - Math.exp(-(target ? 3 : 8) * dt));
    if (a && b) {
      this.a = a;
      this.b = b;
      this.scale = scale;
    }
    this.regen -= dt;
    if (this.regen <= 0 && this.a && this.b) {
      this.regen = 0.055;
      this.bolts = [0, 1, 2].map((i) => this.bolt(this.a!, this.b!, i));
    }
  }

  private bolt(a: Vec, b: Vec, i: number): Vec[] {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    // the main arc bows upward; the side arcs wander more
    const sag = -d * (0.1 + i * 0.05) * (i % 2 ? 1 : 0.7);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag };
    let pts: Vec[] = [a, mid, b];
    let disp = d * (0.09 + i * 0.03);
    for (let k = 0; k < 5; k++) {
      const next: Vec[] = [pts[0]];
      for (let j = 1; j < pts.length; j++) {
        const p = pts[j - 1];
        const q = pts[j];
        const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const nx = -(q.y - p.y);
        const ny = q.x - p.x;
        const nl = Math.hypot(nx, ny) || 1;
        const off = (Math.random() - 0.5) * disp;
        next.push({ x: m.x + (nx / nl) * off, y: m.y + (ny / nl) * off }, q);
      }
      pts = next;
      disp *= 0.55;
    }
    return pts;
  }

  clear() {
    this.on = 0;
    this.bolts = [];
  }

  draw(ctx: CanvasRenderingContext2D, colors: [string, string], label: string | null, dpr: number) {
    if (this.on < 0.01 || !this.a || !this.b) return;
    if (!this.spark) this.spark = softSprite("rgba(255,255,255,0.9)", 64, 0.1);
    const a = this.a;
    const b = this.b;
    const s = this.scale;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    const flick = 0.75 + 0.25 * Math.sin(this.t * 40);

    this.bolts.forEach((pts, i) => {
      const main = i === 0;
      for (const [w, al, st] of [
        [s * (main ? 0.09 : 0.05), 0.18, grad],
        [s * (main ? 0.03 : 0.018), 0.65, grad],
        [s * (main ? 0.01 : 0.006), 0.95, "#ffffff"],
      ] as [number, number, string | CanvasGradient][]) {
        ctx.globalAlpha = this.on * al * flick * (main ? 1 : 0.6);
        ctx.strokeStyle = st;
        ctx.lineWidth = Math.max(1, w);
        ctx.beginPath();
        pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
    });
    // contact flares at each chest
    for (const [p, c] of [
      [a, colors[0]],
      [b, colors[1]],
    ] as [Vec, string][]) {
      ctx.globalAlpha = this.on * 0.8 * flick;
      const d = s * 0.9;
      ctx.drawImage(this.spark, p.x - d / 2, p.y - d / 2, d, d);
      ctx.globalAlpha = this.on * 0.5;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    if (label) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = this.on;
      ctx.font = `500 ${10 * dpr}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.fillStyle = "rgba(239,234,225,0.85)";
      const w = ctx.measureText(label).width;
      const top = Math.min(a.y, b.y) - Math.hypot(b.x - a.x, b.y - a.y) * 0.22 - 14 * dpr;
      ctx.fillText(label, (a.x + b.x) / 2 - w / 2, Math.max(16 * dpr, top));
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
    case "frost":
      return new Frost();
    case "laurel":
      return new Laurel();
    case "steam":
      return new Steam();
    case "embers":
      return new Embers();
    case "hud":
      return new Hud();
    case "ghost":
      return new Ghost();
    case "wings":
      return new Wings();
    case "horns":
      return new Horns();
  }
}

export { rgba };
