/**
 * Effects that come off the body and the garment: the body glows and
 * auras, Silk Ribbons and Rainbow Trail, Comets, Aurora, Gold and
 * Diamond Dust, Snowfall, Finish Line confetti, Butterflies,
 * Slipstream and Glitch.
 */

import { FIRE_PALETTES, GLField, type FirePalette } from "./glfield";
import {
  System,
  capsulePath,
  centroid,
  glintSprite,
  hexRgb,
  lvl,
  pathLength,
  rampAt,
  rand,
  rgba,
  samplePath,
  scratch,
  softSprite,
  stepList,
  type Effect,
  type Emitter,
  type P,
  type Vec,
} from "./fxkit";

const ZERO: Vec = { x: 0, y: 0 };

function ease(cur: number, intensity: number, dt: number, rate = 2) {
  const target = intensity > 0.3 ? 1 : 0;
  return cur + (target - cur) * (1 - Math.exp(-(target ? rate : 7) * dt));
}

/** a point on the surface of one of the body's capsules, and its outward normal */
function onBody(body: [Vec, Vec, number][]): { p: Vec; n: Vec } {
  const [a, b, r] = body[Math.floor(Math.random() * body.length)];
  const t = Math.random();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  let n: Vec;
  if (L < 1e-3) {
    const ang = Math.random() * Math.PI * 2;
    n = { x: Math.cos(ang), y: Math.sin(ang) };
  } else {
    const side = Math.random() < 0.5 ? -1 : 1;
    n = { x: (-dy / L) * side, y: (dx / L) * side };
  }
  return { p: { x: a.x + dx * t + n.x * r, y: a.y + dy * t + n.y * r }, n };
}

function bounds(pts: Vec[], pad: number) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/* ═══════════════════════ BODY GLOWS AND AURAS ══════════════════════
   The whole body, drawn as capsules into a small offscreen canvas,
   tinted, and laid back over the scene at several sizes: blurring by
   scaling down and back up costs almost nothing and reads as soft
   light. Four kinds:
     glow   — a breathing halo in one color
     prism  — the same halo, cycling through the spectrum
     pulse  — rings of the silhouette expanding out on a heartbeat
     flare  — flame licking up off the whole outline, through the fire
              shader, in spirit blue, solar gold, crimson or black
   Level I is a tight glow. Level II adds the wide bloom (and flames
   at full height for auras). The full effect lights the body from
   inside and throws motes off it. */

type AuraStyle = { kind: "glow" | "pulse" | "flare" | "prism"; color: string; fire?: FirePalette; dark?: boolean };

const AURAS: Record<string, AuraStyle> = {
  "glow-ice": { kind: "glow", color: "#7cc8ff" },
  "glow-rose": { kind: "glow", color: "#ff8fb4" },
  "glow-volt": { kind: "glow", color: "#b8ff3c" },
  "glow-amber": { kind: "glow", color: "#ffab3d" },
  "glow-violet": { kind: "glow", color: "#9a62ff" },
  pulse: { kind: "pulse", color: "#ff5a7a" },
  "flare-spirit": { kind: "flare", color: "#6fb8ff", fire: "spirit" },
  "flare-solar": { kind: "flare", color: "#ffb640", fire: "solar" },
  "flare-crimson": { kind: "flare", color: "#ff2a3a", fire: "crimson" },
  "flare-shadow": { kind: "flare", color: "#8a3cff", fire: "void", dark: true },
  prism: { kind: "prism", color: "#ffffff" },
};

export class Aura implements Effect {
  private t = 0;
  private grow = 0;
  private last: Emitter | null = null;
  private st: AuraStyle;
  private a: HTMLCanvasElement | null = null;
  private b: HTMLCanvasElement | null = null;
  private motes: P[] = [];
  private heat: P[] = [];
  private rings: number[] = [];
  private beat = 0;
  /** how hard it's driven: a bonus glow runs at half */
  private amp = 0;
  private flash = 0;
  private mote: HTMLCanvasElement;
  private blob = softSprite("rgba(255,255,255,1)", 64);

  constructor(variant?: string) {
    this.st = AURAS[variant ?? "glow-ice"] ?? AURAS["glow-ice"];
    this.mote = this.st.kind === "prism" ? glintSprite("rgba(255,255,255,1)", 32) : softSprite(rgba(this.st.color, 1), 16, 0.3);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    if (e) this.last = e;
    this.grow = ease(this.grow, intensity, dt, 1.6);
    this.amp = Math.min(1, intensity);
    const em = this.last;
    const body = em?.body;
    const lv = lvl(em);
    const s = em?.scale ?? 100;
    const air = em?.worldVel ?? ZERO;

    if (body?.length && this.grow > 0.2) {
      // motes off the body at the full effect (and off auras from II)
      const moteRate = lv === 3 ? 40 : this.st.kind === "flare" && lv === 2 ? 16 : 0;
      if (Math.random() < moteRate * dt * 2 && this.motes.length < 160) {
        const { p, n } = onBody(body);
        this.motes.push({
          x: p.x, y: p.y, vx: n.x * s * 0.3 + (em?.bodyVel.x ?? 0) * 0.5, vy: n.y * s * 0.2 - s * rand(0.4, 0.9),
          age: 0, life: rand(0.7, 1.3), size: rand(0.6, 1.3), seed: Math.random() * 10, k: Math.floor(Math.random() * 6),
        });
      }
      if (this.st.kind === "flare") {
        const rate = (lv === 1 ? 110 : lv === 2 ? 220 : 340) * this.grow;
        let n = rate * dt;
        while (n > 0 && this.heat.length < 420) {
          if (Math.random() < n) {
            const { p, n: nv } = onBody(body);
            this.heat.push({
              x: p.x, y: p.y, vx: nv.x * s * 0.15 + (em?.bodyVel.x ?? 0), vy: -s * rand(0.9, 1.7),
              age: 0, life: rand(0.18, 0.36) * (lv === 3 ? 1.3 : 1), size: s * rand(0.07, 0.12), seed: Math.random() * 10, k: 0,
            });
          }
          n -= 1;
        }
      }
      if (this.st.kind === "pulse") {
        // lub-dub, about 70 a minute; Level I only beats once
        const before = this.beat;
        this.beat = (this.beat + dt / 0.86) % 1;
        const hit = (at: number) => (before < at && this.beat >= at) || (before > this.beat && at < this.beat);
        if (hit(0.0001)) {
          this.rings.push(0);
          this.flash = 1;
        }
        if (lv > 1 && hit(0.22)) {
          this.rings.push(0);
          this.flash = 0.7;
        }
      }
    }
    stepList(this.motes, dt, air, 1.4, -0.15, s);
    // heat rises and leans back with the air
    for (let i = this.heat.length - 1; i >= 0; i--) {
      const p = this.heat[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.heat[i] = this.heat[this.heat.length - 1];
        this.heat.pop();
        continue;
      }
      // an aura hugs the body: the air only bends it back a little
      const f = 1 - Math.exp(-1.4 * dt);
      p.vx += (air.x - p.vx) * f;
      p.vy -= s * 2.6 * dt;
      p.vx += Math.sin(this.t * 8 + p.seed) * s * 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i] += dt / 0.95;
      if (this.rings[i] >= 1) this.rings.splice(i, 1);
    }
    this.flash *= Math.exp(-5 * dt);
  }

  ignite() {
    this.grow = Math.max(this.grow, 0.05);
    this.flash = 1;
  }

  clear() {
    this.grow = 0;
    this.motes.length = 0;
    this.heat.length = 0;
    this.rings.length = 0;
  }

  /** draws the body's capsules, fattened by `k` and `pad`, into a small canvas */
  private mask(c: HTMLCanvasElement | null, body: [Vec, Vec, number][], W: number, H: number, res: number, k: number, pad: number) {
    const out = scratch(c, W * res, H * res);
    const g = out.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, out.width, out.height);
    g.setTransform(res, 0, 0, res, 0, 0);
    g.fillStyle = "#fff";
    g.beginPath();
    for (const [a, b, r] of body) capsulePath(g, a, b, r * k + pad);
    g.fill();
    return out;
  }

  private tint(c: HTMLCanvasElement, fill: string | CanvasGradient) {
    const g = c.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = fill;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "source-over";
  }

  /** a moving spectrum across the body, for Prism */
  private spectrum(c: HTMLCanvasElement, res: number, box: { x: number; y: number; w: number; h: number }) {
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(box.x * res, (box.y + box.h) * res, (box.x + box.w) * res, box.y * res);
    for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, `hsl(${(i * 45 + this.t * 90) % 360}, 100%, 62%)`);
    return grad;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    const body = e?.body;
    if (!e || !body?.length || this.grow < 0.01) return;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const s = e.scale;
    const lv = lvl(e);
    const G = this.grow * this.amp;
    const st = this.st;
    const breath = 0.78 + 0.22 * Math.sin(this.t * 2.1);
    const pts = body.flatMap(([a, b]) => [a, b]);
    const box = bounds(pts, s * 0.6);
    const fill = (c: HTMLCanvasElement, res: number) => (st.kind === "prism" ? this.spectrum(c, res, box) : st.color);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";

    const soft = (c: HTMLCanvasElement, alpha: number, jitter: number) => {
      // four offset taps smooth out the upscale
      ctx.globalAlpha = alpha / 4;
      for (const [dx, dy] of [
        [-jitter, -jitter],
        [jitter, -jitter],
        [-jitter, jitter],
        [jitter, jitter],
      ]) {
        ctx.drawImage(c, dx, dy, W, H);
      }
    };

    // wide bloom, from Level II
    if (lv > 1 && st.kind !== "pulse") {
      this.b = this.mask(this.b, body, W, H, 0.08, 1.9, s * 0.08);
      this.tint(this.b, fill(this.b, 0.08));
      soft(this.b, (st.kind === "flare" ? 0.4 : 0.55) * G * breath, s * 0.06);
    }

    if (st.kind === "pulse") {
      // a heartbeat flash on the body, then rings of the outline
      const res = 0.25;
      this.a = this.mask(this.a, body, W, H, res, 1.2, s * 0.03);
      this.tint(this.a, st.color);
      soft(this.a, (0.22 + 0.5 * this.flash) * G, s * 0.02);
      for (const f of this.rings) {
        const off = s * (0.06 + f * (lv === 3 ? 1.1 : 0.8));
        const band = s * (0.05 + 0.04 * (1 - f));
        const c = this.mask(null, body, W, H, res, 1, off);
        const g = c.getContext("2d")!;
        g.setTransform(res, 0, 0, res, 0, 0);
        g.globalCompositeOperation = "destination-out";
        g.beginPath();
        for (const [a, b, r] of body) capsulePath(g, a, b, r + Math.max(0, off - band));
        g.fill();
        this.tint(c, st.color);
        soft(c, Math.pow(1 - f, 1.4) * 0.9 * G, s * 0.012);
      }
    } else {
      // tight glow, always
      const res = 0.25;
      this.a = this.mask(this.a, body, W, H, res, 1.35, s * 0.04);
      this.tint(this.a, fill(this.a, res));
      soft(this.a, (lv === 1 ? 0.4 : lv === 2 ? 0.55 : 0.7) * G * breath, s * 0.025);
    }

    // flame off the whole outline
    if (st.kind === "flare" && st.fire) {
      const gl = GLField.get();
      if (gl) {
        const m = gl.begin(W, H);
        const step = s * 0.12;
        m.globalAlpha = (lv === 1 ? 0.18 : 0.3) * G;
        for (const [a, b, r] of body) {
          const L = Math.hypot(b.x - a.x, b.y - a.y);
          const n = Math.max(1, Math.ceil(L / step));
          const nx = L > 0 ? -(b.y - a.y) / L : 1;
          const ny = L > 0 ? (b.x - a.x) / L : 0;
          for (let k = 0; k <= n; k++) {
            const x = a.x + ((b.x - a.x) * k) / n;
            const y = a.y + ((b.y - a.y) * k) / n;
            for (const side of [-1, 1]) {
              const br = s * 0.11;
              m.drawImage(this.blob, x + nx * r * side - br, y + ny * r * side - br, br * 2, br * 2);
            }
          }
        }
        for (const p of this.heat) {
          const f = p.age / p.life;
          const r = p.size * (0.8 + f);
          m.globalAlpha = 0.4 * Math.pow(1 - f, 1.2) * G;
          m.drawImage(this.blob, p.x - r, p.y - r, r * 2, r * 2);
        }
        const rel = { x: e.worldVel.x - e.bodyVel.x, y: 0 };
        const lean = Math.max(-0.9, Math.min(0.9, rel.x / (s * 6)));
        const fire = gl.renderFire({ t: this.t, dir: { x: lean, y: -1 }, size: s * (lv === 3 ? 0.95 : 0.75), palette: FIRE_PALETTES[st.fire] });
        ctx.globalCompositeOperation = st.dark ? "source-over" : "lighter";
        ctx.globalAlpha = 1;
        ctx.drawImage(fire, 0, 0, W, H);
        ctx.globalCompositeOperation = "lighter";
      }
    }

    // lit from inside, at the full effect
    if (lv === 3 && st.kind !== "pulse") {
      const res = 0.25;
      const c = this.mask(null, body, W, H, res, 0.92, 0);
      this.tint(c, fill(c, res));
      ctx.globalAlpha = 0.16 * G * breath;
      ctx.drawImage(c, 0, 0, W, H);
    }

    const prism = ["#ff3b6b", "#ffb03b", "#f4ff3b", "#3bff8a", "#3bd8ff", "#c75cff"];
    for (const m of this.motes) {
      const f = m.age / m.life;
      ctx.globalAlpha = Math.sin(Math.PI * f) * G;
      const d = m.size * (s / 110) * (st.kind === "prism" ? 9 : 4);
      if (st.kind === "prism") {
        // glints that take a color from the spectrum
        const [r, g, b] = hexRgb(prism[m.k % prism.length]);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.globalAlpha *= 0.6;
        ctx.beginPath();
        ctx.arc(m.x, m.y, d * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.sin(Math.PI * f) * G * 0.9;
      }
      ctx.drawImage(this.mote, m.x - d / 2, m.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ SILK RIBBONS / RAINBOW TRAIL ══════════════
   Ribbons tied to the garment stream off it. Each ribbon is a chain of
   points carried by the air with a flutter on top, drawn as a strip
   that twists: where it turns edge-on it narrows and catches a line of
   light, and its back face shows darker. One ribbon at Level I, three
   long ones at the full effect. Rainbow Trail is one wide band of six
   colors off the hips that spreads as it trails. */

type RibbonPt = { x: number; y: number; vx: number; vy: number; age: number };

const SILK: [string, string][] = [
  ["#ffd9c7", "#d98a8a"],
  ["#ffe7b0", "#c99a5a"],
  ["#efd2ff", "#9c78c4"],
];
const RAINBOW = ["#ff3b4e", "#ff9a2e", "#ffe03a", "#3ee07a", "#3aa8ff", "#8a5cff"];

export class Ribbons implements Effect {
  private t = 0;
  private last: Emitter | null = null;
  private intensity = 0;
  private trails: RibbonPt[][] = [[], [], []];
  private rainbow: boolean;
  private glint = glintSprite("rgba(255,255,255,1)", 48);

  constructor(variant?: string) {
    this.rainbow = variant === "rainbow";
  }

  private anchors(e: Emitter): Vec[] {
    if (!e.path.length) return [];
    const total = pathLength(e.path);
    const at = (f: number) => {
      let d = f * total;
      for (let i = 1; i < e.path.length; i++) {
        const a = e.path[i - 1];
        const b = e.path[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= seg) return { x: a.x + (b.x - a.x) * (d / (seg || 1)), y: a.y + (b.y - a.y) * (d / (seg || 1)) };
        d -= seg;
      }
      return e.path[e.path.length - 1];
    };
    if (this.rainbow) return [at(0.5)];
    const lv = lvl(e);
    return (lv === 1 ? [0.5] : lv === 2 ? [0.2, 0.8] : [0.12, 0.5, 0.88]).map(at);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const em = this.last;
    const s = em?.scale ?? 100;
    const air = em?.worldVel ?? ZERO;
    const lv = lvl(em);
    const life = (lv === 1 ? 0.45 : lv === 2 ? 0.7 : 1.0) * (this.rainbow ? 1.5 : 1);
    const anchors = e && intensity > 0.05 ? this.anchors(e) : [];
    this.trails.forEach((tr, i) => {
      const k = 1 - Math.exp(-2.2 * dt);
      for (const p of tr) {
        p.age += dt;
        p.vx += (air.x - p.vx) * k;
        p.vy += (air.y - p.vy) * k + s * 0.15 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      while (tr.length && tr[0].age > life) tr.shift();
      const a = anchors[i];
      if (a && em) tr.push({ x: a.x, y: a.y, vx: em.bodyVel.x * 0.3, vy: em.bodyVel.y * 0.3, age: 0 });
      if (!a && !e) tr.length = 0;
    });
  }

  ignite() {}

  clear() {
    this.trails = [[], [], []];
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e) return;
    const s = e.scale;
    const I = Math.max(this.intensity, 0.001);
    const lv = lvl(e);
    const life = (lv === 1 ? 0.45 : lv === 2 ? 0.7 : 1.0) * (this.rainbow ? 1.5 : 1);
    ctx.save();
    ctx.lineJoin = "round";
    // the flutter: a wave that travels down each ribbon, growing from
    // nothing at the knot to full swing at the tail
    const wave = (p: RibbonPt, idx: number) => {
      const amp = s * (this.rainbow ? 0.1 : 0.16) * Math.min(1, (p.age / life) * 2.5);
      return { x: p.x, y: p.y + Math.sin(p.age * 8 - this.t * 1.5 + idx * 2.1) * amp, age: p.age };
    };
    this.trails.forEach((raw, idx) => {
      if (raw.length < 3) return;
      const tr = raw.map((p) => wave(p, idx));
      for (let i = tr.length - 1; i > 0; i--) {
        const a = tr[i];
        const b = tr[i - 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L;
        const ny = dx / L;
        const f = b.age / life;
        const fade = Math.min(1, (1 - f) * 1.6) * I;
        if (this.rainbow) {
          const bw = s * 0.032 * (1 + f * 1.6);
          ctx.globalCompositeOperation = "lighter";
          RAINBOW.forEach((c, j) => {
            const o0 = (j - 2.5) * s * 0.032 * (1 + (a.age / life) * 1.6);
            const o1 = (j - 2.5) * bw;
            ctx.globalAlpha = fade * 0.7;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.moveTo(a.x + nx * (o0 - bw / 2), a.y + ny * (o0 - bw / 2));
            ctx.lineTo(a.x + nx * (o0 + bw / 2), a.y + ny * (o0 + bw / 2));
            ctx.lineTo(b.x + nx * (o1 + bw / 2), b.y + ny * (o1 + bw / 2));
            ctx.lineTo(b.x + nx * (o1 - bw / 2), b.y + ny * (o1 - bw / 2));
            ctx.closePath();
            ctx.fill();
          });
          continue;
        }
        const tw = Math.cos(b.age * 6 + idx * 1.3 + this.t * 0.5);
        const w0 = s * 0.1 * (1 - (a.age / life) * 0.5) * Math.max(0.1, Math.abs(Math.cos(a.age * 6 + idx * 1.3 + this.t * 0.5)));
        const w1 = s * 0.1 * (1 - f * 0.5) * Math.max(0.1, Math.abs(tw));
        const [front, back] = SILK[idx % SILK.length];
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = fade * 0.92;
        ctx.fillStyle = tw > 0 ? front : back;
        ctx.beginPath();
        ctx.moveTo(a.x + nx * w0, a.y + ny * w0);
        ctx.lineTo(b.x + nx * w1, b.y + ny * w1);
        ctx.lineTo(b.x - nx * w1, b.y - ny * w1);
        ctx.lineTo(a.x - nx * w0, a.y - ny * w0);
        ctx.closePath();
        ctx.fill();
        // edge-on, the silk catches a line of light
        if (Math.abs(tw) < 0.35) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (0.35 - Math.abs(tw)) * 1.6 * fade;
          ctx.strokeStyle = "#fff6ee";
          ctx.lineWidth = Math.max(1, s * 0.012);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      if (this.rainbow && lv === 3) {
        // sparkle where the rainbow leaves the body
        const h = tr[tr.length - 1];
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (0.6 + 0.4 * Math.sin(this.t * 9)) * I;
        const d = s * 0.6;
        ctx.drawImage(this.glint, h.x - d / 2, h.y - d / 2, d, d);
      }
    });
    ctx.restore();
  }
}

/* ═══════════════════════ COMETS / NOVA ═════════════════════════════
   A comet rides each knee (or each heel, on shoes): a hot core in a
   glowing coma, a curved dust tail carried off by the air, and at the
   full effect a thin, straight ion tail pointing dead away. They shed
   sparkle from Level II. */

type Tail = { x: number; y: number; age: number }[];

const COMETS: Record<string, { core: string; glow: string; tail: string[]; ion: string }> = {
  ice: { core: "rgba(255,255,255,1)", glow: "rgba(140,210,255,0.7)", tail: ["#f0faff", "#8fd0ff", "#3a5cff"], ion: "#7fb6ff" },
  nova: { core: "rgba(255,246,220,1)", glow: "rgba(255,80,170,0.7)", tail: ["#fff1c4", "#ff5fb0", "#ff9a2a"], ion: "#ffd23f" },
};

export class Comet implements Effect {
  private t = 0;
  private last: Emitter | null = null;
  private intensity = 0;
  private tails: Tail[] = [[], []];
  private sparkle: P[] = [];
  private st: (typeof COMETS)[string];
  private glow: HTMLCanvasElement;
  private core: HTMLCanvasElement;
  private glint: HTMLCanvasElement;

  constructor(variant?: string) {
    this.st = COMETS[variant ?? "ice"] ?? COMETS.ice;
    this.glow = softSprite(this.st.glow, 96);
    this.core = softSprite(this.st.core, 32, 0.25);
    this.glint = glintSprite(rgba(this.st.tail[1], 1), 32);
  }

  private heads(e: Emitter): Vec[] {
    if (e.region === "feet") return e.path.slice(0, 2);
    if (e.knees?.length) return e.knees.slice(0, 2);
    return e.path.length ? [e.path[0], e.path[e.path.length - 1]] : [];
  }

  private life(e: Emitter | null) {
    const lv = lvl(e);
    return lv === 1 ? 0.28 : lv === 2 ? 0.5 : 0.78;
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const em = this.last;
    const air = em?.worldVel ?? ZERO;
    const s = em?.scale ?? 100;
    const life = this.life(em);
    const heads = e && intensity > 0.05 ? this.heads(e) : [];
    this.tails.forEach((tr, i) => {
      for (const p of tr) {
        p.age += dt;
        p.x += air.x * dt;
        // the dust tail curves: it lifts a little as it goes
        p.y += (air.y - s * 0.25) * dt;
      }
      while (tr.length && tr[0].age > life) tr.shift();
      const h = heads[i];
      if (h) tr.push({ x: h.x, y: h.y, age: 0 });
      else if (!e) tr.length = 0;
      if (h && lvl(em) > 1 && Math.random() < dt * 30 && this.sparkle.length < 160) {
        this.sparkle.push({
          x: h.x, y: h.y, vx: (em?.bodyVel.x ?? 0) * 0.5 + rand(-0.3, 0.3) * s, vy: rand(-0.4, 0.2) * s,
          age: 0, life: rand(0.4, 0.8), size: rand(0.5, 1.1), seed: Math.random() * 10, k: 0,
        });
      }
    });
    stepList(this.sparkle, dt, air, 2.2, 0.1, s);
  }

  ignite() {}

  clear() {
    this.tails = [[], []];
    this.sparkle.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e) return;
    const s = e.scale;
    const I = this.intensity;
    const lv = lvl(e);
    const life = this.life(e);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const tr of this.tails) {
      if (tr.length < 2) continue;
      for (let i = tr.length - 1; i > 0; i--) {
        const a = tr[i];
        const b = tr[i - 1];
        const f = b.age / life;
        ctx.globalAlpha = Math.pow(1 - f, 1.3) * 0.85 * I;
        ctx.strokeStyle = rampAt(this.st.tail, f);
        ctx.lineWidth = Math.max(1, s * 0.09 * Math.pow(1 - f, 0.8));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const h = tr[tr.length - 1];
      if (lv === 3) {
        // ion tail: straight, thin, pointing away along the air
        const air = e.worldVel;
        const al = Math.hypot(air.x - e.bodyVel.x, air.y - e.bodyVel.y);
        const dir = al > 1 ? { x: (air.x - e.bodyVel.x) / al, y: (air.y - e.bodyVel.y) / al } : { x: -0.7, y: -0.7 };
        const L = s * 2.6;
        const g = ctx.createLinearGradient(h.x, h.y, h.x + dir.x * L, h.y + dir.y * L);
        g.addColorStop(0, rgba(this.st.ion, 0.8));
        g.addColorStop(1, rgba(this.st.ion, 0));
        ctx.globalAlpha = 0.7 * I;
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1, s * 0.016);
        ctx.beginPath();
        ctx.moveTo(h.x, h.y - s * 0.02);
        ctx.lineTo(h.x + dir.x * L, h.y + dir.y * L - s * 0.08);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9 * I;
      const d = s * (0.8 + 0.2 * lv);
      ctx.drawImage(this.glow, h.x - d / 2, h.y - d / 2, d, d);
      ctx.globalAlpha = I;
      const c = s * 0.3;
      ctx.drawImage(this.core, h.x - c / 2, h.y - c / 2, c, c);
    }
    for (const p of this.sparkle) {
      const f = p.age / p.life;
      ctx.globalAlpha = (1 - f) * (0.5 + 0.5 * Math.sin(this.t * 20 + p.seed)) * I;
      const d = p.size * (s / 110) * 7;
      ctx.drawImage(this.glint, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ AURORA ════════════════════════════════════
   Curtains of northern lights rise off the shoulders and trail behind.
   Each curtain is a run of thin vertical columns, green at the foot
   and violet at the top, swaying at the top and lit by waves of
   brightness that travel along it. At the full effect a pink fringe
   runs along the bottom and a few stars come out above it. */

type Column = { x: number; y: number; age: number; life: number; h: number; ph: number };

export class Aurora implements Effect {
  private t = 0;
  private last: Emitter | null = null;
  private intensity = 0;
  private cols: Column[] = [];
  private carry = 0;
  private sprite: HTMLCanvasElement;
  private fringe: HTMLCanvasElement;
  private star = glintSprite("rgba(220,240,255,1)", 24);

  constructor() {
    // soft at the sides too, so neighbouring columns melt into one curtain
    const band = (stops: [number, string][]) => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 128;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 128, 0, 0);
      for (const [o, col] of stops) grad.addColorStop(o, col);
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 128);
      const side = g.createLinearGradient(0, 0, 32, 0);
      side.addColorStop(0, "rgba(0,0,0,0)");
      side.addColorStop(0.5, "rgba(0,0,0,1)");
      side.addColorStop(1, "rgba(0,0,0,0)");
      g.globalCompositeOperation = "destination-in";
      g.fillStyle = side;
      g.fillRect(0, 0, 32, 128);
      return c;
    };
    this.sprite = band([
      [0, "rgba(80,255,170,0)"],
      [0.08, "rgba(90,255,170,0.95)"],
      [0.35, "rgba(60,230,190,0.55)"],
      [0.7, "rgba(140,100,255,0.35)"],
      [1, "rgba(140,100,255,0)"],
    ]);
    this.fringe = band([
      [0, "rgba(255,80,170,0)"],
      [0.05, "rgba(255,80,170,0.8)"],
      [0.18, "rgba(255,80,170,0)"],
      [1, "rgba(255,80,170,0)"],
    ]);
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const em = this.last;
    const s = em?.scale ?? 100;
    const air = em?.worldVel ?? ZERO;
    const lv = lvl(em);
    if (e && intensity > 0.05 && e.path.length) {
      this.carry += (lv === 1 ? 36 : lv === 2 ? 60 : 95) * intensity * dt;
      const total = pathLength(e.path);
      while (this.carry >= 1 && this.cols.length < 260) {
        this.carry -= 1;
        const at = samplePath(e.path, total);
        // height follows a slow swell, so neighbouring columns match and
        // read as one curtain instead of a comb
        const swell = 1.45 + 0.4 * Math.sin(this.t * 1.6) + 0.15 * Math.sin(this.t * 4.3);
        this.cols.push({ x: at.x, y: at.y, age: 0, life: rand(1.4, 1.8), h: s * swell * (lv === 1 ? 0.55 : lv === 2 ? 0.85 : 1.15), ph: this.t });
      }
    } else this.carry = 0;
    for (let i = this.cols.length - 1; i >= 0; i--) {
      const c = this.cols[i];
      c.age += dt;
      c.x += air.x * 0.9 * dt;
      c.y += (air.y - s * 0.12) * dt;
      if (c.age > c.life) this.cols.splice(i, 1);
    }
  }

  ignite() {}

  clear() {
    this.cols.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e || !this.cols.length) return;
    const s = e.scale;
    const I = this.intensity;
    const lv = lvl(e);
    const w = s * 0.2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const c of this.cols) {
      const f = c.age / c.life;
      const env = Math.sin(Math.PI * Math.min(1, f * 1.1));
      const wave = 0.45 + 0.55 * Math.max(0, Math.sin(this.t * 2.2 - c.x * 0.012));
      const skew = Math.sin(this.t * 0.9 + c.x * 0.004) * 0.18;
      ctx.setTransform(1, 0, skew, 1, c.x, c.y);
      ctx.globalAlpha = env * wave * 0.5 * I;
      ctx.drawImage(this.sprite, -w / 2, -c.h, w, c.h);
      if (lv === 3) {
        ctx.globalAlpha = env * wave * 0.5 * I;
        ctx.drawImage(this.fringe, -w / 2, -c.h, w, c.h);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (lv === 3) {
      // a few stars come out above the curtains
      for (let i = 0; i < this.cols.length; i += 9) {
        const c = this.cols[i];
        const tw = Math.pow(Math.max(0, Math.sin(this.t * 6 + c.ph * 5)), 4);
        ctx.globalAlpha = tw * (1 - c.age / c.life) * I;
        const d = s * 0.22;
        ctx.drawImage(this.star, c.x - d / 2, c.y - c.h * 1.05 - d / 2, d, d);
      }
    }
    ctx.restore();
  }
}

/* ═══════════════════════ GOLD DUST / DIAMOND DUST ══════════════════
   Glints shed off the garment. Each one twinkles hard — mostly dark,
   then a sharp four-point flash — the way real glitter does as it
   turns. Gold falls slowly behind you; diamond dust hangs in the air,
   flashing ice blue and the odd spectral color. Big flares with long
   rays come in at the full effect. */

export class Sparkle extends System {
  protected max = 280;
  private sprites: HTMLCanvasElement[];
  private dot: HTMLCanvasElement;
  private diamond: boolean;

  constructor(variant?: string) {
    super();
    this.diamond = variant === "diamond";
    const cols = this.diamond
      ? ["rgba(255,255,255,1)", "rgba(200,236,255,1)", "rgba(160,210,255,1)", "rgba(255,170,230,1)", "rgba(170,255,220,1)"]
      : ["rgba(255,246,210,1)", "rgba(255,214,110,1)", "rgba(255,180,60,1)", "rgba(255,230,160,1)", "rgba(255,200,90,1)"];
    this.sprites = cols.map((c) => glintSprite(c, 64));
    this.dot = softSprite(this.diamond ? "rgba(220,240,255,1)" : "rgba(255,220,140,1)", 16, 0.3);
  }

  protected rate(e: Emitter) {
    return 60 + e.scale * 0.4;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    const big = lvl(e) === 3 && Math.random() < 0.08;
    return {
      x: at.x + rand(-0.15, 0.15) * s,
      y: at.y + rand(-0.15, 0.15) * s,
      vx: e.bodyVel.x * 0.6 + rand(-0.3, 0.3) * s,
      vy: e.bodyVel.y * 0.6 + rand(-0.45, 0.1) * s,
      age: 0,
      life: rand(1, 2.1),
      size: s * rand(0.1, 0.19) * (big ? 2.4 : 1),
      seed: Math.random() * 100,
      k: this.diamond ? (Math.random() < 0.12 ? 3 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3)) : Math.floor(Math.random() * 5),
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const s = e ? e.scale : 100;
    this.drag(p, dt, e, this.diamond ? 3.4 : 2.1);
    p.vy += s * (this.diamond ? 0.04 : 0.32) * dt;
    p.vx += Math.sin(this.t * 2 + p.seed) * s * 0.3 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s0 = this.last?.scale ?? 100;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.ps) {
      const f = p.age / p.life;
      const env = Math.min(1, f * 6) * (f > 0.75 ? (1 - f) / 0.25 : 1);
      const rate = 4 + (p.seed % 7);
      const tw = Math.pow(Math.max(0, Math.sin(this.t * rate + p.seed)), 3);
      // the dust is always there; the flash is the glint
      ctx.globalAlpha = env * 0.75;
      const dd = Math.max(1.4, s0 * 0.018);
      ctx.drawImage(this.dot, p.x - dd, p.y - dd, dd * 2, dd * 2);
      if (tw < 0.02) continue;
      ctx.globalAlpha = env * tw;
      const d = p.size * (0.4 + 1.3 * tw);
      const rot = this.diamond ? p.age * 1.4 + p.seed : 0.2;
      ctx.setTransform(1, 0, 0, 1, p.x, p.y);
      ctx.rotate(rot);
      ctx.drawImage(this.sprites[p.k], -d / 2, -d / 2, d, d);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ SNOWFALL ══════════════════════════════════
   Snow falls around the wearer and nowhere else. Flakes come in ahead
   of a runner and sweep past, spinning; a few near the lens drift by
   big and out of focus at the full effect. Level I is fine powder,
   Level II brings real six-armed crystals. */

export class Snow implements Effect {
  private t = 0;
  private last: Emitter | null = null;
  private intensity = 0;
  private flakes: P[] = [];
  private carry = 0;
  private crystals: HTMLCanvasElement[];
  private dot = softSprite("rgba(245,250,255,1)", 16, 0.4);
  private bokeh = softSprite("rgba(235,245,255,0.35)", 64, 0.6);

  constructor() {
    this.crystals = [0, 1, 2].map((v) => Snow.crystal(v));
  }

  /** a six-armed snow crystal with side branches */
  private static crystal(v: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.translate(32, 32);
    g.strokeStyle = "rgba(240,248,255,0.95)";
    g.lineCap = "round";
    g.lineWidth = 2.2;
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate((i / 6) * Math.PI * 2);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -28);
      const br = v === 0 ? [10, 18] : v === 1 ? [8, 15, 22] : [14];
      for (const y of br) {
        const L = v === 2 ? 9 : 6 - (y - 8) * 0.12;
        g.moveTo(0, -y);
        g.lineTo(-L, -y - L * 0.8);
        g.moveTo(0, -y);
        g.lineTo(L, -y - L * 0.8);
      }
      g.stroke();
      g.restore();
    }
    return c;
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const em = this.last;
    const s = em?.scale ?? 100;
    const air = em?.worldVel ?? ZERO;
    const lv = lvl(em);
    if (e && intensity > 0.05 && e.path.length) {
      const c = centroid(e.path);
      this.carry += (lv === 1 ? 45 : lv === 2 ? 75 : 110) * intensity * dt;
      // flakes come in ahead of a runner, so they pass by
      const ahead = air.x < -1 ? 1 : air.x > 1 ? -1 : 0;
      while (this.carry >= 1 && this.flakes.length < 320) {
        this.carry -= 1;
        const kind = lv === 1 ? 3 : lv === 3 && Math.random() < 0.05 ? 4 : Math.random() < 0.5 ? 3 : Math.floor(Math.random() * 3);
        // all around the body, top of the head to the knees, so it reads
        // as falling around you rather than above you
        this.flakes.push({
          x: c.x + rand(-1.8, 1.8) * s + ahead * rand(0, 3.5) * s,
          y: c.y + rand(-3.2, 0.8) * s,
          vx: air.x,
          vy: s * rand(0.4, 0.8),
          age: 0,
          life: rand(2.4, 3.4),
          size: kind === 4 ? s * rand(0.25, 0.4) : kind === 3 ? s * rand(0.02, 0.04) : s * rand(0.07, 0.12),
          seed: Math.random() * 100,
          k: kind,
          fy: c.y + 3 * s,
        });
      }
    } else this.carry = 0;
    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const p = this.flakes[i];
      p.age += dt;
      if (p.age >= p.life || (p.fy !== undefined && p.y > p.fy)) {
        this.flakes.splice(i, 1);
        continue;
      }
      const f = 1 - Math.exp(-1.2 * dt);
      p.vx += (air.x - p.vx) * f + Math.sin(this.t * 1.5 + p.seed) * s * 0.4 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  ignite() {}

  clear() {
    this.flakes.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const I = this.intensity;
    if (!this.flakes.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.flakes) {
      const f = p.age / p.life;
      const env = Math.min(1, f * 5) * (f > 0.8 ? (1 - f) / 0.2 : 1);
      ctx.globalAlpha = env * I * (p.k === 4 ? 0.5 : 0.9);
      if (p.k >= 3) {
        const d = p.size * 2;
        ctx.drawImage(p.k === 4 ? this.bokeh : this.dot, p.x - d / 2, p.y - d / 2, d, d);
        continue;
      }
      ctx.setTransform(1, 0, 0, 1, p.x, p.y);
      ctx.rotate(p.age * (0.6 + (p.seed % 1.5)) + p.seed);
      const d = p.size * 2;
      ctx.drawImage(this.crystals[p.k], -d / 2, -d / 2, d, d);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
  }
}

/* ═══════════════════════ FINISH LINE ═══════════════════════════════
   Confetti thrown up off the shoulders. Each piece is paper: it
   tumbles, flips (showing its darker back), and drifts down slowly
   under air drag. At the full effect curled streamers join it and a
   burst goes off every couple of seconds. */

const CONFETTI = ["#ff5c8a", "#ffd23f", "#3fd1ff", "#7cff6b", "#b28bff", "#ffffff", "#ff8a3a"];

export class Confetti extends System {
  protected max = 340;
  private popAt = 1.5;

  protected rate(e: Emitter) {
    return 34 + e.scale * 0.24;
  }

  protected spawn(e: Emitter, at: Vec): P {
    const s = e.scale;
    const streamer = lvl(e) === 3 && Math.random() < 0.14;
    return {
      x: at.x,
      y: at.y,
      vx: e.bodyVel.x * 0.5 + rand(-1, 1) * s,
      vy: e.bodyVel.y * 0.5 - rand(1.2, 2.6) * s,
      age: 0,
      life: rand(1.6, 2.6),
      size: s * rand(0.06, 0.1) * (streamer ? 1.6 : 1),
      seed: Math.random() * 100,
      k: Math.floor(Math.random() * CONFETTI.length) + (streamer ? 100 : 0),
    };
  }

  protected step(p: P, dt: number, e: Emitter | null) {
    const s = e ? e.scale : 100;
    this.drag(p, dt, e, 2.6);
    p.vy += s * 1.1 * dt;
    p.vx += Math.sin(this.t * 6 + p.seed) * s * 1.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    super.update(dt, e, intensity);
    if (e && intensity > 0.5 && lvl(e) === 3 && e.path.length) {
      this.popAt -= dt;
      if (this.popAt <= 0) {
        this.popAt = rand(1.8, 2.8);
        const at = e.path[Math.floor(Math.random() * e.path.length)];
        for (let i = 0; i < 40 && this.ps.length < this.max * 1.4; i++) {
          const p = this.spawn(e, at);
          p.vx *= 1.8;
          p.vy *= 1.5;
          this.ps.push(p);
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.ps) {
      const f = p.age / p.life;
      const env = f > 0.8 ? (1 - f) / 0.2 : 1;
      const streamer = p.k >= 100;
      const col = CONFETTI[p.k % 100];
      const flip = Math.cos(p.age * (5 + (p.seed % 4)) + p.seed);
      ctx.setTransform(1, 0, 0, 1, p.x, p.y);
      ctx.rotate(p.seed + p.age * ((p.seed % 6) - 3));
      ctx.globalAlpha = env;
      if (streamer) {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, p.size * 0.2);
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.bezierCurveTo(-p.size * 0.4, -p.size * flip, p.size * 0.4, p.size * flip, p.size, 0);
        ctx.stroke();
        continue;
      }
      ctx.scale(1, Math.max(0.08, Math.abs(flip)));
      ctx.fillStyle = col;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      if (flip < 0) {
        // the back of the paper, in shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
    }
    ctx.restore();
  }
}

/* ═══════════════════════ BUTTERFLIES ═══════════════════════════════
   Glowing blue butterflies lift off the garment and scatter. Wings are
   pre-rendered once; each flap squeezes them on screen as they fold,
   and the flyer wanders up and away, drifting with the air. They fade
   into motes of light at the end. At the full effect each one leaves a
   trail of light dust. */

type Fly = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; flap: number; rate: number; seed: number };

export class Butterflies implements Effect {
  private t = 0;
  private last: Emitter | null = null;
  private intensity = 0;
  private flies: Fly[] = [];
  private spawnAt = 0;
  private dust: P[] = [];
  private wing: HTMLCanvasElement;
  private glow = softSprite("rgba(90,180,255,0.6)", 64);
  private mote = softSprite("rgba(170,230,255,1)", 16, 0.3);

  constructor() {
    this.wing = Butterflies.wingSprite();
  }

  /** one side: a broad upper wing and a smaller lower one, glowing at the edges */
  private static wingSprite(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 80;
    const g = c.getContext("2d")!;
    g.translate(2, 40);
    const fillWing = (path: () => void, x0: number, y0: number, x1: number, y1: number) => {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, "rgba(20,70,220,0.95)");
      grad.addColorStop(0.55, "rgba(60,160,255,0.95)");
      grad.addColorStop(1, "rgba(190,245,255,1)");
      g.beginPath();
      path();
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = "rgba(220,250,255,0.9)";
      g.lineWidth = 1.4;
      g.stroke();
    };
    fillWing(
      () => {
        g.moveTo(0, -2);
        g.bezierCurveTo(14, -36, 52, -40, 58, -20);
        g.bezierCurveTo(60, -8, 30, -2, 0, 0);
      },
      0, 0, 58, -30,
    );
    fillWing(
      () => {
        g.moveTo(0, 2);
        g.bezierCurveTo(26, 4, 46, 16, 38, 32);
        g.bezierCurveTo(28, 40, 8, 22, 0, 4);
      },
      0, 0, 38, 30,
    );
    // veins
    g.strokeStyle = "rgba(10,30,90,0.45)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(2, -1);
    g.quadraticCurveTo(26, -18, 50, -26);
    g.moveTo(2, -1);
    g.quadraticCurveTo(28, -8, 52, -14);
    g.moveTo(2, 3);
    g.quadraticCurveTo(20, 12, 32, 26);
    g.stroke();
    return c;
  }

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const em = this.last;
    const s = em?.scale ?? 100;
    const air = em?.worldVel ?? ZERO;
    const lv = lvl(em);
    if (e && intensity > 0.3 && e.path.length) {
      this.spawnAt -= dt;
      if (this.spawnAt <= 0) {
        this.spawnAt = lv === 1 ? rand(0.5, 0.8) : lv === 2 ? rand(0.25, 0.4) : rand(0.14, 0.24);
        const at = samplePath(e.path);
        if (this.flies.length < 40) {
          this.flies.push({
            x: at.x, y: at.y,
            vx: e.bodyVel.x * 0.5 + rand(-0.5, 0.5) * s, vy: -rand(0.6, 1.1) * s,
            age: 0, life: rand(1.6, 2.6), size: s * rand(0.26, 0.38) * (lv === 1 ? 0.8 : 1),
            flap: Math.random() * 6, rate: rand(15, 20), seed: Math.random() * 100,
          });
        }
      }
    }
    const f = 1 - Math.exp(-1.1 * dt);
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const b = this.flies[i];
      b.age += dt;
      if (b.age > b.life) {
        for (let k = 0; k < 6; k++) {
          this.dust.push({ x: b.x, y: b.y, vx: b.vx * 0.3 + rand(-0.4, 0.4) * s, vy: b.vy * 0.3 + rand(-0.4, 0.2) * s, age: 0, life: rand(0.4, 0.8), size: rand(0.8, 1.4), seed: 0, k: 0 });
        }
        this.flies.splice(i, 1);
        continue;
      }
      b.flap += b.rate * dt;
      // they fly, but the air still carries them
      b.vx += (air.x * 0.7 - b.vx) * f + Math.sin(this.t * 2.3 + b.seed) * s * 2.2 * dt;
      b.vy += (-0.35 * s - b.vy) * f + Math.cos(this.t * 3.1 + b.seed) * s * 1.8 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (lv === 3 && Math.random() < dt * 26 && this.dust.length < 240) {
        this.dust.push({ x: b.x, y: b.y, vx: air.x * 0.5, vy: s * 0.1, age: 0, life: rand(0.4, 0.8), size: rand(0.5, 1), seed: 0, k: 0 });
      }
    }
    stepList(this.dust, dt, air, 2, 0.1, s);
  }

  ignite() {
    this.spawnAt = 0;
  }

  clear() {
    this.flies.length = 0;
    this.dust.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const I = this.intensity;
    const s0 = this.last?.scale ?? 100;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.dust) {
      ctx.globalAlpha = (1 - p.age / p.life) * 0.8;
      const d = p.size * (s0 / 110) * 3.5;
      ctx.drawImage(this.mote, p.x - d / 2, p.y - d / 2, d, d);
    }
    for (const b of this.flies) {
      const f = b.age / b.life;
      const env = Math.min(1, f * 6) * (f > 0.8 ? (1 - f) / 0.2 : 1);
      const open = 0.15 + 0.85 * Math.abs(Math.cos(b.flap));
      ctx.globalAlpha = env * 0.7 * Math.max(I, 0.4);
      const gd = b.size * 3;
      ctx.drawImage(this.glow, b.x - gd / 2, b.y - gd / 2, gd, gd);
      const tilt = Math.max(-0.5, Math.min(0.5, b.vx / (s0 * 4)));
      ctx.globalAlpha = env * Math.max(I, 0.4);
      const w = b.size;
      const h = b.size * 1.25;
      for (const side of [1, -1]) {
        ctx.setTransform(side * open, 0, 0, 1, b.x, b.y);
        ctx.rotate(tilt * side);
        ctx.drawImage(this.wing, -w * 0.03, -h / 2, w, h);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // the body
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(20,30,60,0.9)";
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.size * 0.04, b.size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
    }
    ctx.restore();
  }
}

/* ═══════════════════════ SLIPSTREAM ════════════════════════════════
   The air made visible: thin silver flow lines peel off the body and
   stream away behind it, wavering. In camera mode, where the air is
   still, they lift off and drift. At the full effect a pressure line
   bows out in front of the chest. */

type Flow = { pts: Vec[]; x: number; y: number; vx: number; vy: number; age: number; life: number; ph: number };

export class Slipstream implements Effect {
  private t = 0;
  private last: Emitter | null = null;
  private intensity = 0;
  private lines: Flow[] = [];
  private carry = 0;

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const em = this.last;
    const s = em?.scale ?? 100;
    const air = em?.worldVel ?? ZERO;
    const lv = lvl(em);
    if (e && intensity > 0.05 && e.path.length) {
      this.carry += (lv === 1 ? 10 : lv === 2 ? 22 : 36) * intensity * dt;
      const still = Math.hypot(air.x, air.y) < s * 0.5;
      while (this.carry >= 1 && this.lines.length < 90) {
        this.carry -= 1;
        const at = samplePath(e.path);
        this.lines.push({
          pts: [],
          x: at.x + rand(-0.06, 0.06) * s,
          y: at.y + rand(-0.06, 0.06) * s,
          vx: still ? -e.bodyVel.x * 0.6 + rand(-0.3, 0.3) * s : air.x * rand(0.9, 1.05),
          vy: still ? -s * rand(0.4, 0.8) : rand(-0.1, 0.1) * s,
          age: 0,
          life: rand(0.45, 0.85),
          ph: Math.random() * 6,
        });
      }
    } else this.carry = 0;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.age += dt;
      if (l.age > l.life) {
        this.lines.splice(i, 1);
        continue;
      }
      l.x += l.vx * dt;
      l.y += (l.vy + Math.sin(l.age * 9 + l.ph) * s * 0.25) * dt;
      l.pts.push({ x: l.x, y: l.y });
      if (l.pts.length > 30) l.pts.shift();
      // the trail is carried along with the line, so it reads as flow
      for (const p of l.pts) p.x += air.x * 0.05 * dt;
    }
  }

  ignite() {}

  clear() {
    this.lines.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e) return;
    const s = e.scale;
    const I = this.intensity;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const l of this.lines) {
      const env = Math.sin(Math.PI * (l.age / l.life));
      for (let i = 1; i < l.pts.length; i++) {
        ctx.globalAlpha = (i / l.pts.length) * env * 0.85 * I;
        ctx.strokeStyle = "rgba(225,236,255,1)";
        ctx.lineWidth = Math.max(1, s * 0.009);
        ctx.beginPath();
        ctx.moveTo(l.pts[i - 1].x, l.pts[i - 1].y);
        ctx.lineTo(l.pts[i].x, l.pts[i].y);
        ctx.stroke();
      }
    }
    if (lvl(e) === 3 && e.path.length > 1) {
      // the pressure line in front of the body
      const air = e.worldVel;
      const al = Math.hypot(air.x, air.y);
      if (al > s * 0.5) {
        const fx = -air.x / al;
        const top = e.path[0];
        const bot = e.path[e.path.length - 1];
        const mid = centroid(e.path);
        const reach = s * (0.55 + 0.05 * Math.sin(this.t * 12));
        ctx.globalAlpha = 0.28 * I;
        ctx.strokeStyle = "rgba(225,236,255,1)";
        ctx.lineWidth = Math.max(1, s * 0.01);
        ctx.beginPath();
        ctx.moveTo(top.x + fx * s * 0.2, top.y - s * 0.2);
        ctx.quadraticCurveTo(mid.x + fx * reach * 1.6, mid.y, bot.x + fx * s * 0.2, bot.y + s * 0.2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/* ═══════════════════════ GLITCH ════════════════════════════════════
   The wearer breaks up like a bad signal. In bursts, horizontal slices
   of the picture around the body jump sideways; from Level II the red
   and cyan channels split apart, and at the full effect scanlines roll
   across. Between bursts, square pixels shed off the garment in neon,
   moving in steps on a grid. */

const PIX = ["#00f0ff", "#ff2bd6", "#ffffff", "#7a5cff", "#3fff9a"];

export class Glitch implements Effect {
  private t = 0;
  private last: Emitter | null = null;
  private intensity = 0;
  private pixels: P[] = [];
  private burst = 0;
  private nextBurst = 0.6;
  private copy: HTMLCanvasElement | null = null;
  private chan: HTMLCanvasElement | null = null;

  update(dt: number, e: Emitter | null, intensity: number) {
    this.t += dt;
    this.intensity = intensity;
    if (e) this.last = e;
    const em = this.last;
    const s = em?.scale ?? 100;
    const air = em?.worldVel ?? ZERO;
    const lv = lvl(em);
    if (e && intensity > 0.2 && e.path.length) {
      const rate = (lv === 1 ? 50 : lv === 2 ? 100 : 170) * intensity;
      let n = rate * dt;
      while (n > 0 && this.pixels.length < 320) {
        if (Math.random() < n) {
          const at = samplePath(e.path);
          this.pixels.push({
            x: at.x + rand(-0.1, 0.1) * s, y: at.y + rand(-0.1, 0.1) * s, vx: e.bodyVel.x * 0.5 + rand(-0.3, 0.3) * s, vy: rand(-0.4, 0.2) * s,
            age: 0, life: rand(0.5, 1.1), size: s * (Math.random() < 0.25 ? 0.09 : 0.05), seed: Math.random() * 100, k: Math.floor(Math.random() * PIX.length),
          });
        }
        n -= 1;
      }
      this.nextBurst -= dt;
      if (this.nextBurst <= 0) {
        this.burst = rand(0.1, 0.24);
        this.nextBurst = lv === 1 ? rand(1.6, 3) : lv === 2 ? rand(0.6, 1.4) : rand(0.35, 0.9);
      }
    }
    this.burst = Math.max(0, this.burst - dt);
    stepList(this.pixels, dt, air, 1.4, 0, s);
  }

  ignite() {
    this.burst = 0.3;
  }

  clear() {
    this.pixels.length = 0;
    this.burst = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.last;
    if (!e) return;
    const lv = lvl(e);
    ctx.save();
    // between bursts, Level II and up keep a faint channel split going
    if (this.burst > 0 || (lv > 1 && this.intensity > 0.3)) {
      this.slice(ctx, e, this.burst > 0 ? 1 : lv === 3 ? 0.55 : 0.4);
    }
    this.drawPixels(ctx, e);
    ctx.restore();
  }

  /** slices of the picture around the body jump sideways; channels split */
  private slice(ctx: CanvasRenderingContext2D, e: Emitter, amount: number) {
    const s = e.scale;
    const lv = lvl(e);
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const bursting = this.burst > 0;
    const pts = e.body?.length ? e.body.flatMap(([a, b]) => [a, b]) : e.path;
    const box = bounds(pts, s * 0.45);
    const bx = Math.max(0, Math.floor(box.x));
    const by = Math.max(0, Math.floor(box.y));
    const bw = Math.min(W - bx, Math.ceil(box.w));
    const bh = Math.min(H - by, Math.ceil(box.h));
    if (bw <= 4 || bh <= 4) return;
    this.copy = scratch(this.copy, bw, bh);
    const cg = this.copy.getContext("2d")!;
    cg.globalCompositeOperation = "copy";
    cg.drawImage(ctx.canvas, bx, by, bw, bh, 0, 0, bw, bh);
    cg.globalCompositeOperation = "source-over";
    const n = bursting ? (lv === 1 ? 3 : lv === 2 ? 5 : 8) : 0;
    for (let i = 0; i < n; i++) {
      const sy = Math.random() * bh;
      const sh = Math.min(bh - sy, s * rand(0.02, 0.12));
      const dx = rand(-0.35, 0.35) * s;
      if (sh > 1) ctx.drawImage(this.copy, 0, sy, bw, sh, bx + dx, by + sy, bw, sh);
    }
    if (lv > 1 && e.body?.length) {
      // red and cyan channels pulled apart, on the body only: masking the
      // copy to the silhouette keeps the background from tinting in a box
      cg.globalCompositeOperation = "destination-in";
      cg.setTransform(1, 0, 0, 1, -bx, -by);
      cg.beginPath();
      for (const [a, b, r] of e.body) capsulePath(cg, a, b, r * 1.3);
      cg.fillStyle = "#fff";
      cg.fill();
      cg.setTransform(1, 0, 0, 1, 0, 0);
      cg.globalCompositeOperation = "source-over";
      this.chan = scratch(this.chan, bw, bh);
      const g = this.chan.getContext("2d")!;
      ctx.globalCompositeOperation = "lighter";
      const off = s * (bursting ? 0.07 : 0.025);
      for (const [col, dx] of [
        ["#ff0040", off],
        ["#00e5ff", -off],
      ] as [string, number][]) {
        g.globalCompositeOperation = "copy";
        g.drawImage(this.copy, 0, 0);
        g.globalCompositeOperation = "multiply";
        g.fillStyle = col;
        g.fillRect(0, 0, bw, bh);
        g.globalCompositeOperation = "destination-in";
        g.drawImage(this.copy, 0, 0);
        ctx.globalAlpha = 0.38 * amount;
        ctx.drawImage(this.chan, bx + dx, by);
      }
      ctx.globalCompositeOperation = "source-over";
    }
    if (lv === 3 && bursting) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(200,255,255,1)";
      ctx.globalAlpha = 0.07;
      for (let y = by + ((this.t * 400) % 6); y < by + bh; y += Math.max(3, s * 0.03)) ctx.fillRect(bx, y, bw, 1);
    }
  }

  private drawPixels(ctx: CanvasRenderingContext2D, e: Emitter) {
    const s = e.scale;
    const I = this.intensity;
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.pixels) {
      // pixels blink, and move in grid steps
      if (Math.sin(this.t * 30 + p.seed * 7) < -0.6) continue;
      const q = s * 0.035;
      const x = Math.round(p.x / q) * q;
      const y = Math.round(p.y / q) * q;
      ctx.globalAlpha = (1 - p.age / p.life) * 0.9 * I;
      ctx.fillStyle = PIX[p.k];
      ctx.fillRect(x, y, p.size, p.size);
    }
  }
}
