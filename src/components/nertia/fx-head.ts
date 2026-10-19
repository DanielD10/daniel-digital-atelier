/**
 * Headwear effects that sit around the head: Halo, Black Halo, Crown
 * of Light, Orbit and Storm Cloud. All of them read `head` (a circle
 * with up and forward vectors) and ease in with the chip read, so they
 * grow into place instead of popping on.
 */

import { GLField } from "./glfield";
import {
  BOLT_STYLES,
  channel,
  glintSprite,
  lvl,
  rand,
  softSprite,
  stepList,
  strokeBolt,
  type Effect,
  type Emitter,
  type P,
  type Vec,
} from "./fxkit";

type Head = NonNullable<Emitter["head"]>;
const ZERO: Vec = { x: 0, y: 0 };

/** eases toward 1 while the effect is live, quickly back to 0 when not */
function ease(cur: number, intensity: number, dt: number, rate = 2) {
  const target = intensity > 0.3 ? 1 : 0;
  return cur + (target - cur) * (1 - Math.exp(-(target ? rate : 7) * dt));
}

/** the angle of the head's forward axis on screen: rings lie across it */
const axisOf = (h: Head) => Math.atan2(h.fwd.y, h.fwd.x);

/* ═══════════════════════ HALO / BLACK HALO ═════════════════════════
   A ring of light floating over the head, bobbing with the stride. Gold
   sheds motes of light that fall past the shoulders; at the full
   effect it throws faint rays down over you. The black version is a
   dark ring with a violet rim that pulls dark motes up into it. */

export class Halo implements Effect {
  private t = 0;
  private grow = 0;
  private head: Head | null = null;
  private last: Emitter | null = null;
  private motes: P[] = [];
  private dark: boolean;
  private mote: HTMLCanvasElement;
  private glow: HTMLCanvasElement;

  constructor(variant?: string) {
    this.dark = variant === "void";
    this.mote = softSprite(this.dark ? "rgba(170,90,255,1)" : "rgba(255,226,150,1)", 16, 0.3);
    this.glow = softSprite(this.dark ? "rgba(120,50,220,0.55)" : "rgba(255,200,100,0.5)", 128);
  }

  private center(h: Head): Vec {
    const bob = Math.sin(this.t * 1.7) * h.r * 0.06;
    const lift = h.r * (1.6 + bob / h.r);
    return { x: h.c.x + h.up.x * lift, y: h.c.y + h.up.y * lift };
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    if (e?.head) this.head = e.head;
    this.grow = ease(this.grow, intensity, dt, 1.6);
    const h = this.head;
    const air = this.last?.worldVel ?? ZERO;
    if (h && this.grow > 0.5 && lvl(this.last) > 1 && Math.random() < dt * 22 && this.motes.length < 120) {
      const c = this.center(h);
      const a = Math.random() * Math.PI * 2;
      const x = c.x + Math.cos(a) * h.r * 0.92;
      const y = c.y + Math.sin(a) * h.r * 0.26;
      this.motes.push(
        this.dark
          ? // dark motes come up from below and vanish into the ring
            { x: x + rand(-0.4, 0.4) * h.r, y: y + h.r * rand(1.4, 2.6), vx: air.x * 0.2, vy: -h.r * rand(1, 1.6), age: 0, life: rand(0.9, 1.4), size: rand(0.6, 1.2), seed: 0, k: 0 }
          : { x, y, vx: (e?.bodyVel.x ?? 0) * 0.4, vy: h.r * rand(0.3, 0.9), age: 0, life: rand(0.9, 1.6), size: rand(0.6, 1.3), seed: Math.random() * 10, k: 0 },
      );
    }
    stepList(this.motes, dt, air, 1.4, this.dark ? 0 : 0.6, h?.r ?? 20);
  }

  ignite() {
    this.grow = Math.max(this.grow, 0.05);
  }

  clear() {
    this.grow = 0;
    this.motes.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const h = this.head;
    if (!h || this.grow < 0.01) return;
    const lv = lvl(this.last);
    const c = this.center(h);
    const rx = h.r * 1.15 * (0.6 + 0.4 * this.grow);
    const ry = h.r * 0.32 * (0.6 + 0.4 * this.grow);
    const rot = axisOf(h);
    const G = this.grow;
    ctx.save();

    // god rays, down over the wearer
    if (lv === 3 && !this.dark) {
      const g = ctx.createLinearGradient(c.x, c.y, c.x - h.up.x * h.r * 3, c.y - h.up.y * h.r * 3);
      g.addColorStop(0, "rgba(255,220,140,0.16)");
      g.addColorStop(1, "rgba(255,220,140,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = G * (0.8 + 0.2 * Math.sin(this.t * 2));
      ctx.fillStyle = g;
      const ax = Math.cos(rot);
      const ay = Math.sin(rot);
      const d = h.r * 3.2;
      ctx.beginPath();
      ctx.moveTo(c.x - ax * rx, c.y - ay * rx);
      ctx.lineTo(c.x + ax * rx, c.y + ay * rx);
      ctx.lineTo(c.x + ax * rx * 1.8 - h.up.x * d, c.y + ay * rx * 1.8 - h.up.y * d);
      ctx.lineTo(c.x - ax * rx * 1.8 - h.up.x * d, c.y - ay * rx * 1.8 - h.up.y * d);
      ctx.closePath();
      ctx.fill();
    }

    const ring = (w: number, color: string, a: number, from = 0, to = Math.PI * 2) => {
      ctx.globalAlpha = a * G;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, w);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, ry, rot, from, to);
      ctx.stroke();
    };

    if (this.dark) {
      // it darkens the air around it
      ctx.globalCompositeOperation = "source-over";
      const dg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rx * 1.8);
      dg.addColorStop(0, "rgba(4,2,8,0.45)");
      dg.addColorStop(1, "rgba(4,2,8,0)");
      ctx.globalAlpha = G;
      ctx.fillStyle = dg;
      ctx.fillRect(c.x - rx * 2, c.y - rx * 2, rx * 4, rx * 4);
      ctx.globalCompositeOperation = "lighter";
      ring(h.r * 0.4, "rgba(140,60,255,1)", 0.16);
      ring(h.r * 0.16, "rgba(176,102,255,1)", 0.55);
      ctx.globalCompositeOperation = "source-over";
      ring(h.r * 0.1, "#050208", 1);
      ctx.globalCompositeOperation = "lighter";
      ring(h.r * 0.025, "rgba(220,170,255,1)", 0.8, 0, Math.PI);
    } else {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 * G;
      const d = rx * 3.4;
      ctx.drawImage(this.glow, c.x - d / 2, c.y - d / 2, d, d);
      ring(h.r * 0.42, "rgba(255,170,60,1)", lv === 1 ? 0.08 : 0.16);
      ring(h.r * 0.14, "rgba(255,214,110,1)", 0.6);
      ring(h.r * 0.045, "rgba(255,251,232,1)", 1);
      // the near side catches more light
      ring(h.r * 0.08, "rgba(255,255,255,1)", 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
    }

    ctx.globalCompositeOperation = "lighter";
    for (const m of this.motes) {
      const f = m.age / m.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * G;
      const d = m.size * (h.r / 26) * 4;
      ctx.drawImage(this.mote, m.x - d / 2, m.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ CROWN OF LIGHT ════════════════════════════
   Spikes of light standing on a ring around the crown of the head,
   turning slowly, so they swing round to the front and back. Front
   spikes burn bright, back ones dim. Gems glint at the tips. Level I
   is a low band of five; the full effect is nine tall spikes that
   throw beams straight up. */

export class Crown implements Effect {
  private t = 0;
  private grow = 0;
  private head: Head | null = null;
  private last: Emitter | null = null;
  private beams: { i: number; age: number }[] = [];
  private beamAt = 0.6;
  private gem = glintSprite("rgba(255,236,180,1)", 64);
  private glow = softSprite("rgba(255,200,110,0.5)", 128);
  private sparks: P[] = [];

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    if (e?.head) this.head = e.head;
    this.grow = ease(this.grow, intensity, dt, 1.8);
    const lv = lvl(this.last);
    if (lv === 3 && this.grow > 0.6) {
      this.beamAt -= dt;
      if (this.beamAt <= 0) {
        this.beamAt = rand(0.35, 0.9);
        this.beams.push({ i: Math.floor(Math.random() * 9), age: 0 });
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].age += dt;
      if (this.beams[i].age > 0.6) this.beams.splice(i, 1);
    }
    const h = this.head;
    if (h && lv > 1 && this.grow > 0.5 && Math.random() < dt * 16 && this.sparks.length < 80) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.push({
        x: h.c.x + h.up.x * h.r + Math.cos(a) * h.r, y: h.c.y + h.up.y * h.r + Math.sin(a) * h.r * 0.3,
        vx: rand(-0.3, 0.3) * h.r, vy: -rand(0.6, 1.4) * h.r, age: 0, life: rand(0.6, 1.1), size: rand(0.6, 1.2), seed: 0, k: 0,
      });
    }
    stepList(this.sparks, dt, this.last?.worldVel ?? ZERO, 1.2, 0, h?.r ?? 20);
  }

  ignite() {
    this.grow = Math.max(this.grow, 0.05);
  }

  clear() {
    this.grow = 0;
    this.beams.length = 0;
    this.sparks.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const h = this.head;
    if (!h || this.grow < 0.01) return;
    const lv = lvl(this.last);
    const G = this.grow;
    const N = lv === 1 ? 5 : lv === 2 ? 7 : 9;
    const tall = lv === 1 ? 0.45 : lv === 2 ? 0.72 : 1.0;
    const c = { x: h.c.x + h.up.x * h.r * 0.95, y: h.c.y + h.up.y * h.r * 0.95 };
    const rx = h.r * 1.05;
    const ry = h.r * 0.3;
    const rot = axisOf(h);
    const A = { x: Math.cos(rot), y: Math.sin(rot) };
    const B = { x: -Math.sin(rot), y: Math.cos(rot) };
    const turn = this.t * 0.45;
    const spikes = Array.from({ length: N }, (_, i) => {
      const phi = turn + (i / N) * Math.PI * 2;
      const px = Math.cos(phi) * rx;
      const py = Math.sin(phi) * ry;
      const base = { x: c.x + A.x * px + B.x * py, y: c.y + A.y * px + B.y * py };
      const hgt = h.r * tall * (i % 2 ? 0.7 : 1) * G;
      const tip = { x: base.x + h.up.x * hgt, y: base.y + h.up.y * hgt };
      return { i, base, tip, depth: Math.sin(phi) };
    }).sort((a, b) => a.depth - b.depth);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45 * G;
    const gd = h.r * 5;
    ctx.drawImage(this.glow, c.x - gd / 2, c.y - gd / 2, gd, gd);

    const w = h.r * 0.19;
    const drawSpike = (sp: (typeof spikes)[number]) => {
      const front = sp.depth > 0;
      const a = (front ? 1 : 0.35) * G;
      const g = ctx.createLinearGradient(sp.base.x, sp.base.y, sp.tip.x, sp.tip.y);
      g.addColorStop(0, "rgba(255,170,60,0.9)");
      g.addColorStop(0.6, "rgba(255,226,140,0.95)");
      g.addColorStop(1, "rgba(255,255,245,1)");
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sp.base.x - A.x * w, sp.base.y - A.y * w);
      ctx.lineTo(sp.tip.x, sp.tip.y);
      ctx.lineTo(sp.base.x + A.x * w, sp.base.y + A.y * w);
      ctx.closePath();
      ctx.fill();
      // gem at the tip
      const tw = 0.6 + 0.4 * Math.sin(this.t * 5 + sp.i * 1.9);
      ctx.globalAlpha = a * tw;
      const d = h.r * (front ? 1.3 : 0.7);
      ctx.drawImage(this.gem, sp.tip.x - d / 2, sp.tip.y - d / 2, d, d);
    };
    for (const sp of spikes) if (sp.depth <= 0) drawSpike(sp);
    // the band
    for (const [lw, col, al] of [
      [h.r * 0.22, "rgba(255,170,60,1)", 0.2],
      [h.r * 0.07, "rgba(255,220,130,1)", 0.85],
      [h.r * 0.025, "rgba(255,252,236,1)", 1],
    ] as [number, string, number][]) {
      ctx.globalAlpha = al * G;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, lw);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, ry, rot, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const sp of spikes) if (sp.depth > 0) drawSpike(sp);

    // beams straight up off the tips
    for (const b of this.beams) {
      const sp = spikes.find((x) => x.i === b.i % N);
      if (!sp) continue;
      const f = b.age / 0.6;
      const L = h.r * 3.4 * Math.min(1, f * 3);
      const g = ctx.createLinearGradient(sp.tip.x, sp.tip.y, sp.tip.x + h.up.x * L, sp.tip.y + h.up.y * L);
      g.addColorStop(0, "rgba(255,240,200,0.8)");
      g.addColorStop(1, "rgba(255,240,200,0)");
      ctx.globalAlpha = (1 - f) * G;
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, h.r * 0.06);
      ctx.beginPath();
      ctx.moveTo(sp.tip.x, sp.tip.y);
      ctx.lineTo(sp.tip.x + h.up.x * L, sp.tip.y + h.up.y * L);
      ctx.stroke();
    }
    for (const p of this.sparks) {
      const f = p.age / p.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * G;
      const d = p.size * (h.r / 26) * 6;
      ctx.drawImage(this.gem, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ ORBIT ═════════════════════════════════════
   Small moons circle the head on tilted orbits, each at its own speed,
   trailing light. When one swings behind the head it's hidden; behind
   but clear of the head, it dims. One moon at Level I, two at II,
   three with orbit lines and shed dust at the full effect. */

const MOONS = [
  { R: 2.0, w: 2.1, tilt: 0.28, col: "#9bdcff", glow: "rgba(130,200,255,0.6)", size: 0.3, ph: 0 },
  { R: 2.7, w: -1.5, tilt: -0.24, col: "#ffb36b", glow: "rgba(255,170,90,0.6)", size: 0.24, ph: 2.1 },
  { R: 3.4, w: 1.05, tilt: 0.12, col: "#c79bff", glow: "rgba(190,140,255,0.6)", size: 0.2, ph: 4.2 },
];

export class Orbit implements Effect {
  private t = 0;
  private grow = 0;
  private head: Head | null = null;
  private last: Emitter | null = null;
  private glows = MOONS.map((m) => softSprite(m.glow, 64));
  private dust: P[] = [];
  private mote = softSprite("rgba(230,230,255,1)", 16, 0.3);

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    if (e?.head) this.head = e.head;
    this.grow = ease(this.grow, intensity, dt, 1.8);
    const h = this.head;
    if (h && lvl(this.last) === 3 && this.grow > 0.5) {
      for (let i = 0; i < MOONS.length; i++) {
        if (Math.random() < dt * 14 && this.dust.length < 140) {
          const p = this.pos(h, i);
          this.dust.push({ x: p.x, y: p.y, vx: 0, vy: 0, age: 0, life: rand(0.5, 0.9), size: rand(0.5, 1), seed: i, k: 0 });
        }
      }
    }
    stepList(this.dust, dt, this.last?.worldVel ?? ZERO, 2, 0, h?.r ?? 20);
  }

  /** where moon i is, and whether it's in front of the head */
  private pos(h: Head, i: number, back = 0): Vec & { depth: number } {
    const m = MOONS[i];
    const th = m.ph + m.w * (this.t - back);
    const R = m.R * h.r * (0.5 + 0.5 * this.grow);
    const lx = Math.cos(th) * R;
    const ly = Math.sin(th) * R * 0.3;
    const rot = axisOf(h) + m.tilt;
    const c = { x: h.c.x + h.up.x * h.r * 0.15, y: h.c.y + h.up.y * h.r * 0.15 };
    return {
      x: c.x + lx * Math.cos(rot) - ly * Math.sin(rot),
      y: c.y + lx * Math.sin(rot) + ly * Math.cos(rot),
      depth: Math.sin(th) * Math.sign(m.w),
    };
  }

  ignite() {
    this.grow = Math.max(this.grow, 0.05);
  }

  clear() {
    this.grow = 0;
    this.dust.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const h = this.head;
    if (!h || this.grow < 0.01) return;
    const lv = lvl(this.last);
    const n = lv;
    const G = this.grow;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const hidden = (p: Vec & { depth: number }) => p.depth < 0 && Math.hypot(p.x - h.c.x, p.y - h.c.y) < h.r * 1.05;

    for (let i = 0; i < n; i++) {
      const m = MOONS[i];
      if (lv === 3) {
        // the orbit itself, faint
        const rot = axisOf(h) + m.tilt;
        ctx.globalAlpha = 0.09 * G;
        ctx.strokeStyle = m.col;
        ctx.lineWidth = Math.max(1, h.r * 0.02);
        ctx.beginPath();
        ctx.ellipse(h.c.x + h.up.x * h.r * 0.15, h.c.y + h.up.y * h.r * 0.15, m.R * h.r * (0.5 + 0.5 * G), m.R * h.r * 0.3 * (0.5 + 0.5 * G), rot, 0, Math.PI * 2);
        ctx.stroke();
      }
      // trail: the last stretch of the orbit, fading
      const steps = 14;
      for (let k = 1; k <= steps; k++) {
        const a = this.pos(h, i, ((k - 1) / steps) * (0.55 / Math.abs(m.w)) * 2);
        const b = this.pos(h, i, (k / steps) * (0.55 / Math.abs(m.w)) * 2);
        if (hidden(a) || hidden(b)) continue;
        ctx.globalAlpha = (1 - k / steps) * 0.55 * G * (a.depth < 0 ? 0.45 : 1);
        ctx.strokeStyle = m.col;
        ctx.lineWidth = Math.max(1, h.r * m.size * 0.6 * (1 - k / steps));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const p = this.pos(h, i);
      if (hidden(p)) continue;
      const dim = p.depth < 0 ? 0.5 : 1;
      const r = h.r * m.size * (0.85 + 0.15 * (p.depth + 1));
      ctx.globalAlpha = 0.8 * G * dim;
      const d = r * 6;
      ctx.drawImage(this.glows[i], p.x - d / 2, p.y - d / 2, d, d);
      ctx.globalCompositeOperation = "source-over";
      const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.45, m.col);
      g.addColorStop(1, "rgba(20,16,40,1)");
      ctx.globalAlpha = G * dim;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
    }
    for (const q of this.dust) {
      const f = q.age / q.life;
      ctx.globalAlpha = (1 - f) * 0.7 * G;
      const d = q.size * (h.r / 26) * 3;
      ctx.drawImage(this.mote, q.x - d / 2, q.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ STORM CLOUD ═══════════════════════════════
   A small storm cloud rides above the head. The cloud is drawn as fog
   through the shader, dark and lumpy, lit from inside when it
   flickers. Rain falls from it and slants with the air. Drizzle at
   Level I, rain and flicker at II, and at the full effect it throws
   lightning down past you. */

const PUFFS: [number, number, number][] = [
  [-1.5, 0.25, 0.85],
  [-0.7, -0.25, 1.1],
  [0.2, -0.5, 1.25],
  [1.1, -0.15, 1.05],
  [1.85, 0.25, 0.8],
  [-0.3, 0.35, 1.0],
  [0.8, 0.38, 0.95],
];

export class Cloud implements Effect {
  private t = 0;
  private grow = 0;
  private head: Head | null = null;
  private last: Emitter | null = null;
  private rain: P[] = [];
  private flicker = 0;
  private flickAt = 1;
  private bolt: { pts: Vec[]; age: number } | null = null;
  private boltAt = 2;
  private blob = softSprite("rgba(255,255,255,1)", 64);
  private puff = softSprite("rgba(48,52,62,0.9)", 64);
  private glow = softSprite("rgba(170,200,255,0.8)", 128);

  private center(h: Head): Vec {
    const lift = h.r * 3.6;
    return { x: h.c.x + h.up.x * lift, y: h.c.y + h.up.y * lift };
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    if (e?.head) this.head = e.head;
    this.grow = ease(this.grow, intensity, dt, 1.4);
    const h = this.head;
    const lv = lvl(this.last);
    const air = this.last?.worldVel ?? ZERO;
    if (h && this.grow > 0.3) {
      const c = this.center(h);
      const rate = (lv === 1 ? 18 : lv === 2 ? 60 : 110) * this.grow;
      let n = rate * dt;
      while (n > 0 && this.rain.length < 260) {
        if (Math.random() < n) {
          this.rain.push({
            x: c.x + rand(-1.6, 1.9) * h.r, y: c.y + h.r * 0.45,
            vx: air.x * 0.35, vy: h.r * rand(12, 16),
            age: 0, life: 0.5, size: 1, seed: 0, k: 0, fy: h.c.y + h.r * 4.5,
          });
        }
        n -= 1;
      }
      if (lv > 1) {
        this.flickAt -= dt;
        if (this.flickAt <= 0) {
          this.flickAt = rand(0.8, 2.2);
          this.flicker = 1;
        }
      }
      if (lv === 3) {
        this.boltAt -= dt;
        if (this.boltAt <= 0) {
          this.boltAt = rand(1.6, 3);
          const from = { x: rand(-0.8, 1.2) * h.r, y: h.r * 0.4 };
          const to = { x: from.x + rand(-2.5, 2.5) * h.r, y: h.r * rand(4.5, 6) };
          this.bolt = { pts: channel(from, to, 0.35, 5), age: 0 };
          this.flicker = 1;
        }
      }
    }
    for (let i = this.rain.length - 1; i >= 0; i--) {
      const r = this.rain[i];
      r.age += dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (r.age > r.life || (r.fy !== undefined && r.y > r.fy)) this.rain.splice(i, 1);
    }
    this.flicker *= Math.exp(-7 * dt);
    if (this.bolt) {
      this.bolt.age += dt;
      if (this.bolt.age > 0.3) this.bolt = null;
    }
  }

  ignite() {
    this.grow = Math.max(this.grow, 0.05);
    this.flicker = 1;
  }

  clear() {
    this.grow = 0;
    this.rain.length = 0;
    this.bolt = null;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const h = this.head;
    if (!h || this.grow < 0.01) return;
    const G = this.grow;
    const c = this.center(h);
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const sc = h.r * 1.35 * (0.4 + 0.6 * G);
    ctx.save();

    // rain first, behind the cloud
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(170,200,235,1)";
    ctx.lineWidth = Math.max(1, h.r * 0.025);
    ctx.lineCap = "round";
    for (const r of this.rain) {
      ctx.globalAlpha = 0.45 * G;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - r.vx * 0.03, r.y - r.vy * 0.03);
      ctx.stroke();
    }

    const gl = GLField.get();
    if (gl) {
      const m = gl.begin(W, H);
      for (let i = 0; i < PUFFS.length; i++) {
        const [px, py, pr] = PUFFS[i];
        const wob = 1 + 0.05 * Math.sin(this.t * 1.3 + i * 2);
        const r = sc * pr * wob;
        m.globalAlpha = 0.85;
        m.drawImage(this.blob, c.x + px * sc - r, c.y + py * sc - r, r * 2, r * 2);
      }
      const fog = gl.renderFog({
        t: this.t,
        flow: { x: 0.15, y: -0.05 },
        size: sc * 1.4,
        colors: ["#4a505e", "#7c8494", "#b4bccb"],
        alpha: 1,
        detail: 2.6,
      });
      // moonlight behind it, so the cloud's edge reads against the night
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.18 * G;
      const md = sc * 6;
      ctx.drawImage(this.glow, c.x - md / 2, c.y - md / 2, md, md);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.95 * G;
      ctx.drawImage(fog, 0, 0, W, H);
    } else {
      ctx.globalCompositeOperation = "source-over";
      for (const [px, py, pr] of PUFFS) {
        const r = sc * pr * 1.3;
        ctx.globalAlpha = 0.9 * G;
        ctx.drawImage(this.puff, c.x + px * sc - r, c.y + py * sc - r, r * 2, r * 2);
      }
    }

    // lit from inside
    ctx.globalCompositeOperation = "lighter";
    if (this.flicker > 0.02) {
      ctx.globalAlpha = this.flicker * 0.55 * G;
      const d = sc * 5;
      ctx.drawImage(this.glow, c.x + sc * 0.3 - d / 2, c.y - d / 2, d, d);
    }
    if (this.bolt) {
      const a = Math.max(0, 1 - this.bolt.age / 0.3) * G;
      strokeBolt(ctx, this.bolt.pts, c.x, c.y, h.r * 0.05, a, BOLT_STYLES.storm);
    }
    ctx.restore();
  }
}
