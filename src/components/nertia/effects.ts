/**
 * NERTIA effect engine — the original effects (flames, stars, mist,
 * lightning and the rest). The Drop 001 set adds more in fx-body.ts,
 * fx-ground.ts and fx-head.ts.
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
import { FIRE_PALETTES, GLField, type FirePalette } from "./glfield";
import {
  System,
  blurSprite,
  capsulePath,
  centroid,
  channel,
  hexRgb,
  lerpV,
  levelOf,
  lvl,
  normV,
  quad,
  rampAt,
  rand,
  softSprite,
  BOLT_STYLES,
  type BoltStyle,
  type Effect,
  type Emitter,
  type P,
  type Vec,
} from "./fxkit";
import { createSetEffect } from "./effects-set";

export type { Effect, Emitter, Vec } from "./fxkit";

/* ═══════════════════════ HEAT SHIFT — FLAMES ═══════════════════════
   Real fire, three layers deep:
   1. heat particles — they carry the physics (rise, trail behind a
      runner) and are drawn only into the shader's heat mask;
   2. the fire shader turns that heat into licking, flickering flame
      with a white-gold core and Heat Shift magenta at the tips;
   3. embers and smoke in 2D on top and underneath, and the fire
      throws warm light back onto the runner.
   Without WebGL it falls back to stretched glowing sprites. */

type FlameStyle = {
  pal: FirePalette;
  embers: string[];
  /** light the fire throws on the runner */
  light: string;
  smoke: string;
  /** black flame is laid over the scene instead of added to it */
  dark?: boolean;
};

const FLAME_STYLES: Record<string, FlameStyle> = {
  heat: { pal: "heat", embers: ["#fff3c4", "#ffc35a", "#ff7a2a", "#e0218a", "#7a1020"], light: "rgba(255,120,40,0.6)", smoke: "rgba(60,48,46,0.55)" },
  cold: { pal: "cold", embers: ["#ffffff", "#c4f2ff", "#5cc8ff", "#2f7bff", "#14246e"], light: "rgba(70,150,255,0.6)", smoke: "rgba(38,46,66,0.5)" },
  void: { pal: "void", embers: ["#f0dcff", "#b066ff", "#7a2fd6", "#3a0f6e", "#120420"], light: "rgba(150,70,255,0.4)", smoke: "rgba(8,4,14,0.75)", dark: true },
};

class Flames extends System {
  protected max = 720;
  private ramp: HTMLCanvasElement[];
  private ember: HTMLCanvasElement;
  private blob: HTMLCanvasElement;
  private puff: HTMLCanvasElement;
  private glow: HTMLCanvasElement;
  private smoke: P[] = [];
  private iNow = 0;
  private st: FlameStyle;
  private emberCols: string[];

  constructor(variant?: string) {
    super();
    this.st = FLAME_STYLES[variant ?? "heat"] ?? FLAME_STYLES.heat;
    this.emberCols = this.st.embers;
    // 2D fallback: the fire ramp, core to tip, as soft sprites
    const pal = FIRE_PALETTES[this.st.pal];
    const alphas = [0.75, 0.72, 0.68, 0.6, 0.45, 0.3, 0.14];
    const stops = [pal[4], pal[3], pal[2], pal[1], pal[0], pal[0], pal[0]];
    this.ramp = stops.map((c, i) => {
      const [r, g, b] = hexRgb(c);
      return softSprite(`rgba(${r},${g},${b},${alphas[i]})`, 64);
    });
    const [er, eg, eb] = hexRgb(this.st.embers[1]);
    this.ember = softSprite(`rgba(${er},${eg},${eb},1)`, 16, 0.3);
    this.blob = softSprite("rgba(255,255,255,1)", 64);
    this.puff = softSprite(this.st.smoke, 64);
    this.glow = softSprite(this.st.light, 128);
  }

  protected rate(e: Emitter) {
    return 120 + e.scale * 3.2;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    // embers come in at Level II, and thicken at the full effect
    const lv = lvl(e);
    const ember = lv > 1 && Math.random() < (lv === 3 ? 0.11 : 0.06);
    return {
      x: at.x + rand(-0.04, 0.04) * s,
      y: at.y + rand(-0.04, 0.04) * s,
      vx: e.bodyVel.x * 0.85 + rand(-0.35, 0.35) * s * (ember ? 2 : 1),
      vy: e.bodyVel.y * 0.85 - rand(0.6, 1.5) * s * (ember ? 1.4 : 1),
      age: 0,
      // each level makes the fire taller and longer, not just denser
      life: ember ? rand(0.9, 1.9) : rand(0.38, 0.8) * (lv === 1 ? 0.5 : lv === 2 ? 0.8 : 1.1),
      size: ember ? rand(0.6, 1.5) : rand(0.12, 0.24) * s * (lv === 1 ? 0.6 : lv === 2 ? 0.82 : 1.05),
      seed: Math.random() * 100,
      k: ember ? 1 : 0,
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const s = e ? e.scale : 100;
    this.drag(p, dt, e, p.k ? 1.5 : 4.2);
    // buoyancy: hot gas keeps climbing even as the air drags it back
    p.vy -= s * (p.k ? 1.1 : 2.8) * dt;
    // curl, so tongues lick and embers swirl
    p.vx += Math.sin(this.t * (p.k ? 5 : 9) + p.seed) * s * (p.k ? 3 : 2.2) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  protected onDeath(p: P) {
    // flame tips that burn out leave a wisp of smoke (Level II up)
    if (p.k === 0 && lvl(this.last) > 1 && Math.random() < 0.06 && this.smoke.length < 70) {
      this.smoke.push({ ...p, age: 0, life: rand(1, 1.8), size: p.size * 0.9, vy: p.vy * 0.4, k: 0 });
    }
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.iNow = intensity;
    super.update(dt, e, intensity);
    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    const s = this.last?.scale ?? 100;
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const q = this.smoke[i];
      q.age += dt;
      if (q.age >= q.life) {
        this.smoke.splice(i, 1);
        continue;
      }
      const f = 1 - Math.exp(-1.6 * dt);
      q.vx += (air.x - q.vx) * f;
      q.vy -= s * 0.6 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
  }

  clear() {
    super.clear();
    this.smoke.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const gl = GLField.get();
    const e = this.last;
    if (!gl || !e) return this.draw2D(ctx);
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const s = e.scale;
    ctx.save();

    // smoke first, under the fire
    for (const q of this.smoke) {
      const f = q.age / q.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.3;
      const d = q.size * (1.2 + f * 2.6) * 2;
      ctx.drawImage(this.puff, q.x - d / 2, q.y - d / 2, d, d);
    }

    // heat mask: the garment edge itself, then every heat particle
    const lv = lvl(e);
    const m = gl.begin(W, H);
    if (this.iNow > 0.02 && e.path.length > 1) {
      m.globalAlpha = (lv === 1 ? 0.1 : lv === 2 ? 0.26 : 0.45) * this.iNow;
      const step = s * 0.07;
      for (let i = 1; i < e.path.length; i++) {
        const a = e.path[i - 1];
        const b = e.path[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
        for (let k = 0; k < n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n;
          const y = a.y + ((b.y - a.y) * k) / n;
          const r = s * 0.15;
          m.drawImage(this.blob, x - r, y - r, r * 2, r * 2);
        }
      }
    }
    for (const p of this.ps) {
      if (p.k) continue;
      const f = p.age / p.life;
      const r = p.size * (0.75 + 1.1 * f);
      m.globalAlpha = 0.4 * Math.pow(1 - f, 1.3);
      m.drawImage(this.blob, p.x - r, p.y - r, r * 2, r * 2);
    }

    // flames lick up and back along the air moving past the body
    const rel = { x: e.worldVel.x - e.bodyVel.x, y: e.worldVel.y - e.bodyVel.y };
    const lean = Math.min(1.0, Math.hypot(rel.x, rel.y) / (s * 5));
    const rl = Math.hypot(rel.x, rel.y) || 1;
    const dir = { x: (rel.x / rl) * lean, y: -1 + (rel.y / rl) * lean };
    const fire = gl.renderFire({ t: this.t, dir, size: s * (lv === 1 ? 0.6 : lv === 2 ? 0.85 : 1.15), palette: this.st.pal });
    if (this.st.dark && this.iNow > 0.02) {
      // black fire needs something behind it to be black against: a
      // violet haze, so the flame reads as a hole with a lit rim
      const c = centroid(e.path);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 * this.iNow;
      const d = s * 6;
      ctx.drawImage(this.glow, c.x - d * 0.65, c.y - d * 0.6, d, d);
    }
    ctx.globalCompositeOperation = this.st.dark ? "source-over" : "lighter";
    ctx.globalAlpha = 1;
    ctx.drawImage(fire, 0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    // at the full effect the fire lights the runner, flickering (black
    // flame doesn't give off light)
    if (this.iNow > 0.02 && lv === 3 && !this.st.dark) {
      let cx = 0;
      let cy = 0;
      for (const p of e.path) {
        cx += p.x;
        cy += p.y;
      }
      cx /= e.path.length;
      cy /= e.path.length;
      const flick = 0.72 + 0.18 * Math.sin(this.t * 23) + 0.1 * Math.sin(this.t * 7.3 + 1);
      ctx.globalAlpha = 0.22 * this.iNow * flick * (e.power ?? 1);
      const d = s * 5;
      ctx.drawImage(this.glow, cx - d / 2, cy - d / 2, d, d);
    }

    // embers: short streaks with hot heads, cooling as they climb
    const sc = s / 110;
    ctx.lineCap = "round";
    for (const p of this.ps) {
      if (!p.k) continue;
      const f = p.age / p.life;
      const col = this.emberCols[Math.min(this.emberCols.length - 1, Math.floor(f * this.emberCols.length))];
      const tw = 0.6 + 0.4 * Math.sin(this.t * 31 + p.seed);
      ctx.globalAlpha = (1 - f * f) * tw;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.8, p.size * sc);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
      ctx.stroke();
      const d = p.size * sc * 6;
      ctx.drawImage(this.ember, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }

  private draw2D(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const n = this.ramp.length;
    for (const p of this.ps) {
      const f = p.age / p.life;
      if (p.k) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = (1 - f) * (0.6 + 0.4 * Math.sin(this.t * 30 + p.seed));
        const d = p.size * 3;
        ctx.drawImage(this.ember, p.x - d / 2, p.y - d / 2, d, d);
        continue;
      }
      const swell = Math.sin(Math.PI * Math.min(1, f * 1.6));
      const d = p.size * (0.55 + 0.7 * swell) * (1 - f * 0.55) * 2;
      const idx = Math.min(n - 1, Math.floor(f * n));
      ctx.globalAlpha = 1 - f * f;
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

/* ═══════════════════════ DEEP SPACE — STAR TRAIL ═══════════════════
   A star field that hangs where you ran. Stars come in magnitudes
   (many faint, a few bright) and colour temperatures, and each one
   scintillates the way real stars do through air: an irregular,
   fast flicker, with the odd star flaring up and throwing long
   diffraction spikes. Under them, nebula gas rendered as fog; across
   them, the occasional shooting star. */

type Meteor = { x: number; y: number; vx: number; vy: number; age: number; life: number; len: number };

class Stars extends System {
  protected max = 1500;
  private halos: HTMLCanvasElement[];
  private spikes: HTMLCanvasElement[];
  private core: HTMLCanvasElement;
  private blob: HTMLCanvasElement;
  private nebula: HTMLCanvasElement[];
  private meteors: Meteor[] = [];
  private meteorAt = 1.2;
  private tints = ["#a9c4ff", "#dfe6ff", "#ffffff", "#fff0d2", "#ffc996"];

  constructor() {
    super();
    this.halos = this.tints.map((c) => softSprite(c, 48, 0.06));
    this.spikes = this.tints.map((c) => Stars.spike(c));
    this.core = softSprite("rgba(255,255,255,1)", 16, 0.45);
    this.blob = softSprite("rgba(255,255,255,1)", 64);
    this.nebula = [
      softSprite("rgba(110,70,255,0.5)", 96),
      softSprite("rgba(40,170,190,0.45)", 96),
      softSprite("rgba(200,60,200,0.4)", 96),
    ];
  }

  /** four-point diffraction spikes, bright at the centre */
  private static spike(color: string): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.translate(64, 64);
    for (const [len, w, a] of [
      [62, 5, 0.18],
      [62, 1.6, 0.9],
    ]) {
      for (const rot of [0, Math.PI / 2]) {
        g.save();
        g.rotate(rot);
        const grad = g.createLinearGradient(-len, 0, len, 0);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, color);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.globalAlpha = a;
        g.fillStyle = grad;
        g.fillRect(-len, -w / 2, len * 2, w);
        g.restore();
      }
    }
    return c;
  }

  protected rate(e: Emitter) {
    return 75 + e.scale * 1.3;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    const roll = Math.random();
    // nebula gas comes in at Level II
    const neb = lvl(e) > 1 && roll < 0.06;
    const dust = !neb && roll < 0.42;
    const r = s * (neb ? 0.15 : 0.4);
    const a = Math.random() * Math.PI * 2;
    // magnitude: most stars faint, a handful bright
    const mag = Math.pow(Math.random(), 3.2);
    const tint = Math.random();
    return {
      x: at.x + Math.cos(a) * r * Math.random(),
      y: at.y + Math.sin(a) * r * Math.random(),
      vx: e.bodyVel.x * 0.5 + rand(-0.25, 0.25) * s,
      vy: e.bodyVel.y * 0.5 + rand(-0.25, 0.15) * s,
      age: 0,
      life: neb ? rand(1.6, 2.6) : dust ? rand(0.8, 1.8) : rand(1.5, 3.4),
      size: neb ? rand(0.6, 1.1) * s : dust ? rand(0.004, 0.008) * s : (0.009 + 0.03 * mag) * s,
      seed: Math.random() * 100,
      // k: 0–4 tint for stars, 9 dust, 10–12 nebula
      k: neb ? 10 + Math.floor(Math.random() * 3) : dust ? 9 : tint < 0.22 ? 0 : tint < 0.45 ? 1 : tint < 0.75 ? 2 : tint < 0.9 ? 3 : 4,
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    this.drag(p, dt, e, 3.2);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    super.update(dt, e, intensity);
    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    // shooting stars are a full-effect layer
    if (e && intensity > 0.5 && e.path.length && lvl(e) === 3) {
      this.meteorAt -= dt * (e.power ?? 1);
      if (this.meteorAt <= 0) {
        this.meteorAt = rand(1.2, 2.6);
        const at = e.path[Math.floor(Math.random() * e.path.length)];
        const s = e.scale;
        const back = Math.hypot(air.x, air.y) > 1 ? Math.sign(air.x) : Math.random() < 0.5 ? -1 : 1;
        const sp = s * rand(9, 13);
        const ang = rand(0.25, 0.6);
        this.meteors.push({
          x: at.x, y: at.y - s * 0.4,
          vx: back * Math.cos(ang) * sp + air.x * 0.3,
          vy: Math.sin(ang) * sp * 0.6,
          age: 0, life: rand(0.45, 0.7), len: s * rand(1.2, 2),
        });
      }
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.age += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.age > m.life) this.meteors.splice(i, 1);
    }
  }

  clear() {
    super.clear();
    this.meteors.length = 0;
  }

  /** real scintillation: an irregular fast flicker, plus rare flares */
  private twinkle(p: P): { b: number; flare: number } {
    const t = this.t;
    const s = p.seed;
    const f1 = 7 + (s * 13) % 9;
    const f2 = 13 + (s * 7) % 11;
    let b = 0.62 + 0.24 * Math.sin(t * f1 + s) + 0.14 * Math.sin(t * f2 * 1.7 + s * 3);
    // a brief dip, like a gust of air across the line of sight
    if (Math.sin(t * 29 + s * 17) > 0.97) b *= 0.45;
    const slot = Math.floor(t * 2.2 + s);
    const r = Math.abs(Math.sin(slot * 91.7 + s * 12.9) * 43758.5) % 1;
    const flare = r > 0.982 ? Math.sin(Math.PI * ((t * 2.2 + s) % 1)) : 0;
    return { b: Math.max(0, b), flare };
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    const s0 = e?.scale ?? 100;
    const gl = GLField.get();
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.save();

    // nebula gas
    if (gl && e) {
      const m = gl.begin(W, H);
      let any = false;
      for (const p of this.ps) {
        if (p.k < 10) continue;
        any = true;
        const f = p.age / p.life;
        m.globalAlpha = Math.sin(Math.PI * f) * 0.34;
        const r = p.size * (0.7 + f * 0.7);
        m.drawImage(this.blob, p.x - r, p.y - r, r * 2, r * 2);
      }
      if (any) {
        const air = e.worldVel;
        const al = Math.hypot(air.x, air.y) || 1;
        const fog = gl.renderFog({
          t: this.t,
          flow: { x: (air.x / al) * 0.25, y: (air.y / al) * 0.25 },
          size: s0 * 1.3,
          colors: ["#3b1f9a", "#1aa7bd", "#c43fc9"],
          alpha: 0.9,
          detail: 2.8,
        });
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.85;
        ctx.drawImage(fog, 0, 0, W, H);
      }
    } else {
      ctx.globalCompositeOperation = "lighter";
      for (const p of this.ps) {
        if (p.k < 10) continue;
        const f = p.age / p.life;
        ctx.globalAlpha = Math.sin(Math.PI * f) * 0.22;
        const d = p.size * (0.8 + f * 0.6);
        ctx.drawImage(this.nebula[p.k - 10], p.x - d / 2, p.y - d / 2, d, d);
      }
    }

    ctx.globalCompositeOperation = "lighter";
    // dust: faint, slow
    for (const p of this.ps) {
      if (p.k !== 9) continue;
      const f = p.age / p.life;
      ctx.globalAlpha = Math.min(1, f * 6) * (1 - f) * (0.35 + 0.25 * Math.sin(this.t * 3 + p.seed));
      const d = Math.max(1, p.size * 5);
      ctx.drawImage(this.core, p.x - d / 2, p.y - d / 2, d, d);
    }

    // stars
    for (const p of this.ps) {
      if (p.k > 4) continue;
      const f = p.age / p.life;
      const fade = Math.min(1, f * 7) * (f > 0.7 ? (1 - f) / 0.3 : 1);
      const { b, flare } = this.twinkle(p);
      const lum = fade * b * (1 + flare * 1.8);
      if (lum < 0.02) continue;
      const big = p.size / s0 > 0.022;
      // halo in the star's colour
      ctx.globalAlpha = Math.min(1, lum * 0.9);
      const hd = p.size * (big ? 9 : 6) * (0.8 + 0.4 * Math.sqrt(lum));
      ctx.drawImage(this.halos[p.k], p.x - hd / 2, p.y - hd / 2, hd, hd);
      // white-hot core
      ctx.globalAlpha = Math.min(1, lum);
      const cd = Math.max(1.5, p.size * 2.2);
      ctx.drawImage(this.core, p.x - cd / 2, p.y - cd / 2, cd, cd);
      // diffraction spikes on bright stars and flares
      if (big || flare > 0) {
        const sd = p.size * (big ? 16 : 10) * (0.7 + 0.5 * lum + flare * 1.2);
        ctx.globalAlpha = Math.min(1, lum * 0.8);
        ctx.drawImage(this.spikes[p.k], p.x - sd / 2, p.y - sd / 2, sd, sd);
        if (flare > 0.3) {
          // a fainter 45° set when it flares
          ctx.setTransform(1, 0, 0, 1, p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.globalAlpha = flare * 0.35;
          ctx.drawImage(this.spikes[p.k], -sd * 0.35, -sd * 0.35, sd * 0.7, sd * 0.7);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
    }

    // shooting stars
    ctx.lineCap = "round";
    for (const m of this.meteors) {
      const f = m.age / m.life;
      const a = Math.sin(Math.PI * f);
      const sp = Math.hypot(m.vx, m.vy) || 1;
      const tx = m.x - (m.vx / sp) * m.len;
      const ty = m.y - (m.vy / sp) * m.len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.3, "rgba(190,210,255,0.5)");
      g.addColorStop(1, "rgba(140,120,255,0)");
      ctx.globalAlpha = a;
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, s0 * 0.014);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      const d = s0 * 0.18;
      ctx.drawImage(this.halos[1], m.x - d / 2, m.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ BONE PEARL — MIST ═════════════════════════
   Pearl mist rolling off the hem: the particles say where the mist
   is, the fog shader gives it wisps and holes that drift, shaded
   pearl, blush and mint like the inside of a shell. A few glints of
   nacre catch the light inside it. */

class Mist extends System {
  protected max = 260;
  private sprites: HTMLCanvasElement[];
  private blob: HTMLCanvasElement;
  private glint: HTMLCanvasElement;
  private glints: P[] = [];
  /** Shadow: black smoke laid over the road instead of light mist */
  private dark: boolean;
  private rim = softSprite("rgba(140,70,255,0.5)", 64);

  constructor(variant?: string) {
    super();
    this.dark = variant === "shadow";
    this.sprites = this.dark
      ? [softSprite("rgba(14,10,20,0.6)", 128), softSprite("rgba(30,14,44,0.55)", 128), softSprite("rgba(8,6,12,0.65)", 128), softSprite("rgba(40,20,60,0.45)", 128)]
      : [
          softSprite("rgba(244,238,228,0.55)", 128),
          softSprite("rgba(246,214,228,0.5)", 128),
          softSprite("rgba(208,240,232,0.5)", 128),
          softSprite("rgba(255,250,240,0.6)", 128),
        ];
    this.blob = softSprite("rgba(255,255,255,1)", 64);
    this.glint = softSprite(this.dark ? "rgba(190,120,255,1)" : "rgba(255,250,245,1)", 16, 0.3);
  }

  protected rate(e: Emitter) {
    return 18 + e.scale * 0.26;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    if (Math.random() < 0.25 && this.glints.length < 80) {
      this.glints.push({
        x: at.x, y: at.y,
        vx: e.bodyVel.x * 0.5 + rand(-0.2, 0.2) * s, vy: rand(-0.1, 0.15) * s,
        age: 0, life: rand(1, 2), size: rand(0.6, 1.4), seed: Math.random() * 100, k: 0,
      });
    }
    return {
      x: at.x + rand(-0.1, 0.1) * s,
      y: at.y + rand(-0.12, 0.02) * s,
      // ground fog: it spills sideways off the shoes, not up
      vx: e.bodyVel.x * 0.6 + rand(-0.6, 0.6) * s,
      vy: e.bodyVel.y * 0.6 + rand(-0.12, 0.08) * s,
      age: 0,
      life: rand(1.4, 3.2),
      size: rand(0.16, 0.42) * s,
      seed: Math.random() * 100,
      k: Math.floor(Math.random() * 4),
      fy: at.y + 0.03 * s,
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const s = e ? e.scale : 100;
    this.drag(p, dt, e, 1.6);
    p.vx += Math.sin(this.t * 1.3 + p.seed) * s * 0.25 * dt;
    // heavier than air: it settles onto the road and spreads along it
    p.vy += s * 0.18 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.fy !== undefined && p.y > p.fy) {
      p.y = p.fy;
      p.vy = 0;
    }
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    super.update(dt, e, intensity);
    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    for (let i = this.glints.length - 1; i >= 0; i--) {
      const g = this.glints[i];
      g.age += dt;
      if (g.age >= g.life) {
        this.glints.splice(i, 1);
        continue;
      }
      const f = 1 - Math.exp(-1.6 * dt);
      g.vx += (air.x - g.vx) * f;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }
  }

  clear() {
    super.clear();
    this.glints.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const gl = GLField.get();
    const e = this.last;
    ctx.save();
    if (gl && e) {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      const m = gl.begin(W, H);
      for (const p of this.ps) {
        const f = p.age / p.life;
        m.globalAlpha = Math.sin(Math.PI * Math.min(1, f * 1.15)) * 0.5;
        const r = p.size * (1 + f * 2.2);
        // fog hangs in a low, wide bank
        m.drawImage(this.blob, p.x - r * 1.5, p.y - r * 0.5, r * 3, r * 0.75);
      }
      const air = e.worldVel;
      const al = Math.hypot(air.x, air.y) || 1;
      const fog = gl.renderFog({
        t: this.t,
        flow: { x: (air.x / al) * 0.5, y: 0.12 },
        size: e.scale * 0.9,
        colors: this.dark ? ["#0a0710", "#2a1244", "#6a34b8"] : ["#fffaf2", "#ffd9ea", "#d4fff3"],
        alpha: this.dark ? 0.92 : 1,
        detail: 2.4,
      });
      if (this.dark) {
        // a violet halo under the smoke, so black reads against the night
        ctx.globalCompositeOperation = "lighter";
        for (const p of this.ps) {
          const f = p.age / p.life;
          ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, f * 1.15)) * 0.16;
          const r = p.size * (1.4 + f * 2.4);
          ctx.drawImage(this.rim, p.x - r * 1.5, p.y - r * 0.6, r * 3, r * 1.2);
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = this.dark ? "source-over" : "screen";
      ctx.drawImage(fog, 0, 0, W, H);
    } else {
      ctx.globalCompositeOperation = this.dark ? "source-over" : "screen";
      for (const p of this.ps) {
        const f = p.age / p.life;
        ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, f * 1.15)) * 0.24;
        const d = p.size * (1 + f * 2.2) * 2;
        ctx.drawImage(this.sprites[p.k], p.x - d / 2, p.y - d / 2, d, d);
      }
    }
    // nacre glints
    ctx.globalCompositeOperation = "lighter";
    const s0 = e?.scale ?? 100;
    for (const g of this.glints) {
      const f = g.age / g.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * (0.5 + 0.5 * Math.sin(this.t * 9 + g.seed));
      const d = g.size * (s0 / 110) * 5;
      ctx.drawImage(this.glint, g.x - d / 2, g.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ LIQUID CHROME — LIGHTNING ═════════════════
   Chrome conducts. Small arcs crawl across the garment constantly,
   jumping between points on its surface, and every second or so a
   forked bolt cracks off the runner: a main channel with branches,
   restriking two or three times before it dies, lighting the whole
   scene for an instant. Sparks spit off wherever a bolt ends.
   Bolts are rebuilt every restrike with midpoint displacement, so no
   two look alike. Higher levels strike more often, further, with more
   branches. */

type Bolt = {
  /** anchor on the garment: index into the emitter path */
  at: number;
  /** channel points relative to the anchor */
  pts: Vec[];
  branches: Vec[][];
  end: Vec;
  age: number;
  life: number;
  strikes: number[];
  width: number;
  /** frames left at full brightness — a strike shows even on a slow frame */
  lit: number;
};

type Arc = { pts: Vec[]; age: number; life: number };

class Lightning implements Effect {
  private t = 0;
  private st: BoltStyle;
  private bolts: Bolt[] = [];
  private arcs: Arc[] = [];
  private sparks: P[] = [];
  private nextStrike = 0.5;
  private nextArc = 0;
  private flash = 0;
  private intensity = 0;
  private last: Emitter | null = null;
  private glow: HTMLCanvasElement;
  private dot: HTMLCanvasElement;

  constructor(variant?: string) {
    this.st = BOLT_STYLES[variant ?? "storm"] ?? BOLT_STYLES.storm;
    this.glow = softSprite(this.st.glow, 128);
    this.dot = softSprite(this.st.spark, 16, 0.3);
  }

  /** rebuild a bolt's shape (each restrike takes a new path) */
  private shape(b: Bolt, power: number) {
    b.lit = 2;
    // fewer subdivisions, rougher early: sharp kinks, not a wiggle
    b.pts = channel({ x: 0, y: 0 }, b.end, 0.46, 5);
    b.branches = [];
    const n = Math.round(2 + 2 * power + Math.random() * 2);
    const len = Math.hypot(b.end.x, b.end.y);
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand(0.15, 0.75) * b.pts.length);
      const from = b.pts[j];
      const base = Math.atan2(b.end.y, b.end.x);
      const ang = base + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.9);
      const L = len * rand(0.18, 0.42) * (1 - j / b.pts.length);
      const to = { x: from.x + Math.cos(ang) * L, y: from.y + Math.sin(ang) * L };
      b.branches.push(channel(from, to, 0.38, 4));
    }
  }

  private strike(e: Emitter) {
    const s = e.scale;
    const power = e.power ?? 1;
    const at = Math.floor(Math.random() * e.path.length);
    // bolts crack away from the runner: back with the air, and down
    const rel = { x: e.worldVel.x - e.bodyVel.x, y: e.worldVel.y - e.bodyVel.y };
    const rl = Math.hypot(rel.x, rel.y);
    let dir: Vec;
    if (rl > s * 1.2) {
      dir = { x: rel.x / rl, y: rand(0.1, 0.9) };
    } else {
      const c = centroid(e.path);
      const p = e.path[at];
      dir = { x: p.x < c.x ? -1 : 1, y: rand(-0.4, 0.9) };
    }
    const dl = Math.hypot(dir.x, dir.y) || 1;
    const L = s * rand(2.2, 3.4) * (0.75 + 0.35 * power);
    const b: Bolt = {
      at,
      pts: [],
      branches: [],
      end: { x: (dir.x / dl) * L, y: (dir.y / dl) * L },
      age: 0,
      life: rand(0.32, 0.5),
      // restrike times: the channel flickers on and off
      strikes: [0, rand(0.06, 0.1), rand(0.16, 0.24)].slice(0, 2 + (Math.random() < 0.6 ? 1 : 0)),
      width: s * rand(0.034, 0.05),
      lit: 2,
    };
    this.shape(b, power);
    this.bolts.push(b);
    this.flash = Math.max(this.flash, 0.9);
    this.spark(e.path[at].x + b.end.x, e.path[at].y + b.end.y, s, 14 * power);
  }

  private spark(x: number, y: number, s: number, n: number) {
    for (let i = 0; i < n && this.sparks.length < 260; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = s * rand(1, 4);
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - s,
        age: 0, life: rand(0.2, 0.5), size: rand(0.6, 1.4), seed: 0, k: 0,
      });
    }
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const power = this.last?.power ?? 1;
    const s = this.last?.scale ?? 100;

    if (e && e.path.length > 1 && intensity > 0.3) {
      // Level I only crackles; bolts come in at II and strike often at III
      const lv = lvl(e);
      this.nextStrike -= lv === 1 ? 0 : dt * (lv === 3 ? 1.25 : 0.55);
      if (this.nextStrike <= 0) {
        this.nextStrike = rand(0.6, 1.2);
        this.strike(e);
      }
      // crawling arcs between nearby points on the garment
      this.nextArc -= dt * (0.6 + 0.8 * power);
      while (this.nextArc <= 0) {
        this.nextArc += rand(0.03, 0.08);
        const i = Math.floor(Math.random() * e.path.length);
        const j = Math.min(e.path.length - 1, Math.max(0, i + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))));
        const a = e.path[i];
        const b = e.path[j];
        const lift = s * rand(-0.12, 0.12);
        const pts = channel(
          { x: a.x + rand(-0.04, 0.04) * s, y: a.y + lift },
          { x: b.x + rand(-0.04, 0.04) * s, y: b.y - lift },
          0.45,
          4,
        );
        this.arcs.push({ pts, age: 0, life: rand(0.06, 0.14) });
        if (Math.random() < 0.25) this.spark(b.x, b.y, s * 0.5, 3);
      }
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const before = b.age;
      b.age += dt;
      for (const st of b.strikes) {
        if (st > 0 && before < st && b.age >= st) {
          this.shape(b, power);
          this.flash = Math.max(this.flash, 0.55);
        }
      }
      if (b.age > b.life) this.bolts.splice(i, 1);
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].age += dt;
      if (this.arcs[i].age > this.arcs[i].life) this.arcs.splice(i, 1);
    }
    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.sparks.splice(i, 1);
        continue;
      }
      const f = 1 - Math.exp(-3 * dt);
      p.vx += (air.x - p.vx) * f;
      p.vy += s * 5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.flash *= Math.exp(-9 * dt);
  }

  ignite(e: Emitter) {
    if (e.path.length > 1) this.strike(e);
  }

  clear() {
    this.bolts.length = 0;
    this.arcs.length = 0;
    this.sparks.length = 0;
    this.flash = 0;
  }

  /** one channel, drawn as plasma: violet bloom, cyan body, white core */
  private stroke(ctx: CanvasRenderingContext2D, pts: Vec[], ox: number, oy: number, w: number, a: number) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
    };
    for (const [mul, col, al] of [
      [9, this.st.stroke[0], 0.22],
      [3.5, this.st.stroke[1], 0.6],
      [1, this.st.stroke[2], 1],
    ] as [number, string, number][]) {
      ctx.globalAlpha = a * al;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.8, w * mul);
      path();
      ctx.stroke();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e) return;
    const s = e.scale;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // at the full effect a strike lights the whole scene for an instant
    if (this.flash > 0.02) {
      ctx.globalAlpha = lvl(e) === 3 ? this.flash * 0.1 * this.intensity : 0;
      ctx.fillStyle = this.st.flash;
      ctx.fillRect(0, 0, W, H);
      const c = centroid(e.path);
      ctx.globalAlpha = this.flash * 0.6 * this.intensity;
      const d = s * 6;
      ctx.drawImage(this.glow, c.x - d / 2, c.y - d / 2, d, d);
    }

    // a constant cold glow on the chrome, flickering with the arcs
    if (this.intensity > 0.05) {
      const c = centroid(e.path);
      ctx.globalAlpha = (0.12 + 0.08 * Math.random()) * this.intensity;
      const d = s * 3;
      ctx.drawImage(this.glow, c.x - d / 2, c.y - d / 2, d, d);
    }

    for (const a of this.arcs) {
      const f = a.age / a.life;
      this.stroke(ctx, a.pts, 0, 0, s * 0.014, (1 - f) * this.intensity);
    }

    for (const b of this.bolts) {
      const anchor = e.path[Math.min(b.at, e.path.length - 1)];
      if (!anchor) continue;
      // on during each strike, flickering off between
      let on = 0;
      for (const st of b.strikes) {
        const dtS = b.age - st;
        if (dtS >= 0 && dtS < 0.09) on = Math.max(on, 1 - dtS / 0.09);
      }
      if (b.lit > 0) {
        on = 1;
        b.lit--;
      }
      const tail = Math.max(0, 1 - b.age / b.life) * 0.5; // afterglow in the air
      const a = Math.max(on, tail) * this.intensity;
      if (a < 0.02) continue;
      // bloom: a soft halo of light along the channel
      ctx.globalAlpha = a * 0.22;
      const hd = b.width * 14;
      for (let i = 0; i < b.pts.length; i += 6) {
        const q = b.pts[i];
        ctx.drawImage(this.glow, anchor.x + q.x - hd / 2, anchor.y + q.y - hd / 2, hd, hd);
      }
      this.stroke(ctx, b.pts, anchor.x, anchor.y, b.width, a);
      for (const br of b.branches) this.stroke(ctx, br, anchor.x, anchor.y, b.width * 0.55, a * 0.8);
      // hot point where the bolt ends
      ctx.globalAlpha = a;
      const d = s * 0.7;
      ctx.drawImage(this.glow, anchor.x + b.end.x - d / 2, anchor.y + b.end.y - d / 2, d, d);
    }

    for (const p of this.sparks) {
      const f = p.age / p.life;
      ctx.globalAlpha = (1 - f) * this.intensity;
      ctx.strokeStyle = this.st.spark;
      ctx.lineWidth = Math.max(0.8, p.size * (s / 140));
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
      ctx.stroke();
      const d = p.size * (s / 110) * 4;
      ctx.drawImage(this.dot, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ PEACH SHIFT — BUBBLES ═════════════════════
   Soap-film bubbles in the Peach Shift palette. The film's interference colours swirl as it
   drains (16 pre-rendered frames, played per bubble), a thin dark
   patch drifts near the top where the film is thinnest, and a window
   reflection sits on one side with a small kick light opposite. They
   wobble as they rise and pop into a ring and a spray of droplets. */

class Bubbles extends System {
  protected max = 150;
  private frames: HTMLCanvasElement[];
  private pops: { x: number; y: number; r: number; age: number }[] = [];
  private drops: P[] = [];
  private drop: HTMLCanvasElement;
  private static FRAMES = 16;

  constructor() {
    super();
    this.frames = [];
    for (let i = 0; i < Bubbles.FRAMES; i++) this.frames.push(Bubbles.render(128, i / Bubbles.FRAMES));
    this.drop = softSprite("rgba(255,214,196,0.9)", 16, 0.3);
  }

  private static render(size: number, phase: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const r = size / 2;
    const R = r * 0.94;

    // film: two counter-rotating interference swirls, strongest at the rim
    const film = document.createElement("canvas");
    film.width = film.height = size;
    const f = film.getContext("2d")!;
    // peach, blush, coral, gold, a touch of lilac where the film thins
    const hues = ["#ffb38a", "#ff9aa8", "#ff6f61", "#ffd27a", "#d9a6ff", "#ffb38a"];
    const swirl = (rot: number, alpha: number) => {
      if (typeof f.createConicGradient === "function") {
        const cg = f.createConicGradient(rot, r, r);
        hues.forEach((h, i) => cg.addColorStop(i / (hues.length - 1), h));
        f.globalAlpha = alpha;
        f.fillStyle = cg;
      } else {
        f.globalAlpha = alpha;
        f.fillStyle = hues[Math.floor(phase * 5) % 5];
      }
      f.beginPath();
      f.arc(r, r, R, 0, Math.PI * 2);
      f.fill();
    };
    swirl(phase * Math.PI * 2, 0.9);
    f.globalCompositeOperation = "lighter";
    swirl(-phase * Math.PI * 2 * 1.6 + 1.3, 0.45);
    // keep the film to the rim: clear centre, strong edge
    f.globalCompositeOperation = "destination-in";
    f.globalAlpha = 1;
    const rim = f.createRadialGradient(r, r, R * 0.45, r, r, R);
    rim.addColorStop(0, "rgba(0,0,0,0.04)");
    rim.addColorStop(0.75, "rgba(0,0,0,0.6)");
    rim.addColorStop(0.95, "rgba(0,0,0,0.95)");
    rim.addColorStop(1, "rgba(0,0,0,0)");
    f.fillStyle = rim;
    f.fillRect(0, 0, size, size);
    g.drawImage(film, 0, 0);

    // thin black film near the top, drifting
    const bx = r + Math.cos(phase * Math.PI * 2) * R * 0.2;
    const by = r - R * 0.55;
    const dark = g.createRadialGradient(bx, by, 0, bx, by, R * 0.35);
    dark.addColorStop(0, "rgba(0,0,0,0.35)");
    dark.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = dark;
    g.beginPath();
    g.arc(r, r, R, 0, Math.PI * 2);
    g.fill();

    // fine outline
    g.strokeStyle = "rgba(255,226,214,0.6)";
    g.lineWidth = size * 0.012;
    g.beginPath();
    g.arc(r, r, R, 0, Math.PI * 2);
    g.stroke();

    // window reflection, kick light, specular
    g.save();
    g.beginPath();
    g.arc(r, r, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath();
    g.ellipse(r * 0.62, r * 0.6, R * 0.26, R * 0.15, -0.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.ellipse(r * 1.42, r * 1.45, R * 0.18, R * 0.07, -0.7, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.arc(r * 0.5, r * 0.5, size * 0.028, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  protected rate(e: Emitter) {
    return 10 + e.scale * 0.11;
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
      size: rand(0.055, 0.16) * s,
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
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random();
      const sp = p.size * rand(4, 9);
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
      this.pops[i].age += dt;
      if (this.pops[i].age > 0.22) this.pops.splice(i, 1);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age > d.life) {
        this.drops.splice(i, 1);
        continue;
      }
      d.vy += 270 * dt;
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
    const F = Bubbles.FRAMES;
    for (const p of this.ps) {
      const f = p.age / p.life;
      ctx.globalAlpha = Math.min(1, f * 6) * (f > 0.92 ? (1 - f) / 0.08 : 1);
      const d = p.size * 2;
      const wob = 1 + Math.sin(this.t * 7 + p.seed) * 0.045;
      const frame = this.frames[Math.floor((((p.seed * 0.37 + this.t * 0.35) % 1) + 1) % 1 * F) % F];
      ctx.setTransform(wob, 0, 0, 2 - wob, p.x, p.y);
      ctx.drawImage(frame, -d / 2, -d / 2, d, d);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.strokeStyle = "rgba(255,200,184,0.9)";
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

/* ═══════════════════════ FULL REFLECT — LIGHT STREAKS ══════════════
   A long-exposure photograph, live. Streak heads are drawn into a
   half-resolution buffer that fades a little each frame and slides
   with the world, so light smears into silky trails. Headlights sweep
   across now and then; where one passes, the retroreflective beads in
   the fabric sparkle. */

class Streaks extends System {
  protected max = 560;
  private flare: HTMLCanvasElement;
  private glint: HTMLCanvasElement;
  private sweepAt = 1.2;
  private sweeps: { x0: number; x1: number; y: number; s: number; age: number }[] = [];
  private glints: P[] = [];
  private acc: HTMLCanvasElement[] = [];
  private flip = 0;
  private dt = 1 / 60;

  constructor() {
    super();
    this.flare = softSprite("rgba(255,255,255,0.9)", 128, 0.04);
    this.glint = Streaks.star();
  }

  private static star(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    g.translate(16, 16);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 6);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = core;
    g.fillRect(-16, -16, 32, 32);
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(-15, -0.6, 30, 1.2);
    g.fillRect(-0.6, -15, 1.2, 30);
    return c;
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
    if (m < s * 1.2) {
      // standing still: throw light outward from the body's centre
      const c = centroid(e.path);
      dx = at.x < c.x ? -1 : 1;
      dy = rand(-0.12, 0.12);
    } else {
      dx /= m;
      dy /= m;
    }
    const sp = Math.max(m * 1.4, s * 5) * rand(0.8, 1.3);
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
    this.dt = dt;
    super.update(dt, e, intensity);
    // a car passing: its headlights sweep across the runner
    if (e && intensity > 0.5 && e.path.length) {
      this.sweepAt -= dt;
      if (this.sweepAt <= 0) {
        this.sweepAt = rand(1.8, 3.2);
        const c = centroid(e.path);
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.sweeps.push({ x0: c.x - dir * e.scale * 3, x1: c.x + dir * e.scale * 3, y: c.y, s: e.scale, age: 0 });
      }
    }
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const w = this.sweeps[i];
      w.age += dt;
      // beads light up where the beam is crossing the garment
      if (e && w.age < 0.6) {
        const bx = w.x0 + (w.x1 - w.x0) * (w.age / 0.6);
        for (const p of e.path) {
          if (Math.abs(p.x - bx) < w.s * 0.5 && Math.random() < dt * 30 && this.glints.length < 60) {
            const fwd = e.torso?.fwd ?? { x: 1, y: 0 };
            const k = rand(0, 0.55) * w.s;
            this.glints.push({
              x: p.x + fwd.x * k + rand(-0.06, 0.06) * w.s,
              y: p.y + fwd.y * k + rand(-0.06, 0.06) * w.s,
              vx: e.worldVel.x, vy: 0, age: 0, life: rand(0.15, 0.3),
              size: rand(0.6, 1.2), seed: Math.random() * 10, k: 0,
            });
          }
        }
      }
      if (w.age > 0.6) this.sweeps.splice(i, 1);
    }
    for (let i = this.glints.length - 1; i >= 0; i--) {
      const g = this.glints[i];
      g.age += dt;
      g.x += g.vx * dt * 0.3;
      if (g.age > g.life) this.glints.splice(i, 1);
    }
  }

  clear() {
    super.clear();
    this.sweeps.length = 0;
    this.glints.length = 0;
    for (const c of this.acc) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const s0 = this.last ? this.last.scale : 100;
    const air = this.last?.worldVel ?? { x: 0, y: 0 };
    const r = 0.5;
    if (this.acc.length === 0) this.acc = [document.createElement("canvas"), document.createElement("canvas")];
    for (const c of this.acc) {
      if (c.width !== Math.ceil(W * r) || c.height !== Math.ceil(H * r)) {
        c.width = Math.ceil(W * r);
        c.height = Math.ceil(H * r);
      }
    }
    const prev = this.acc[this.flip];
    const next = this.acc[1 - this.flip];
    this.flip = 1 - this.flip;

    // the exposure: last frame, faded and carried with the world
    const g = next.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "copy";
    g.globalAlpha = 0.86;
    g.drawImage(prev, air.x * this.dt * r, air.y * this.dt * r);
    g.globalCompositeOperation = "lighter";
    g.setTransform(r, 0, 0, r, 0, 0);
    g.lineCap = "round";
    for (const p of this.ps) {
      const f = p.age / p.life;
      const a = Math.min(1, f * 10) * (1 - f);
      const w = p.size * (s0 / 120) * (p.k ? 2.4 : 1.2);
      const tx = p.x - p.vx * this.dt * 1.4;
      const ty = p.y - p.vy * this.dt * 1.4;
      g.globalAlpha = a * 0.5;
      g.lineWidth = w * 2.6;
      g.strokeStyle = "#6fa8ff";
      g.beginPath();
      g.moveTo(p.x, p.y - w);
      g.lineTo(tx, ty - w);
      g.stroke();
      g.strokeStyle = "#ffbf73";
      g.beginPath();
      g.moveTo(p.x, p.y + w);
      g.lineTo(tx, ty + w);
      g.stroke();
      g.globalAlpha = a;
      g.lineWidth = w;
      g.strokeStyle = "#ffffff";
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(tx, ty);
      g.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
    ctx.drawImage(next, 0, 0, W, H);

    // crisp heads on top, so the trails start sharp
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    for (const p of this.ps) {
      const f = p.age / p.life;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const L = s0 * 0.12;
      ctx.globalAlpha = Math.min(1, f * 10) * (1 - f);
      ctx.lineWidth = Math.max(1, p.size * (s0 / 120) * (p.k ? 1.6 : 0.8));
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - (p.vx / sp) * L, p.y - (p.vy / sp) * L);
      ctx.stroke();
    }

    // headlight sweeps with an anamorphic bar
    for (const w of this.sweeps) {
      const f = w.age / 0.6;
      const x = w.x0 + (w.x1 - w.x0) * f;
      const a = Math.sin(Math.PI * f);
      const d = w.s * 3;
      ctx.globalAlpha = a * 0.5;
      ctx.drawImage(this.flare, x - d / 2, w.y - d / 2, d, d);
      ctx.globalAlpha = a * 0.35;
      ctx.drawImage(this.flare, x - d * 1.8, w.y - d * 0.035, d * 3.6, d * 0.07);
    }
    // bead glints
    for (const gl of this.glints) {
      const f = gl.age / gl.life;
      ctx.globalAlpha = Math.sin(Math.PI * f);
      const d = gl.size * (s0 / 110) * 10;
      ctx.drawImage(this.glint, gl.x - d / 2, gl.y - d / 2, d, d);
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
  private colors: string[];
  /** ring, second ring, ribbon head, ribbon body, ribbon tail */
  private lines: string[];

  constructor(variant?: string) {
    const neon = variant === "neon";
    this.colors = neon ? ["#ffffff", "#7ff6ff", "#ff4fd8", "#8a6bff"] : ["#fff1c9", "#ffb627", "#ff5c1a", "#e0218a"];
    this.lines = neon ? ["#7ff6ff", "#ff4fd8", "#ffffff", "#7ff6ff", "#ff4fd8"] : ["#ffb627", "#e0218a", "#fff1c9", "#ff8a3a", "#e0218a"];
    this.spark = softSprite(neon ? "rgba(170,240,255,1)" : "rgba(255,214,140,1)", 24, 0.2);
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
      // light ribbons off the shoes come in at Level II
      if (foot && intensity > 0.05 && lvl(e) > 1) tr.push({ x: foot.x, y: foot.y, age: 0 });
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
        ctx.strokeStyle = k ? this.lines[1] : this.lines[0];
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
        ctx.strokeStyle = i > tr.length - 4 ? this.lines[2] : life > 0.5 ? this.lines[3] : this.lines[4];
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
  private blob = softSprite("rgba(255,255,255,1)", 64);
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

    // sparkle at the growing tips of each crystal
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.prints) {
      if (p.age > 0.9) continue;
      const grow = 1 - Math.pow(1 - Math.min(1, p.age / 0.28), 3);
      for (const [a, len] of p.arms) {
        const tw = 0.5 + 0.5 * Math.sin(this.t * 24 + a * 7);
        ctx.globalAlpha = (1 - p.age / 0.9) * tw;
        const x = p.x + Math.cos(a) * p.s * len * grow;
        const y = p.y + Math.sin(a) * p.s * len * grow * 0.2;
        const d = p.s * 0.12;
        ctx.drawImage(this.glint, x - d / 2, y - d / 2, d, d);
      }
    }

    // cold air
    const gl = GLField.get();
    const e = this.last;
    if (gl && e && this.puffs.length) {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      const m = gl.begin(W, H);
      for (const q of this.puffs) {
        const f = q.age / q.life;
        m.globalAlpha = Math.sin(Math.PI * f) * 0.5;
        const r = q.size * (1 + f * 1.5);
        m.drawImage(this.blob, q.x - r, q.y - r * 0.6, r * 2, r * 1.2);
      }
      const air = e.worldVel;
      const al = Math.hypot(air.x, air.y) || 1;
      const fog = gl.renderFog({
        t: this.t,
        flow: { x: (air.x / al) * 0.4, y: 0.05 },
        size: e.scale * 0.6,
        colors: ["#d9f3ff", "#ffffff", "#9fd8ff"],
        alpha: 1,
        detail: 3,
      });
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 1;
      ctx.drawImage(fog, 0, 0, W, H);
    } else {
      ctx.globalCompositeOperation = "screen";
      for (const q of this.puffs) {
        const f = q.age / q.life;
        ctx.globalAlpha = Math.sin(Math.PI * f) * 0.35;
        const d = q.size * (1 + f * 1.5) * 2;
        ctx.drawImage(this.puff, q.x - d / 2, q.y - d / 2, d, d * 0.6);
      }
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
  private blob = softSprite("rgba(255,255,255,1)", 64);
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
      // thin and short-lived: heat coming off a head, not a cloud
      life: rand(0.6, 1.1),
      size: rand(0.22, 0.42) * r,
      seed: Math.random() * 100,
      k: Math.floor(Math.random() * 3),
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const r = e?.head?.r ?? 20;
    this.drag(p, dt, e, 1.1);
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
    const gl = GLField.get();
    const e = this.last;
    if (gl && e) {
      // steam as real vapour: the particles place it, the shader tears it into wisps
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      const m = gl.begin(W, H);
      for (const p of this.ps) {
        const f = p.age / p.life;
        m.globalAlpha = Math.sin(Math.PI * Math.min(1, f * 1.2)) * (p.k === 2 ? 0.5 : 0.3);
        const r = p.size * (1 + f * 1.6);
        m.drawImage(this.blob, p.x - r, p.y - r, r * 2, r * 2);
      }
      const air = e.worldVel;
      const al = Math.hypot(air.x, air.y) || 1;
      const fog = gl.renderFog({
        t: this.t,
        flow: { x: (air.x / al) * 0.45, y: -0.35 },
        size: (e.head?.r ?? e.scale * 0.27) * 3.2,
        colors: ["#e9eef3", "#ffffff", "#c9d3dc"],
        alpha: 0.7,
        detail: 3.4,
      });
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(fog, 0, 0, W, H);
    } else {
      ctx.globalCompositeOperation = "screen";
      for (const p of this.ps) {
        const f = p.age / p.life;
        ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, f * 1.2)) * (p.k === 2 ? 0.45 : 0.32);
        const d = p.size * (1 + f * 2.4) * 2;
        ctx.drawImage(this.sprites[p.k], p.x - d / 2, p.y - d / 2, d, d);
      }
    }
    ctx.restore();
  }
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
  private blob = softSprite("rgba(255,255,255,1)", 64);

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

    // drips off the shoes: full effect only
    if (e && intensity > 0.2 && lvl(e) === 3) {
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
    // fresh prints are still burning: low flames lick up off them
    const gl = GLField.get();
    const e = this.last;
    if (gl && e && lvl(e) > 1) {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      const m = gl.begin(W, H);
      let any = false;
      for (const p of this.prints) {
        const heat = Math.pow(1 - p.age / p.life, 1.7);
        if (heat < 0.25) continue;
        any = true;
        m.globalAlpha = (heat - 0.25) * 0.95;
        const r1 = p.s * 0.3;
        const r2 = p.s * 0.2;
        m.drawImage(this.blob, p.x + p.s * 0.12 - r1, p.y - p.s * 0.06 - r1, r1 * 2, r1 * 2);
        m.drawImage(this.blob, p.x - p.s * 0.26 - r2, p.y - p.s * 0.05 - r2, r2 * 2, r2 * 2);
      }
      if (any) {
        const air = e.worldVel;
        const fire = gl.renderFire({
          t: this.t,
          dir: { x: Math.max(-0.8, Math.min(0.8, air.x / (e.scale * 6))), y: -1 },
          size: e.scale * 0.55,
          palette: "lava",
        });
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 1;
        ctx.drawImage(fire, 0, 0, W, H);
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

/* ═══════════════════════ HEADWEAR — RUNNER HUD ═════════════════════
   A holographic readout beside the runner's head, standard on the
   Cooling Headband, in a theme the owner picks. The numbers are
   simulated (and say so); in production a watch feeds them. Higher
   levels unlock more readouts. */

const HUD_COLORS: Record<string, { c: string; panel: string }> = {
  chrome: { c: "#7ff0ff", panel: "rgba(8,28,36,0.42)" },
  heat: { c: "#ffa25a", panel: "rgba(36,14,6,0.45)" },
  night: { c: "#8dff9a", panel: "rgba(6,26,10,0.45)" },
  rose: { c: "#ffb0c4", panel: "rgba(36,10,20,0.45)" },
  gold: { c: "#ffd772", panel: "rgba(30,22,6,0.45)" },
  mono: { c: "#f2efe8", panel: "rgba(14,14,16,0.45)" },
};

class Hud implements Effect {
  private t = 0;
  private col: string;
  private rgb: string;
  private panel: string;

  constructor(theme?: string) {
    const th = HUD_COLORS[theme ?? "chrome"] ?? HUD_COLORS.chrome;
    this.col = th.c;
    this.rgb = hexRgb(th.c).join(",");
    this.panel = th.panel;
  }
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
    const cyan = this.col;
    const rgba = (a: number) => `rgba(${this.rgb},${a})`;

    // Level I: pace and heart rate. II adds distance and cadence. III, the splits graph.
    const rows = level + 1;
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
    ctx.strokeStyle = rgba(0.55);
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

    ctx.fillStyle = this.panel;
    ctx.fillRect(0, 0, pw, ph);
    ctx.fillStyle = rgba(0.05);
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
    ctx.shadowColor = rgba(0.8);
    ctx.shadowBlur = r * 0.25;
    ctx.textBaseline = "alphabetic";

    ctx.font = lab;
    ctx.fillStyle = rgba(0.6);
    ctx.fillText("SIM", pw - pad - ctx.measureText("SIM").width, pad + r * 0.2);

    const p = this.pace();
    const pace = `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`;
    let y = pad + r * 0.25;
    ctx.fillStyle = rgba(0.7);
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
    const count = [3, 6, 9][levelOf(this.last?.power ?? 1) - 1];
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
    const count = [3, 6, 9][levelOf(this.last?.power ?? 1) - 1];
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

/* ═══════════════════════ HEADWEAR — CORONA ═════════════════════════
   A total solar eclipse, worn. The head is the moon: a ring of fire
   burns around it (the fire shader, licking outward from the centre),
   prominences loop off the rim and fall back, faint streamers reach
   out into the dark, and a thin chromosphere line hugs the edge. When
   the chip is read, a diamond-ring flash breaks out on one side.
   Higher levels widen the ring and throw bigger, more frequent flares. */

type Prominence = { a0: number; a1: number; h: number; age: number; life: number };

class Corona implements Effect {
  private t = 0;
  private grow = 0;
  private head: Emitter["head"] | null = null;
  private last: Emitter | null = null;
  private loops: Prominence[] = [];
  private loopAt = 0.4;
  private sparks: P[] = [];
  private flash: { a: number; age: number } | null = null;
  private blob = softSprite("rgba(255,255,255,1)", 64);
  private glow = softSprite("rgba(255,140,90,0.55)", 128);
  private flare = softSprite("rgba(255,255,255,1)", 128, 0.05);
  private dot = softSprite("rgba(255,210,150,1)", 16, 0.3);
  private rays: { a: number; len: number; w: number; seed: number }[] = [];

  constructor() {
    // streamers: uneven, like a real corona, longer near the "equator"
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rand(-0.06, 0.06);
      const eq = Math.abs(Math.cos(a));
      this.rays.push({ a, len: 1.6 + 3.2 * eq * Math.random() + Math.random() * 0.8, w: rand(0.06, 0.16), seed: Math.random() * 10 });
    }
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    if (e?.head) this.head = e.head;
    const target = intensity > 0.3 ? 1 : 0;
    this.grow += (target - this.grow) * (1 - Math.exp(-(target ? 1.8 : 6) * dt));
    const h = this.head;
    const power = this.last?.power ?? 1;
    const air = this.last?.worldVel ?? { x: 0, y: 0 };

    if (h && this.grow > 0.4) {
      this.loopAt -= dt * (0.6 + 0.6 * power);
      if (this.loopAt <= 0) {
        this.loopAt = rand(0.5, 1.1);
        const a0 = Math.random() * Math.PI * 2;
        const span = rand(0.3, 0.65);
        this.loops.push({ a0, a1: a0 + span * (Math.random() < 0.5 ? 1 : -1), h: h.r * rand(0.5, 1.1) * (0.6 + 0.5 * power), age: 0, life: rand(1.2, 1.9) });
      }
      // sparks thrown off the rim
      if (Math.random() < dt * 30 * power * this.grow && this.sparks.length < 140) {
        const a = Math.random() * Math.PI * 2;
        const R = h.r * 1.35;
        const sp = h.r * rand(1.2, 3);
        this.sparks.push({
          x: h.c.x + Math.cos(a) * R, y: h.c.y + Math.sin(a) * R,
          vx: Math.cos(a) * sp + (e?.bodyVel.x ?? 0) * 0.5, vy: Math.sin(a) * sp,
          age: 0, life: rand(0.4, 0.9), size: rand(0.7, 1.4), seed: Math.random() * 10, k: 0,
        });
      }
    }
    for (let i = this.loops.length - 1; i >= 0; i--) {
      this.loops[i].age += dt;
      if (this.loops[i].age > this.loops[i].life) this.loops.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.sparks.splice(i, 1);
        continue;
      }
      const f = 1 - Math.exp(-2 * dt);
      p.vx += (air.x - p.vx) * f;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (this.flash) {
      this.flash.age += dt;
      if (this.flash.age > 1.1) this.flash = null;
    }
  }

  ignite(e: Emitter) {
    this.grow = Math.max(this.grow, 0.05);
    const h = e.head;
    // the diamond ring breaks out up and forward
    if (h) this.flash = { a: Math.atan2(h.up.y + h.fwd.y * 0.8, h.up.x + h.fwd.x * 0.8), age: 0 };
  }

  clear() {
    this.grow = 0;
    this.loops.length = 0;
    this.sparks.length = 0;
    this.flash = null;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const h = this.head;
    if (!h || this.grow < 0.01) return;
    const power = this.last?.power ?? 1;
    const r = h.r;
    const c = h.c;
    const R = r * (1.32 + 0.08 * power);
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // streamers: long, faint, slowly breathing
    for (const ray of this.rays) {
      const L = r * ray.len * (0.55 + 0.45 * power) * this.grow * (0.85 + 0.15 * Math.sin(this.t * 0.7 + ray.seed));
      const x0 = c.x + Math.cos(ray.a) * R * 0.9;
      const y0 = c.y + Math.sin(ray.a) * R * 0.9;
      const x1 = c.x + Math.cos(ray.a) * (R + L);
      const y1 = c.y + Math.sin(ray.a) * (R + L);
      const nx = -Math.sin(ray.a) * r * ray.w;
      const ny = Math.cos(ray.a) * r * ray.w;
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(255,220,196,0.5)");
      g.addColorStop(0.4, "rgba(255,170,150,0.16)");
      g.addColorStop(1, "rgba(255,150,150,0)");
      ctx.globalAlpha = this.grow;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 + nx, y0 + ny);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0 - nx, y0 - ny);
      ctx.closePath();
      ctx.fill();
    }
    // inner corona glow
    ctx.globalAlpha = 0.55 * this.grow;
    const gd = R * 4.2;
    ctx.drawImage(this.glow, c.x - gd / 2, c.y - gd / 2, gd, gd);

    // the ring of fire and the prominences, through the fire shader
    const gl = GLField.get();
    if (gl) {
      const m = gl.begin(W, H);
      const N = 44;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const flick = 0.72 + 0.28 * Math.sin(this.t * 3.1 + i * 1.7) * Math.sin(this.t * 1.3 + i);
        const br = r * (0.34 + 0.08 * power);
        m.globalAlpha = 0.55 * this.grow * flick;
        m.drawImage(this.blob, c.x + Math.cos(a) * R - br, c.y + Math.sin(a) * R - br, br * 2, br * 2);
      }
      for (const L of this.loops) {
        const f = L.age / L.life;
        const rise = Math.sin(Math.PI * Math.min(1, f * 1.15));
        for (let k = 0; k <= 14; k++) {
          const u = k / 14;
          const a = L.a0 + (L.a1 - L.a0) * u;
          const rr = R + L.h * Math.sin(Math.PI * u) * rise;
          const br = r * 0.2;
          m.globalAlpha = 0.65 * this.grow * (1 - f * 0.6);
          m.drawImage(this.blob, c.x + Math.cos(a) * rr - br, c.y + Math.sin(a) * rr - br, br * 2, br * 2);
        }
      }
      const fire = gl.renderFire({ t: this.t, dir: { x: 0, y: -1 }, size: r * (1.5 + 0.5 * power), palette: "heat", center: c });
      ctx.globalAlpha = 1;
      ctx.drawImage(fire, 0, 0, W, H);
    } else {
      // 2D fallback: a glowing ring
      ctx.globalAlpha = this.grow;
      ctx.strokeStyle = "rgba(255,140,60,0.9)";
      ctx.lineWidth = r * 0.25;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
      ctx.stroke();
    }

    // chromosphere: a thin pink-red line hugging the moon's edge
    ctx.globalAlpha = 0.85 * this.grow;
    ctx.strokeStyle = "#ff4f74";
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.shadowColor = "rgba(255,79,116,0.9)";
    ctx.shadowBlur = r * 0.3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 1.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // sparks
    for (const p of this.sparks) {
      const f = p.age / p.life;
      ctx.globalAlpha = (1 - f) * this.grow;
      const d = p.size * (r / 26) * 4;
      ctx.drawImage(this.dot, p.x - d / 2, p.y - d / 2, d, d);
    }

    // the diamond ring
    if (this.flash) {
      const f = this.flash.age / 1.1;
      const a = Math.pow(1 - f, 1.6);
      const x = c.x + Math.cos(this.flash.a) * r * 1.08;
      const y = c.y + Math.sin(this.flash.a) * r * 1.08;
      ctx.globalAlpha = a;
      const d = r * 3.2;
      ctx.drawImage(this.flare, x - d / 2, y - d / 2, d, d);
      ctx.globalAlpha = a * 0.8;
      ctx.drawImage(this.flare, x - d * 2.2, y - d * 0.03, d * 4.4, d * 0.06);
      ctx.drawImage(this.flare, x - d * 0.03, y - d * 1.4, d * 0.06, d * 2.8);
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


/* ═══════════════════════ GREEN SHIFT — LEAF DRIFT ══════════════════
   Leaves peel off the fabric and tumble in the air behind you, each one
   flipping as it turns (front face lit, back face darker), and at the
   end of its life it breaks into a few motes of mint light. Earth to
   energy. Leaves are pre-rendered sprites, so a hundred of them cost a
   hundred drawImage calls and nothing else. */

const LEAF_STYLES: Record<string, { fronts: string[]; backs: string[]; mote: string; petal?: boolean }> = {
  green: { fronts: ["#7a9a2e", "#2fae63", "#8fe6b8", "#4cc27a"], backs: ["#4d6219", "#1a6e3d", "#5aa882", "#2c7d4c"], mote: "rgba(160,255,210,1)" },
  autumn: { fronts: ["#e0471b", "#f2a024", "#c22a1e", "#e8c040"], backs: ["#8f2a10", "#9e6312", "#741812", "#94781e"], mote: "rgba(255,200,120,1)" },
  sakura: { fronts: ["#ffd3e1", "#ffb7cd", "#fff0f4", "#ff9fbd"], backs: ["#e8a6bb", "#d98aa4", "#efd0d9", "#cc7a96"], mote: "rgba(255,220,235,1)", petal: true },
};

class Leaves extends System {
  protected max = 160;
  private fronts: HTMLCanvasElement[];
  private backs: HTMLCanvasElement[];
  private frontsSoft: HTMLCanvasElement[];
  private backsSoft: HTMLCanvasElement[];
  private motes: P[] = [];
  private mote: HTMLCanvasElement;

  private petal: boolean;

  constructor(variant?: string) {
    super();
    const v = LEAF_STYLES[variant ?? "green"] ?? LEAF_STYLES.green;
    this.petal = !!v.petal;
    const draw = v.petal ? Leaves.petalShape : Leaves.leaf;
    this.fronts = v.fronts.map((c) => draw(c, true));
    this.backs = v.backs.map((c) => draw(c, false));
    // a few leaves pass close to the lens, big and out of focus
    this.frontsSoft = this.fronts.map((c) => blurSprite(c, 3));
    this.backsSoft = this.backs.map((c) => blurSprite(c, 3));
    this.mote = softSprite(v.mote, 16, 0.25);
  }

  /** a cherry blossom petal: rounded, with a notch at the tip */
  private static petalShape(color: string, front: boolean): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 32;
    const g = c.getContext("2d")!;
    g.translate(32, 16);
    g.beginPath();
    g.moveTo(-26, 0);
    g.bezierCurveTo(-18, -15, 14, -16, 26, -5);
    g.lineTo(19, 0);
    g.lineTo(26, 5);
    g.bezierCurveTo(14, 16, -18, 15, -26, 0);
    g.closePath();
    const grad = g.createLinearGradient(-26, 0, 26, 0);
    grad.addColorStop(0, front ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)");
    grad.addColorStop(0.5, "rgba(255,255,255,0)");
    g.fillStyle = color;
    g.fill();
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = front ? "rgba(255,240,245,0.5)" : "rgba(120,40,70,0.2)";
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-24, 0);
    g.quadraticCurveTo(0, -1, 18, 0);
    g.stroke();
    return c;
  }

  /** a pointed leaf with a midrib, drawn along +x */
  private static leaf(color: string, front: boolean): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 32;
    const g = c.getContext("2d")!;
    g.translate(32, 16);
    g.beginPath();
    g.moveTo(-30, 0);
    g.bezierCurveTo(-14, -15, 14, -13, 30, 0);
    g.bezierCurveTo(14, 13, -14, 15, -30, 0);
    g.closePath();
    const grad = g.createLinearGradient(0, -14, 0, 14);
    grad.addColorStop(0, front ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0)");
    g.fillStyle = color;
    g.fill();
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = front ? "rgba(235,255,225,0.7)" : "rgba(0,0,0,0.25)";
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-28, 0);
    g.quadraticCurveTo(0, -1.5, 28, 0);
    for (const x of [-14, -2, 10]) {
      g.moveTo(x, -0.6);
      g.lineTo(x + 7, -6);
      g.moveTo(x, 0.4);
      g.lineTo(x + 7, 5.5);
    }
    g.stroke();
    return c;
  }

  protected rate(e: Emitter) {
    return 26 + e.scale * 0.3;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    return {
      x: at.x + rand(-0.04, 0.04) * s,
      y: at.y + rand(-0.04, 0.04) * s,
      vx: e.bodyVel.x * 0.7 + rand(-0.4, 0.4) * s,
      vy: e.bodyVel.y * 0.7 - rand(0.3, 0.9) * s,
      age: 0,
      life: rand(1.3, 2.3),
      size: rand(0.11, 0.18) * s,
      seed: Math.random() * 100,
      k: Math.floor(Math.random() * 4),
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const s = e ? e.scale : 100;
    this.drag(p, dt, e, 1.8);
    p.vy += s * (this.petal ? 0.26 : 0.45) * dt; // leaves fall slowly, petals slower
    p.vx += Math.sin(this.t * 4 + p.seed) * s * 1.3 * dt;
    p.vy += Math.cos(this.t * 3 + p.seed) * s * 0.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  protected onDeath(p: P) {
    // the leaf breaks into light
    for (let i = 0; i < 3 && this.motes.length < 220; i++) {
      this.motes.push({
        x: p.x + rand(-1, 1) * p.size,
        y: p.y + rand(-1, 1) * p.size,
        vx: p.vx * 0.4 + rand(-0.3, 0.3) * p.size * 6,
        vy: p.vy * 0.2 - rand(0.4, 1) * p.size * 6,
        age: 0,
        life: rand(0.4, 0.8),
        size: rand(0.8, 1.6),
        seed: 0,
        k: 0,
      });
    }
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    super.update(dt, e, intensity);
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.age += dt;
      if (m.age >= m.life) {
        this.motes[i] = this.motes[this.motes.length - 1];
        this.motes.pop();
        continue;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
  }

  clear() {
    super.clear();
    this.motes.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.ps) {
      const f = p.age / p.life;
      const spin = ((p.seed % 1) - 0.5) * 7;
      const ang = p.seed + p.age * spin + Math.atan2(p.vy, p.vx) * 0.3;
      const flip = Math.cos(p.age * (3 + (p.seed % 3)) + p.seed);
      ctx.globalAlpha = Math.min(1, f * 8) * (f > 0.8 ? (1 - f) / 0.2 : 1);
      ctx.setTransform(1, 0, 0, 1, p.x, p.y);
      ctx.rotate(ang);
      ctx.scale(1, Math.max(0.12, Math.abs(flip)));
      const near = p.seed > 93;
      const L = p.size * (near ? 4.6 : 2);
      if (near) ctx.globalAlpha *= 0.8;
      const img = near
        ? flip >= 0 ? this.frontsSoft[p.k] : this.backsSoft[p.k]
        : flip >= 0 ? this.fronts[p.k] : this.backs[p.k];
      ctx.drawImage(img, -L / 2, -L / 4, L, L / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    const s0 = this.last?.scale ?? 100;
    for (const m of this.motes) {
      ctx.globalAlpha = 1 - m.age / m.life;
      const d = m.size * (s0 / 110) * 4;
      ctx.drawImage(this.mote, m.x - d / 2, m.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ─────────────────────────── factory ─────────────────────────── */

export function createEffect(id: EffectId, variant?: string): Effect {
  switch (id) {
    case "flames":
      return new Flames(variant);
    case "stars":
      return new Stars();
    case "mist":
      return new Mist(variant);
    case "bubbles":
      return new Bubbles();
    case "lightning":
      return new Lightning(variant);
    case "streaks":
      return new Streaks();
    case "strike":
      return new Strike(variant);
    case "frost":
      return new Frost();
    case "laurel":
      return new Laurel();
    case "steam":
      return new Steam();
    case "embers":
      return new Embers();
    case "hud":
      return new Hud(variant);
    case "ghost":
      return new Ghost();
    case "wings":
      return new Wings();
    case "corona":
      return new Corona();
    case "leaves":
      return new Leaves(variant);
    default:
      return createSetEffect(id, variant) ?? new Stars();
  }
}
