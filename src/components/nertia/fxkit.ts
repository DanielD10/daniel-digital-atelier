/**
 * The shared kit for NERTIA effects: the Emitter every effect reads,
 * the Effect interface, the particle System base, sprite caching and
 * small geometry helpers. effects.ts and effects-set.ts both build on it.
 */

import type { EffectId, Region } from "@/lib/nertia";

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
  /** Where the garment's chip (and its + mark) sits — the tap target. */
  chip?: Vec;
  /** The whole body as capsules [a, b, radius], for full-body effects. */
  body?: [Vec, Vec, number][];
  /** Both knees, when they can be seen. */
  knees?: Vec[];
  /** Which garment the path traces. */
  region?: Region;
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

export type P = {
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
  /** a floor it can't sink through (ground fog) */
  fy?: number;
};

export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ─────────────────────────── geometry ─────────────────────────── */

export function pathLength(path: Vec[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return len;
}

/** A uniformly distributed point along the polyline. */
export function samplePath(path: Vec[], total?: number): Vec {
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

export function centroid(path: Vec[]): Vec {
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
export function softSprite(color: string, size = 64, core = 0): HTMLCanvasElement {
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

/** a soft-focus copy of a sprite, for things close to the lens */
export function blurSprite(src: HTMLCanvasElement, r = 3): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width + r * 4;
  c.height = src.height + r * 4;
  const g = c.getContext("2d")!;
  const taps: [number, number][] = [];
  for (let y = -r; y <= r; y += r) for (let x = -r; x <= r; x += r) taps.push([x, y]);
  g.globalAlpha = 1.6 / taps.length;
  for (const [x, y] of taps) g.drawImage(src, r * 2 + x, r * 2 + y);
  return c;
}


/* ─────────────────────────── base system ─────────────────────── */

export abstract class System implements Effect {
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
          // born somewhere inside this frame, not all at its start —
          // otherwise a slow frame leaves particles in clumps
          const sub = Math.random() * dt;
          p.age = sub;
          p.x += (p.vx + e.worldVel.x) * 0.5 * sub;
          p.y += (p.vy + e.worldVel.y) * 0.5 * sub;
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

/* ─────────────────────────── shared helpers ─────────────────────── */

export function lerpV(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export function normV(a: Vec): Vec {
  const m = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / m, y: a.y / m };
}
export function levelOf(power: number): 1 | 2 | 3 {
  return power >= 0.95 ? 3 : power >= 0.55 ? 2 : 1;
}
export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** sample a color ramp at t in [0, 1] */
export function rampAt(stops: string[], t: number, a = 1): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const p = hexRgb(stops[i]);
  const q = hexRgb(stops[i + 1]);
  const c = p.map((v, k) => Math.round(v + (q[k] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
export function quad(p0: Vec, p1: Vec, p2: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}
/** capsule outline as a path (caller fills) */
export function capsulePath(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, r: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.moveTo(a.x + Math.cos(ang + Math.PI / 2) * r, a.y + Math.sin(ang + Math.PI / 2) * r);
  ctx.arc(a.x, a.y, r, ang + Math.PI / 2, ang + (3 * Math.PI) / 2);
  ctx.arc(b.x, b.y, r, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}


/** jagged lightning channel from a to b (midpoint displacement) */
export function channel(a: Vec, b: Vec, rough: number, depth = 6): Vec[] {
  let pts = [a, b];
  let disp = Math.hypot(b.x - a.x, b.y - a.y) * rough;
  for (let k = 0; k < depth; k++) {
    const next: Vec[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const nx = -(q.y - p.y);
      const ny = q.x - p.x;
      const nl = Math.hypot(nx, ny) || 1;
      const off = (Math.random() - 0.5) * disp;
      next.push({ x: (p.x + q.x) / 2 + (nx / nl) * off, y: (p.y + q.y) / 2 + (ny / nl) * off }, q);
    }
    pts = next;
    disp *= 0.55;
  }
  return pts;
}

/** Level 1, 2 or 3 from an emitter's power. Level 3 is the full effect. */
export const lvl = (e: Emitter | null | undefined): 1 | 2 | 3 => levelOf(e?.power ?? 1);

/** builds an effect by engine id and variant; effects.ts registers it */
export type Factory = (id: EffectId, variant?: string) => Effect | null;

/** lightning palettes: bloom, body and core of the channel, and the light it throws */
export type BoltStyle = {
  /** bloom, body, core */
  stroke: [string, string, string];
  glow: string;
  flash: string;
  spark: string;
};

export const BOLT_STYLES: Record<string, BoltStyle> = {
  storm: { stroke: ["rgba(138,124,255,1)", "rgba(120,220,255,1)", "rgba(255,255,255,1)"], glow: "rgba(150,190,255,0.7)", flash: "rgb(170,190,255)", spark: "rgba(200,235,255,1)" },
  gold: { stroke: ["rgba(255,150,40,1)", "rgba(255,214,90,1)", "rgba(255,252,235,1)"], glow: "rgba(255,190,80,0.7)", flash: "rgb(255,214,140)", spark: "rgba(255,236,170,1)" },
  crimson: { stroke: ["rgba(200,0,40,1)", "rgba(255,60,60,1)", "rgba(255,236,236,1)"], glow: "rgba(255,60,70,0.7)", flash: "rgb(255,120,120)", spark: "rgba(255,190,180,1)" },
};


/** one lightning channel drawn as plasma: bloom, body, white core */
export function strokeBolt(
  ctx: CanvasRenderingContext2D,
  pts: Vec[],
  ox: number,
  oy: number,
  w: number,
  a: number,
  st: BoltStyle,
) {
  if (pts.length < 2) return;
  for (const [mul, col, al] of [
    [9, st.stroke[0], 0.22],
    [3.5, st.stroke[1], 0.6],
    [1, st.stroke[2], 1],
  ] as [number, string, number][]) {
    ctx.globalAlpha = a * al;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(0.8, w * mul);
    ctx.beginPath();
    ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
    ctx.stroke();
  }
}

/**
 * Ages a particle list, drops the dead, and moves the rest: velocity
 * relaxes toward the air at rate `k`, gravity pulls at `grav` scales
 * per second squared.
 */
export function stepList(list: P[], dt: number, air: Vec, k: number, grav: number, s: number) {
  const f = 1 - Math.exp(-k * dt);
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) {
      list[i] = list[list.length - 1];
      list.pop();
      continue;
    }
    p.vx += (air.x - p.vx) * f;
    p.vy += (air.y - p.vy) * f + grav * s * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

/** a four-point glint: a hot dot with thin cross rays */
export function glintSprite(color: string, size = 64): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  g.translate(r, r);
  g.globalCompositeOperation = "lighter";
  for (const rot of [0, Math.PI / 2]) {
    g.save();
    g.rotate(rot);
    const grad = g.createLinearGradient(-r, 0, r, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-r, 0);
    g.quadraticCurveTo(0, -r * 0.06, r, 0);
    g.quadraticCurveTo(0, r * 0.06, -r, 0);
    g.fill();
    g.restore();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.35);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.3, color);
  core.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = core;
  g.fillRect(-r, -r, size, size);
  return c;
}

/** rgba() from a hex color */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** a reusable offscreen canvas, resized on demand */
export function scratch(c: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const out = c ?? document.createElement("canvas");
  const W = Math.max(2, Math.ceil(w));
  const H = Math.max(2, Math.ceil(h));
  if (out.width !== W || out.height !== H) {
    out.width = W;
    out.height = H;
  }
  return out;
}
