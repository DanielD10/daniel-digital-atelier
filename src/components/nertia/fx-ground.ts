/**
 * Footwear effects that land on the road: Lightning Steps, Ripple
 * Step, Bloom Step and Neon Grid. Each one reacts to `strikes` (the
 * touchdowns the runner or the camera reports) and leaves marks that
 * stay put in the world, so a runner leaves a line of them behind.
 */

import {
  BOLT_STYLES,
  channel,
  lvl,
  rand,
  softSprite,
  stepList,
  strokeBolt,
  type BoltStyle,
  type Effect,
  type Emitter,
  type P,
  type Vec,
} from "./fxkit";

const ZERO: Vec = { x: 0, y: 0 };

/* ═══════════════════════ LIGHTNING STEPS ═══════════════════════════
   Every footstrike draws lightning. Arcs crack outward along the road
   from the shoe, a scorch mark glows where it landed and cools, and at
   Level II and up a bolt comes down out of the sky onto the foot —
   every other step at II, most steps at the full effect. Between
   steps, static crawls over the shoes. */

type SkyBolt = { x: number; y: number; pts: Vec[]; branches: Vec[][]; age: number; restrike: number; done: boolean; w: number; lit: number };
type GroundArc = { x: number; y: number; end: Vec; pts: Vec[]; age: number; life: number };
type Scorch = { x: number; y: number; s: number; age: number; life: number };

export class Thunder implements Effect {
  private t = 0;
  private st: BoltStyle;
  private last: Emitter | null = null;
  private intensity = 0;
  private sky: SkyBolt[] = [];
  private arcs: GroundArc[] = [];
  private scorches: Scorch[] = [];
  private sparks: P[] = [];
  private crackle: { pts: Vec[]; age: number; life: number }[] = [];
  private crackleAt = 0;
  private flash = 0;
  private glow: HTMLCanvasElement;
  private dot: HTMLCanvasElement;
  private steps = 0;

  constructor(variant?: string) {
    this.st = BOLT_STYLES[variant ?? "storm"] ?? BOLT_STYLES.storm;
    this.glow = softSprite(this.st.glow, 128);
    this.dot = softSprite(this.st.spark, 16, 0.3);
  }

  private land(at: Vec, e: Emitter) {
    const s = e.scale;
    const lv = lvl(e);
    const power = e.power ?? 1;
    this.steps++;
    this.scorches.push({ x: at.x, y: at.y, s, age: 0, life: 1.2 + 0.8 * power });
    if (this.scorches.length > 14) this.scorches.shift();

    // arcs crack outward along the road plane
    const n = lv === 1 ? 3 : lv === 2 ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const L = s * rand(0.5, 1.3) * (0.7 + 0.4 * power);
      const end = { x: dir * L, y: rand(-0.12, 0.16) * L };
      this.arcs.push({ x: at.x, y: at.y, end, pts: channel(ZERO, end, 0.36, 4), age: 0, life: rand(0.16, 0.3) });
    }

    // the sky bolt
    const strikeSky = lv === 3 ? Math.random() < 0.75 : lv === 2 ? this.steps % 2 === 0 : false;
    if (strikeSky) {
      const top = { x: rand(-0.9, 0.9) * s, y: -s * rand(5.5, 7.5) };
      const pts = channel(top, ZERO, 0.28, 6);
      const branches: Vec[][] = [];
      const nb = lv === 3 ? 4 : 2;
      for (let i = 0; i < nb; i++) {
        const j = Math.floor(rand(0.1, 0.7) * pts.length);
        const from = pts[j];
        const to = { x: from.x + rand(-1.4, 1.4) * s, y: from.y + rand(0.6, 1.6) * s };
        branches.push(channel(from, to, 0.4, 4));
      }
      this.sky.push({ x: at.x, y: at.y, pts, branches, age: 0, restrike: rand(0.06, 0.1), done: false, w: s * rand(0.035, 0.05), lit: 2 });
      this.flash = Math.max(this.flash, lv === 3 ? 1 : 0.6);
    }

    const ns = Math.round((10 + 10 * power) * (lv === 1 ? 0.5 : 1));
    for (let i = 0; i < ns && this.sparks.length < 360; i++) {
      const a = -Math.PI / 2 + rand(-1.3, 1.3);
      const sp = rand(1.2, 3.6) * s;
      this.sparks.push({
        x: at.x, y: at.y - s * 0.02,
        vx: Math.cos(a) * sp + e.worldVel.x * 0.3, vy: Math.sin(a) * sp,
        age: 0, life: rand(0.25, 0.55), size: rand(0.7, 1.5), seed: 0, k: 0,
      });
    }
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const air = this.last?.worldVel ?? ZERO;
    const s = this.last?.scale ?? 100;

    if (e?.strikes && intensity > 0.3) for (const at of e.strikes) this.land(at, e);

    // static crawling over the shoes between steps
    if (e && intensity > 0.2 && e.path.length) {
      this.crackleAt -= dt * (lvl(e) === 1 ? 8 : lvl(e) === 2 ? 18 : 28);
      while (this.crackleAt <= 0) {
        this.crackleAt += 1;
        const f = e.path[Math.floor(Math.random() * e.path.length)];
        const a = { x: f.x + rand(-0.14, 0.14) * s, y: f.y + rand(-0.12, 0.02) * s };
        const b = { x: a.x + rand(-0.2, 0.2) * s, y: a.y + rand(-0.12, 0.08) * s };
        this.crackle.push({ pts: channel(a, b, 0.5, 3), age: 0, life: rand(0.05, 0.11) });
      }
    }

    for (let i = this.sky.length - 1; i >= 0; i--) {
      const b = this.sky[i];
      b.age += dt;
      b.x += air.x * dt;
      if (!b.done && b.age >= b.restrike) {
        // restrike down the same channel, slightly moved
        b.done = true;
        b.lit = 2;
        b.pts = b.pts.map((p, k) => (k === 0 || k === b.pts.length - 1 ? p : { x: p.x + rand(-0.06, 0.06) * s, y: p.y }));
        this.flash = Math.max(this.flash, 0.5);
      }
      if (b.age > 0.42) this.sky.splice(i, 1);
    }
    for (const list of [this.arcs, this.crackle]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].age += dt;
        if (list[i].age > list[i].life) list.splice(i, 1);
      }
    }
    for (const a of this.arcs) a.x += air.x * dt;
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const c = this.scorches[i];
      c.age += dt;
      c.x += air.x * dt;
      c.y += air.y * dt;
      if (c.age > c.life) this.scorches.splice(i, 1);
    }
    stepList(this.sparks, dt, air, 2.4, 6.5, s);
    this.flash *= Math.exp(-10 * dt);
  }

  ignite(e: Emitter) {
    for (const f of e.path) this.land(f, e);
  }

  clear() {
    this.sky.length = 0;
    this.arcs.length = 0;
    this.scorches.length = 0;
    this.sparks.length = 0;
    this.crackle.length = 0;
    this.flash = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e) return;
    const s = e.scale;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const I = this.intensity;
    const lv = lvl(e);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // scorch marks: charred under, glowing on top while hot
    for (const c of this.scorches) {
      const f = c.age / c.life;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = (1 - f) * 0.5;
      ctx.fillStyle = "rgba(6,6,10,1)";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.s * 0.36, c.s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      const heat = Math.pow(1 - f, 2.4);
      if (heat > 0.02) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = heat * I;
        const d = c.s * 1.9;
        ctx.drawImage(this.glow, c.x - d / 2, c.y - d * 0.14, d, d * 0.28);
      }
    }

    ctx.globalCompositeOperation = "lighter";
    // the whole scene lights up on a sky strike
    if (this.flash > 0.02 && lv === 3) {
      ctx.globalAlpha = this.flash * 0.12 * I;
      ctx.fillStyle = this.st.flash;
      ctx.fillRect(0, 0, W, H);
    }

    // charged shoes
    for (const f of e.path) {
      ctx.globalAlpha = (0.4 + 0.2 * Math.random()) * I;
      const d = s * 1.1;
      ctx.drawImage(this.glow, f.x - d / 2, f.y - d / 2, d, d);
    }
    for (const c of this.crackle) {
      strokeBolt(ctx, c.pts, 0, 0, s * 0.012, (1 - c.age / c.life) * I, this.st);
    }
    for (const a of this.arcs) {
      const f = a.age / a.life;
      strokeBolt(ctx, a.pts, a.x, a.y, s * 0.018, (1 - f) * I, this.st);
    }
    for (const b of this.sky) {
      let on = Math.max(0, 1 - b.age / 0.09);
      if (b.done) on = Math.max(on, Math.max(0, 1 - (b.age - b.restrike) / 0.09));
      if (b.lit > 0) {
        on = 1;
        b.lit--;
      }
      const a = Math.max(on, (1 - b.age / 0.42) * 0.35) * I;
      if (a < 0.02) continue;
      ctx.globalAlpha = a * 0.25;
      const hd = b.w * 16;
      for (let i = 0; i < b.pts.length; i += 5) {
        const q = b.pts[i];
        ctx.drawImage(this.glow, b.x + q.x - hd / 2, b.y + q.y - hd / 2, hd, hd);
      }
      strokeBolt(ctx, b.pts, b.x, b.y, b.w, a, this.st);
      for (const br of b.branches) strokeBolt(ctx, br, b.x, b.y, b.w * 0.5, a * 0.75, this.st);
      // impact flare at the foot
      ctx.globalAlpha = a;
      const d = s * 1.4;
      ctx.drawImage(this.glow, b.x - d / 2, b.y - d / 2, d, d);
    }
    for (const p of this.sparks) {
      const f = p.age / p.life;
      ctx.globalAlpha = (1 - f) * I;
      ctx.strokeStyle = this.st.spark;
      ctx.lineWidth = Math.max(0.8, p.size * (s / 140));
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
      ctx.stroke();
      const d = p.size * (s / 110) * 4;
      ctx.drawImage(this.dot, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ RIPPLE STEP ═══════════════════════════════
   The road turns to shallow water. Each touchdown rings out in
   concentric ripples flat on the ground, throws droplets that arc and
   fall, and at the full effect a thin crown of water jumps up off the
   shoe. Rings stay where they were made. */

type Ring = { x: number; y: number; s: number; age: number; n: number };

export class Ripple implements Effect {
  private last: Emitter | null = null;
  private intensity = 0;
  private rings: Ring[] = [];
  private drops: P[] = [];
  private crowns: P[] = [];
  private drop = softSprite("rgba(225,246,255,1)", 16, 0.35);
  private sheen = softSprite("rgba(120,200,255,0.5)", 64);
  private t = 0;

  private land(at: Vec, e: Emitter) {
    const s = e.scale;
    const lv = lvl(e);
    this.rings.push({ x: at.x, y: at.y, s: s * (0.8 + 0.3 * (e.power ?? 1)), age: 0, n: lv });
    if (this.rings.length > 18) this.rings.shift();
    if (lv > 1) {
      const n = lv === 3 ? 16 : 9;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2);
        const sp = rand(1, 2.6) * s;
        this.drops.push({
          x: at.x + rand(-0.08, 0.08) * s, y: at.y,
          vx: Math.cos(a) * sp + e.worldVel.x * 0.3, vy: Math.sin(a) * sp,
          age: 0, life: rand(0.35, 0.6), size: rand(0.7, 1.4), seed: at.y, k: 0, fy: at.y,
        });
      }
    }
    if (lv === 3) {
      // the crown: thin sheets of water jumping straight up
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i / 8 - 0.5) * 1.6;
        this.crowns.push({
          x: at.x + Math.cos(a) * s * 0.12, y: at.y,
          vx: Math.cos(a) * s * 1.1, vy: Math.sin(a) * s * 2.4,
          age: 0, life: 0.28, size: 1, seed: 0, k: 0,
        });
      }
    }
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const air = this.last?.worldVel ?? ZERO;
    const s = this.last?.scale ?? 100;
    if (e?.strikes && intensity > 0.3) for (const at of e.strikes) this.land(at, e);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      r.x += air.x * dt;
      r.y += air.y * dt;
      if (r.age > 1.3) this.rings.splice(i, 1);
    }
    stepList(this.drops, dt, air, 0.8, 7, s);
    stepList(this.crowns, dt, air, 1.5, 6, s);
    // droplets that hit the water leave a tiny ring
    for (const d of this.drops) {
      if (d.fy !== undefined && d.vy > 0 && d.y > d.fy) {
        d.age = d.life;
        if (this.rings.length < 30) this.rings.push({ x: d.x, y: d.fy, s: s * 0.18, age: 0.3, n: 1 });
      }
    }
  }

  ignite(e: Emitter) {
    for (const f of e.path) this.land(f, e);
  }

  clear() {
    this.rings.length = 0;
    this.drops.length = 0;
    this.crowns.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e) return;
    const s = e.scale;
    const I = this.intensity;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // wet road: a sheen under each shoe at the full effect
    if (lvl(e) === 3) {
      for (const f of e.path) {
        ctx.globalAlpha = 0.35 * I;
        const d = s * 1.6;
        ctx.drawImage(this.sheen, f.x - d / 2, f.y - d * 0.08, d, d * 0.16);
      }
    }

    for (const r of this.rings) {
      for (let k = 0; k < Math.min(3, r.n); k++) {
        const f = (r.age - k * 0.16) / 1.1;
        if (f <= 0 || f >= 1) continue;
        const ease = 1 - Math.pow(1 - f, 2.2);
        const rx = r.s * (0.12 + ease * 1.3);
        ctx.globalAlpha = (1 - f) * (k ? 0.5 : 0.85) * I;
        ctx.strokeStyle = k % 2 ? "#6fc8ff" : "#d8f5ff";
        ctx.lineWidth = Math.max(1, r.s * 0.018 * (1 - f * 0.5));
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rx, rx * 0.17, 0, 0, Math.PI * 2);
        ctx.stroke();
        // the light catches the near edge of each ring
        ctx.globalAlpha *= 0.6;
        ctx.lineWidth *= 2.2;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rx, rx * 0.17, 0, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
      }
    }

    ctx.lineCap = "round";
    for (const c of this.crowns) {
      const f = c.age / c.life;
      ctx.globalAlpha = (1 - f) * 0.7 * I;
      ctx.strokeStyle = "#e6f8ff";
      ctx.lineWidth = Math.max(1, s * 0.012);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x - c.vx * 0.05, c.y - c.vy * 0.05);
      ctx.stroke();
    }
    for (const d of this.drops) {
      const f = d.age / d.life;
      ctx.globalAlpha = (1 - f * 0.5) * I;
      ctx.strokeStyle = "rgba(200,236,255,0.8)";
      ctx.lineWidth = Math.max(0.8, d.size * (s / 160));
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx * 0.02, d.y - d.vy * 0.02);
      ctx.stroke();
      const r = d.size * (s / 110) * 3;
      ctx.drawImage(this.drop, d.x - r / 2, d.y - r / 2, r, r);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ BLOOM STEP ════════════════════════════════
   Flowers grow where you step. Stems push up, heads open past full
   and settle, then the flower droops and fades as the road carries it
   away behind you. Grass comes up with them at Level II, and pollen
   drifts off at the full effect. Flower heads are pre-rendered per
   color, so a road full of them costs a drawImage each. */

type Flower = {
  x: number;
  y: number;
  s: number;
  age: number;
  life: number;
  h: number;
  lean: number;
  k: number;
  spin: number;
  grass: boolean;
};

const BLOOMS = ["#ff8fb8", "#fff2f6", "#ffd23f", "#b48cff", "#ff6b6b", "#8fd8ff"];

export class Bloom implements Effect {
  private last: Emitter | null = null;
  private intensity = 0;
  private flowers: Flower[] = [];
  private pollen: P[] = [];
  private heads: HTMLCanvasElement[];
  private mote = softSprite("rgba(255,240,170,1)", 16, 0.3);

  constructor() {
    this.heads = BLOOMS.map((c, i) => Bloom.head(c, i % 2 ? 5 : 6));
  }

  /** a flower head seen from above: petals with a light center vein */
  private static head(color: string, petals: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const g = c.getContext("2d")!;
    g.translate(48, 48);
    for (let i = 0; i < petals; i++) {
      g.save();
      g.rotate((i / petals) * Math.PI * 2);
      const grad = g.createLinearGradient(0, 0, 0, -44);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.25, color);
      grad.addColorStop(1, color);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(-20, -14, -16, -40, 0, -44);
      g.bezierCurveTo(16, -40, 20, -14, 0, 0);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, -4);
      g.lineTo(0, -34);
      g.stroke();
      g.restore();
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 12);
    core.addColorStop(0, "#fff6c8");
    core.addColorStop(0.6, "#ffc23a");
    core.addColorStop(1, "rgba(200,120,20,0.9)");
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  private land(at: Vec, e: Emitter) {
    const s = e.scale;
    const lv = lvl(e);
    const n = lv === 1 ? 1 : lv === 2 ? 3 : 5;
    for (let i = 0; i < n; i++) {
      this.flowers.push({
        x: at.x + rand(-0.4, 0.4) * s,
        y: at.y + rand(-0.03, 0.05) * s,
        s,
        age: -i * 0.05,
        life: rand(1.6, 2.3),
        h: s * rand(0.22, 0.46) * (0.8 + 0.3 * (e.power ?? 1)),
        lean: rand(-0.35, 0.35),
        k: Math.floor(Math.random() * BLOOMS.length),
        spin: Math.random() * Math.PI,
        grass: lv > 1,
      });
    }
    if (this.flowers.length > 40) this.flowers.splice(0, this.flowers.length - 40);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.intensity = intensity;
    if (e) this.last = e;
    const air = this.last?.worldVel ?? ZERO;
    const s = this.last?.scale ?? 100;
    if (e?.strikes && intensity > 0.3) for (const at of e.strikes) this.land(at, e);
    for (let i = this.flowers.length - 1; i >= 0; i--) {
      const f = this.flowers[i];
      f.age += dt;
      f.x += air.x * dt;
      f.y += air.y * dt;
      if (f.age > f.life) {
        this.flowers.splice(i, 1);
        continue;
      }
      // pollen off open flowers at the full effect
      if (lvl(this.last) === 3 && f.age > 0.4 && Math.random() < dt * 3 && this.pollen.length < 120) {
        this.pollen.push({
          x: f.x, y: f.y - f.h, vx: air.x * 0.6 + rand(-0.2, 0.2) * s, vy: -rand(0.2, 0.5) * s,
          age: 0, life: rand(0.8, 1.4), size: rand(0.6, 1.2), seed: Math.random() * 10, k: 0,
        });
      }
    }
    stepList(this.pollen, dt, air, 1.2, -0.1, s);
  }

  ignite(e: Emitter) {
    for (const f of e.path) this.land(f, e);
  }

  clear() {
    this.flowers.length = 0;
    this.pollen.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const I = this.intensity;
    if (I < 0.01 && !this.flowers.length) return;
    ctx.save();
    ctx.lineCap = "round";
    // back to front, so nearer flowers overlap
    const order = [...this.flowers].sort((a, b) => a.y - b.y);
    for (const f of order) {
      if (f.age < 0) continue;
      const grow = Math.min(1, f.age / 0.22);
      const open = f.age < 0.15 ? 0 : Math.min(1.12, ((f.age - 0.15) / 0.3) * 1.12);
      const settle = open > 1 ? 1 + (1.12 - open) : open; // overshoot, then settle
      const wilt = Math.max(0, (f.age - (f.life - 0.6)) / 0.6);
      const alpha = (1 - wilt) * Math.min(1, I + 0.3);
      const tipX = f.x + Math.sin(f.lean + wilt * 0.9) * f.h * grow;
      const tipY = f.y - Math.cos(f.lean + wilt * 0.9) * f.h * grow;
      ctx.globalAlpha = alpha;
      if (f.grass) {
        ctx.strokeStyle = "#3fae6a";
        ctx.lineWidth = Math.max(1, f.s * 0.01);
        for (let g = -2; g <= 2; g++) {
          ctx.beginPath();
          ctx.moveTo(f.x + g * f.s * 0.03, f.y);
          ctx.quadraticCurveTo(f.x + g * f.s * 0.04, f.y - f.s * 0.06 * grow, f.x + g * f.s * 0.07, f.y - f.s * 0.11 * grow);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = "#2f8f52";
      ctx.lineWidth = Math.max(1, f.s * 0.014);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.quadraticCurveTo(f.x + Math.sin(f.lean) * f.h * 0.2, f.y - f.h * 0.6 * grow, tipX, tipY);
      ctx.stroke();
      // a leaf halfway up
      if (grow > 0.6) {
        ctx.fillStyle = "#45b56f";
        ctx.beginPath();
        const lx = f.x + Math.sin(f.lean) * f.h * 0.25;
        const ly = f.y - f.h * 0.45 * grow;
        ctx.ellipse(lx + f.s * 0.03, ly, f.s * 0.04, f.s * 0.014, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (settle > 0.02) {
        const d = f.s * 0.5 * settle * (1 - wilt * 0.3);
        ctx.setTransform(1, 0, 0, 1, tipX, tipY);
        ctx.rotate(f.spin + wilt * 0.6);
        ctx.scale(1, 0.62 + 0.3 * wilt); // seen from the side, tipping as it wilts
        ctx.drawImage(this.heads[f.k], -d / 2, -d / 2, d, d);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
    ctx.globalCompositeOperation = "lighter";
    const s0 = this.last?.scale ?? 100;
    for (const p of this.pollen) {
      const f = p.age / p.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.8 * I;
      const d = p.size * (s0 / 110) * 3.5;
      ctx.drawImage(this.mote, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ NEON GRID ═════════════════════════════════
   The road is a lit floor. Tiles sit on a grid fixed to the world, so
   they slide back with the road. A touchdown lights the tile under the
   shoe and the light spreads to its neighbours a beat later, in a new
   color every step. At the full effect a neon line runs along the
   ground under you. */

type Tile = { gx: number; row: number; age: number; delay: number; c: string; y0: number };

const NEON = ["#ff3fd8", "#3ff6ff", "#8a5cff", "#3fff9a", "#ffd23f"];

export class Grid implements Effect {
  private last: Emitter | null = null;
  private intensity = 0;
  private tiles: Tile[] = [];
  /** how far the world has slid, in px */
  private scroll = 0;
  private hue = 0;
  private glow = softSprite("rgba(255,255,255,0.8)", 64);

  private land(at: Vec, e: Emitter) {
    const T = e.scale * 0.34;
    const lv = lvl(e);
    const c = NEON[this.hue++ % NEON.length];
    const gx = Math.round((at.x - this.scroll) / T);
    const reach = lv === 1 ? 0 : lv === 2 ? 1 : 2;
    for (let dx = -reach - 1; dx <= reach + 1; dx++) {
      for (let row = -1; row <= 1; row++) {
        const d = Math.abs(dx) + Math.abs(row);
        if (d > reach + 1) continue;
        this.tiles.push({ gx: gx + dx, row, age: 0, delay: d * 0.06, c, y0: at.y });
      }
    }
    if (this.tiles.length > 160) this.tiles.splice(0, this.tiles.length - 160);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.intensity = intensity;
    if (e) this.last = e;
    const air = this.last?.worldVel ?? ZERO;
    this.scroll += air.x * dt;
    if (e?.strikes && intensity > 0.3) for (const at of e.strikes) this.land(at, e);
    for (let i = this.tiles.length - 1; i >= 0; i--) {
      this.tiles[i].age += dt;
      if (this.tiles[i].age > 0.9 + this.tiles[i].delay) this.tiles.splice(i, 1);
    }
  }

  ignite(e: Emitter) {
    for (const f of e.path) this.land(f, e);
  }

  clear() {
    this.tiles.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e) return;
    const s = e.scale;
    const T = s * 0.34;
    const D = T * 0.2; // row depth on screen
    const skew = T * 0.35; // rows further back shift right: a little perspective
    const I = this.intensity;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";

    if (lvl(e) === 3 && e.path.length) {
      const y = Math.max(...e.path.map((p) => p.y)) + s * 0.02;
      const x = e.path.reduce((a, p) => a + p.x, 0) / e.path.length;
      const g = ctx.createLinearGradient(x - s * 4, 0, x + s * 4, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, NEON[(this.hue + 4) % NEON.length]);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.55 * I;
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, s * 0.012);
      ctx.beginPath();
      ctx.moveTo(x - s * 4, y);
      ctx.lineTo(x + s * 4, y);
      ctx.stroke();
    }

    for (const t of this.tiles) {
      const a0 = t.age - t.delay;
      if (a0 < 0) continue;
      const f = a0 / 0.9;
      const a = Math.pow(1 - f, 1.6) * I;
      const x = t.gx * T + this.scroll + t.row * skew - T / 2;
      const y = t.y0 + t.row * D - D / 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + T, y);
      ctx.lineTo(x + T + skew, y + D);
      ctx.lineTo(x + skew, y + D);
      ctx.closePath();
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = t.c;
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.strokeStyle = t.c;
      ctx.lineWidth = Math.max(1, s * 0.008);
      ctx.stroke();
      if (f < 0.25) {
        ctx.globalAlpha = (1 - f / 0.25) * 0.6 * I;
        const d = T * 1.4;
        ctx.drawImage(this.glow, x + T / 2 + skew / 2 - d / 2, y + D / 2 - d * 0.15, d, d * 0.3);
      }
    }
    ctx.restore();
  }
}

