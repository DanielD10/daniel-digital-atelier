/**
 * The demo runner — a side-on athlete on a night road, drawn
 * procedurally so the page needs no video asset and no camera.
 *
 * The camera tracks the runner, so the world slides left at running
 * pace. The runner reports that as `worldVel`, and the effect engine
 * treats it exactly like still air in camera mode. Same physics,
 * different camera.
 */

import type { Finish, Unit } from "@/lib/nertia";
import type { Emitter, Vec } from "./effects";

type Pt = Vec;

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
/** angle measured from straight down, positive = forward (+x) */
const dir = (a: number): Pt => ({ x: Math.sin(a), y: Math.cos(a) });

type Limb = { a: Pt; b: Pt; c: Pt; foot?: Pt };

export type SceneFrame = { W: number; H: number; groundY: number; Hb: number; runSpeed: number };

/* ─────────────────────────── the world ─────────────────────────── */

type Building = { x: number; w: number; h: number; lit: number[] };

export class DemoScene {
  private phase = 0;
  private scroll = 0;
  private skyline: Building[] = [];
  private skylineWidth = 0;
  private sheen = 0;
  /** which foot is down, per runner — a change is a touchdown */
  private planted = new Map<number, "near" | "far">();

  constructor() {
    // A generic skyline with one needle-and-saucer tower — a nod to
    // San Antonio's skyline without reproducing any one building.
    let x = 0;
    for (let i = 0; i < 26; i++) {
      const w = 0.03 + Math.random() * 0.05;
      const h = 0.04 + Math.random() * 0.1;
      const lit: number[] = [];
      for (let j = 0; j < 6; j++) lit.push(Math.random());
      this.skyline.push({ x, w, h, lit });
      x += w + 0.004 + Math.random() * 0.012;
    }
    this.skylineWidth = x;
  }

  /**
   * Advances the clock and draws the world. Call once per frame, then
   * `runner()` once per athlete, back to front.
   */
  beginFrame(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    dt: number,
    finish: Finish,
    active: boolean,
  ): SceneFrame {
    const groundY = H * 0.86;
    // body height: fit the frame on phones and wide desktops alike
    const Hb = Math.min(H * 0.62, W * 0.95);
    const runSpeed = Hb * 1.55; // px/s the world slides by
    const cadence = 1.42; // full gait cycles per second

    this.phase += dt * Math.PI * 2 * cadence;
    this.scroll += runSpeed * dt;
    this.sheen += dt;

    this.drawWorld(ctx, W, H, groundY, finish, active);
    return { W, H, groundY, Hb, runSpeed };
  }

  /**
   * Draws one runner and returns the emitter its garment drives.
   * `depth` < 1 puts them further back: smaller, higher on the road,
   * and the world slides past them a touch slower (parallax).
   */
  runner(
    ctx: CanvasRenderingContext2D,
    f: SceneFrame,
    unit: Unit,
    finish: Finish,
    active: boolean,
    opts: { slot: number; x: number; depth: number; phase: number },
  ): Emitter {
    const Hb = f.Hb * opts.depth;
    const groundY = f.groundY - (1 - opts.depth) * f.Hb * 0.22;
    const runSpeed = f.runSpeed * opts.depth;
    const hipX = opts.x;
    const r = this.pose(this.phase + opts.phase, Hb);

    // pin the lower foot to the road — that is what makes the stride
    // bounce, rather than a hand-tuned sine bob
    const lowest = Math.max(r.nearLeg.c.y, r.farLeg.c.y);
    const footPad = Hb * 0.03;
    const off: Pt = { x: hipX, y: groundY - footPad - lowest };
    const T = (p: Pt) => add(p, off);
    const near = mapLimb(r.nearLeg, T);
    const far = mapLimb(r.farLeg, T);
    const nearArm = mapLimb(r.nearArm, T);
    const farArm = mapLimb(r.farArm, T);
    const hip = T(r.hip);
    const sh = T(r.shoulder);
    const head = T(r.head);

    // ground shadow
    ctx.save();
    const sg = ctx.createRadialGradient(hipX, groundY, 0, hipX, groundY, Hb * 0.32);
    sg.addColorStop(0, "rgba(0,0,0,0.55)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.scale(1, 0.12);
    ctx.fillRect(hipX - Hb * 0.4, groundY / 0.12 - Hb * 0.4, Hb * 0.8, Hb * 0.8);
    ctx.restore();

    const back = opts.depth < 1;
    const skin = back ? "#141419" : "#18181e";
    const skinFar = back ? "#0d0d11" : "#0f0f13";
    const base = back ? "#1a1a20" : "#1f1f26"; // the neutral half of the kit
    const rim = finish.accent;
    const lean = r.lean;
    const glow = hexA(rim, active ? 0.6 : 0.28);

    const region = unit.region;
    const torso = torsoPath(hip, sh, lean, Hb);
    const fill = this.garmentFill(ctx, hip, sh, Hb, finish);
    const topFill = region === "top" ? fill : base;
    const shortFill = region === "bottom" ? fill : base;
    const shortLen = region === "bottom" ? (unit.inseam ?? 0.36) : 0.4;
    const shoe =
      region === "feet" ? this.shoeFill(ctx, hipX, groundY, Hb, finish) : "#2a2a32";

    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = Hb * 0.035;

    // far side first, a shade darker
    drawArm(ctx, farArm, Hb, skinFar);
    drawLeg(ctx, far, Hb, skinFar, shoe, region === "feet");
    ctx.shadowBlur = 0;
    shortPanel(ctx, hip, far, shortLen, Hb, lean, shortFill);
    if (unit.sleeves) drawSleeve(ctx, farArm, Hb, fill, 0.6);

    // torso, neck, head
    ctx.shadowBlur = Hb * 0.035;
    ctx.fillStyle = skin;
    ctx.fill(torso.path);
    const neckTop = { x: head.x - Hb * 0.012, y: head.y + Hb * 0.045 };
    capsule(ctx, sh, neckTop, Hb * 0.026, Hb * 0.022, skin);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y, Hb * 0.056, Hb * 0.064, lean, 0, Math.PI * 2);
    ctx.fill();
    if (region === "head") {
      ctx.shadowBlur = 0;
      this.drawHeadgear(ctx, head, lean, Hb, finish, unit.headgear ?? "cap");
      ctx.shadowBlur = Hb * 0.035;
    }

    // near leg, then the short over it, then the top over the waist
    drawLeg(ctx, near, Hb, skin, shoe, region === "feet");
    ctx.shadowBlur = 0;
    shortPanel(ctx, hip, near, shortLen, Hb, lean, shortFill);
    if (region === "bottom") this.garmentSheenStroke(ctx, near, Hb, finish);

    ctx.fillStyle = topFill;
    ctx.fill(torso.garment);
    if (region === "top") this.garmentSheen(ctx, torso.garment, hip, sh, Hb, finish);

    // near arm in front of everything
    ctx.shadowBlur = Hb * 0.035;
    drawArm(ctx, nearArm, Hb, skin);
    ctx.shadowBlur = 0;
    if (unit.sleeves) drawSleeve(ctx, nearArm, Hb, fill, 1);
    ctx.restore();

    // where each shoe sits, and whether one just touched down
    const footAt = (l: Limb): Pt => (l.foot ? lerp(l.c, l.foot, 0.45) : l.c);
    const planted: "near" | "far" = r.nearLeg.c.y >= r.farLeg.c.y ? "near" : "far";
    const strikes: Pt[] = [];
    const was = this.planted.get(opts.slot);
    if (was && planted !== was) {
      const ft = footAt(planted === "near" ? near : far);
      strikes.push({ x: ft.x, y: groundY - footPad * 0.2 });
    }
    this.planted.set(opts.slot, planted);

    let emitPath: Pt[];
    if (region === "top") emitPath = torso.back;
    else if (region === "bottom") emitPath = shortsHem(hip, near, far, Hb, lean, shortLen);
    else if (region === "feet") emitPath = [footAt(far), footAt(near)];
    else emitPath = [];

    // the head as a circle, for headwear effects
    const up: Pt = { x: Math.sin(lean), y: -Math.cos(lean) };
    const fwd: Pt = { x: Math.cos(lean), y: Math.sin(lean) };
    const headR = Hb * 0.064;
    if (region === "head") {
      for (let i = 0; i <= 6; i++) {
        const th = -1.25 + (i / 6) * 2.5;
        emitPath.push({
          x: head.x + up.x * Math.cos(th) * headR + fwd.x * Math.sin(th) * headR,
          y: head.y + up.y * Math.cos(th) * headR + fwd.y * Math.sin(th) * headR,
        });
      }
    }

    // the whole body as capsules, for full-body effects
    const limb = (l: Limb, r0: number, r1: number, r2: number): [Pt, Pt, number][] => {
      const out: [Pt, Pt, number][] = [
        [l.a, l.b, Hb * r0],
        [l.b, l.c, Hb * r1],
      ];
      if (l.foot) out.push([l.c, l.foot, Hb * r2]);
      return out;
    };
    const body: [Pt, Pt, number][] = [
      ...limb(far, 0.05, 0.034, 0.02),
      ...limb(farArm, 0.026, 0.019, 0),
      [hip, sh, Hb * 0.064],
      [sh, neckTop, Hb * 0.024],
      [head, head, Hb * 0.06],
      ...limb(near, 0.05, 0.034, 0.02),
      ...limb(nearArm, 0.026, 0.019, 0),
    ];

    // body moves only vertically on screen — the stride's bounce
    return {
      path: emitPath,
      scale: Hb * 0.24,
      bodyVel: { x: 0, y: 0 },
      worldVel: { x: -runSpeed, y: 0 },
      strikes,
      head: { c: head, r: headR, up, fwd, front: false },
      core: add(lerp(hip, sh, 0.62), mul(fwd, Hb * 0.02)),
      chip:
        region === "top"
          ? add(lerp(hip, sh, 0.66), mul(fwd, Hb * 0.045))
          : region === "bottom"
            ? add(lerp(near.a, near.b, shortLen * 0.6), mul(fwd, Hb * 0.03))
            : region === "feet"
              ? footAt(near)
              : add(head, add(mul(fwd, headR * 0.7), mul(up, headR * 0.45))),
      body,
      knees: [far.b, near.b],
      region,
      torso: { neck: sh, pelvis: hip, lSh: sh, rSh: sh, up, fwd, side: true },
    };
  }

  /** A cap, visor, beanie or headband, in the unit's finish. */
  private drawHeadgear(
    ctx: CanvasRenderingContext2D,
    head: Pt,
    lean: number,
    Hb: number,
    finish: Finish,
    kind: "cap" | "band" | "visor" | "beanie",
  ) {
    const rx = Hb * 0.058;
    const ry = Hb * 0.066;
    const fill = this.shoeFill(ctx, head.x, head.y, Hb, finish);
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(lean);
    if (kind === "cap" || kind === "visor") {
      // brim first, poking out over the face
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(rx * 0.95, -ry * 0.12, rx * 0.62, ry * 0.12, 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.04, ry * 1.04, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = fill;
    // the area each piece covers, in head-local coordinates
    const cover: [number, number] =
      kind === "cap" ? [-1.2, -0.15] : kind === "beanie" ? [-1.2, 0.02] : kind === "visor" ? [-0.42, -0.14] : [-0.62, -0.26];
    ctx.fillRect(-rx * 1.2, ry * cover[0], rx * 2.4, ry * (cover[1] - cover[0]));
    if (kind === "cap") {
      // seam and button
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = Math.max(1, Hb * 0.003);
      ctx.beginPath();
      ctx.moveTo(0, -ry * 1.05);
      ctx.quadraticCurveTo(rx * 0.25, -ry * 0.6, rx * 0.2, -ry * 0.16);
      ctx.stroke();
    } else if (kind === "beanie") {
      // the folded cuff, with knit ribs
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(-rx * 1.2, -ry * 0.3, rx * 2.4, ry * 0.32);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = Math.max(1, Hb * 0.0025);
      ctx.beginPath();
      for (let x = -rx; x < rx; x += rx * 0.18) {
        ctx.moveTo(x, -ry * 0.28);
        ctx.lineTo(x, ry * 0.0);
      }
      ctx.stroke();
    }
    // sheen
    const f = (this.sheen % 2.6) / 2.6;
    const g = ctx.createLinearGradient(-rx + f * rx * 3, 0, -rx + f * rx * 3 + rx * 0.6, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, finish.id === "full-reflect" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.fillRect(-rx * 1.2, ry * cover[0], rx * 2.4, ry * (cover[1] - cover[0]));
    ctx.restore();
  }

  /** The shoe's iridescence, sliding along the ground line as it runs. */
  private shoeFill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    Hb: number,
    finish: Finish,
  ): CanvasGradient {
    const g = ctx.createLinearGradient(x - Hb * 0.32, y - Hb * 0.1, x + Hb * 0.32, y);
    const shift = frac(this.sheen * 0.35);
    const stops: [number, string][] = [];
    finish.ramp.forEach((c, i) => {
      const n = finish.ramp.length;
      stops.push([frac((i / n) * 0.5 + shift * 0.5), c]);
      stops.push([frac((i / n) * 0.5 + 0.5 + shift * 0.5), c]);
    });
    stops.sort((p, q) => p[0] - q[0]);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }

  /* ─────────────────────── gait ─────────────────────── */

  private pose(phi: number, Hb: number) {
    const thighL = Hb * 0.245;
    const shinL = Hb * 0.25;
    const upperL = Hb * 0.17;
    const foreL = Hb * 0.155;
    const torsoL = Hb * 0.3;
    const lean = 0.17;

    const hip: Pt = { x: 0, y: 0 };
    const shoulder = add(hip, { x: Math.sin(lean) * torsoL, y: -Math.cos(lean) * torsoL });
    const head = add(shoulder, { x: Math.sin(lean) * Hb * 0.1 + Hb * 0.02, y: -Hb * 0.1 });

    const leg = (p: number): Limb => {
      const th = 0.56 * Math.sin(p) - 0.06;
      const kn = 0.26 + 1.2 * Math.pow(Math.max(0, Math.cos(p + 0.45)), 1.4);
      const knee = add(hip, mul(dir(th), thighL));
      const shinA = th - kn;
      const ankle = add(knee, mul(dir(shinA), shinL));
      // foot points forward, toes dropping through swing
      const footA = shinA + Math.PI / 2 + 0.15 * Math.sin(p);
      const foot = add(ankle, mul(dir(footA), Hb * 0.075));
      return { a: hip, b: knee, c: ankle, foot };
    };

    const arm = (p: number): Limb => {
      const ua = 0.78 * Math.sin(p) - 0.05;
      const fa = ua + 1.5 + 0.22 * Math.sin(p);
      const elbow = add(shoulder, mul(dir(ua), upperL));
      const hand = add(elbow, mul(dir(fa), foreL));
      return { a: shoulder, b: elbow, c: hand };
    };

    return {
      hip,
      shoulder,
      head,
      lean,
      nearLeg: leg(phi),
      farLeg: leg(phi + Math.PI),
      // arms swing opposite their own-side leg
      nearArm: arm(phi + Math.PI),
      farArm: arm(phi),
    };
  }

  /* ─────────────────────── world ─────────────────────── */

  private drawWorld(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    groundY: number,
    finish: Finish,
    active: boolean,
  ) {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, "#070708");
    sky.addColorStop(0.75, "#0d0d11");
    sky.addColorStop(1, "#15141a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // horizon glow takes the finish's color once a unit is live
    const glow = ctx.createRadialGradient(W * 0.5, groundY, 0, W * 0.5, groundY, W * 0.7);
    glow.addColorStop(0, hexA(finish.accent, active ? 0.16 : 0.06));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, groundY);

    // skyline, slow parallax
    const unitW = Math.max(W, 700);
    const span = this.skylineWidth * unitW;
    const sx = -((this.scroll * 0.06) % span);
    ctx.fillStyle = "#0e0e12";
    for (let rep = 0; rep < 3; rep++) {
      const base = sx + rep * span;
      if (base > W) break;
      for (const b of this.skyline) {
        const x = base + b.x * unitW;
        const w = b.w * unitW;
        if (x > W || x + w < 0) continue;
        const h = b.h * H;
        ctx.fillRect(x, groundY - h, w, h);
        // a few lit windows
        ctx.fillStyle = "rgba(255,190,120,0.16)";
        for (let j = 0; j < b.lit.length; j++) {
          if (b.lit[j] > 0.55) continue;
          ctx.fillRect(x + w * (0.2 + (j % 2) * 0.45), groundY - h + h * (0.15 + j * 0.13), 2, 2);
        }
        ctx.fillStyle = "#0e0e12";
      }
      // the needle-and-saucer tower
      const tx = base + span * 0.42;
      if (tx > -60 && tx < W + 60) {
        const th = H * 0.36;
        ctx.fillRect(tx - 3, groundY - th, 6, th);
        ctx.beginPath();
        ctx.ellipse(tx, groundY - th, 22, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(tx - 1, groundY - th - 30, 2, 24);
        ctx.fillStyle = "rgba(255,92,26,0.8)";
        ctx.fillRect(tx - 1.5, groundY - th - 32, 3, 3);
        ctx.fillStyle = "#0e0e12";
      }
    }

    // road
    const road = ctx.createLinearGradient(0, groundY, 0, H);
    road.addColorStop(0, "#111115");
    road.addColorStop(1, "#060607");
    ctx.fillStyle = road;
    ctx.fillRect(0, groundY, W, H - groundY);

    ctx.strokeStyle = "rgba(239,234,225,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(W, groundY + 0.5);
    ctx.stroke();

    // lane dashes — nearer rows move faster
    const rows = [0.25, 0.55, 0.9];
    rows.forEach((r, i) => {
      const y = groundY + (H - groundY) * r;
      const speed = 1 + i * 0.6;
      const dash = 46 + i * 30;
      const gap = 70 + i * 50;
      const period = dash + gap;
      const o = -((this.scroll * speed) % period);
      ctx.strokeStyle = `rgba(239,234,225,${0.08 + i * 0.04})`;
      ctx.lineWidth = 1 + i;
      ctx.beginPath();
      for (let x = o; x < W; x += period) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + dash, y);
      }
      ctx.stroke();
    });
  }

  /* ─────────────────────── garment ─────────────────────── */

  /** Iridescence: the ramp slides across the fabric as the body moves. */
  private garmentFill(
    ctx: CanvasRenderingContext2D,
    hip: Pt,
    sh: Pt,
    Hb: number,
    finish: Finish,
  ): CanvasGradient {
    const shift = frac(this.sheen * 0.18 + Math.sin(this.phase) * 0.06);
    const a = Math.sin(this.phase * 0.5) * 0.3;
    const cx = (hip.x + sh.x) / 2;
    const cy = (hip.y + sh.y) / 2;
    const L = Hb * 0.35;
    const g = ctx.createLinearGradient(
      cx - Math.cos(0.9 + a) * L,
      cy - Math.sin(0.9 + a) * L,
      cx + Math.cos(0.9 + a) * L,
      cy + Math.sin(0.9 + a) * L,
    );
    const ramp = finish.ramp;
    const stops: [number, string][] = [];
    const n = ramp.length;
    for (let rep = 0; rep < 2; rep++) {
      for (let i = 0; i < n; i++) {
        const o = (i / n) * 0.5 + rep * 0.5 + shift * 0.5;
        stops.push([frac(o), ramp[i]]);
      }
    }
    stops.sort((p, q) => p[0] - q[0]);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }

  private garmentSheen(
    ctx: CanvasRenderingContext2D,
    clip: Path2D,
    hip: Pt,
    sh: Pt,
    Hb: number,
    finish: Finish,
  ) {
    ctx.save();
    ctx.clip(clip);
    const reflect = finish.id === "full-reflect";
    // a band of light travelling down the fabric; on Full Reflect it
    // is a headlight, and the fabric goes white-hot under it
    const period = reflect ? 2.4 : 3.2;
    const f = (this.sheen % period) / period;
    const y = sh.y - Hb * 0.1 + f * Hb * 0.55;
    const g = ctx.createLinearGradient(0, y - Hb * 0.08, 0, y + Hb * 0.08);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${reflect ? 0.85 : 0.28})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = reflect ? "lighter" : "screen";
    ctx.fillStyle = g;
    ctx.fillRect(hip.x - Hb * 0.3, sh.y - Hb * 0.2, Hb * 0.6, Hb * 0.7);

    if (finish.id === "deep-space") {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 9; i++) {
        const tw = Math.sin(this.sheen * 3 + i * 1.7);
        if (tw < 0.2) continue;
        const px = hip.x - Hb * 0.06 + ((i * 37) % 13) / 13 * Hb * 0.14;
        const py = sh.y + ((i * 53) % 17) / 17 * Hb * 0.3;
        ctx.globalAlpha = tw;
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    }
    ctx.restore();
  }

  private garmentSheenStroke(ctx: CanvasRenderingContext2D, leg: Limb, Hb: number, finish: Finish) {
    if (finish.id !== "bone-pearl") return;
    const f = (Math.sin(this.sheen * 2) + 1) / 2;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + f * 0.18})`;
    ctx.lineWidth = Hb * 0.02;
    ctx.lineCap = "round";
    const m = lerp(leg.a, leg.b, 0.15);
    const e = lerp(leg.a, leg.b, 0.28);
    ctx.beginPath();
    ctx.moveTo(m.x - Hb * 0.015, m.y);
    ctx.lineTo(e.x - Hb * 0.015, e.y);
    ctx.stroke();
    ctx.restore();
  }
}

/* ─────────────────────────── drawing helpers ─────────────────── */

function mapLimb(l: Limb, T: (p: Pt) => Pt): Limb {
  return { a: T(l.a), b: T(l.b), c: T(l.c), foot: l.foot ? T(l.foot) : undefined };
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * A tapered capsule: two circles joined by their outer tangents. Every
 * limb is built from these, which is what makes the runner read as a
 * body rather than a stick figure.
 */
function capsule(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  ra: number,
  rb: number,
  fill: string | CanvasGradient,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const d = Math.asin(Math.max(-1, Math.min(1, (ra - rb) / L)));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(a.x, a.y, ra, ang + Math.PI / 2 + d, ang + (3 * Math.PI) / 2 - d);
  ctx.arc(b.x, b.y, rb, ang - Math.PI / 2 - d, ang + Math.PI / 2 + d);
  ctx.closePath();
  ctx.fill();
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  l: Limb,
  Hb: number,
  color: string,
  shoe: string | CanvasGradient,
  hero: boolean,
) {
  // thigh, then a calf that swells before it narrows to the ankle
  capsule(ctx, l.a, l.b, Hb * 0.058, Hb * 0.036, color);
  const calf = lerp(l.b, l.c, 0.32);
  capsule(ctx, l.b, calf, Hb * 0.036, Hb * 0.039, color);
  capsule(ctx, calf, l.c, Hb * 0.039, Hb * 0.019, color);
  if (!l.foot) return;

  const heel = add(l.c, mul({ x: l.c.x - l.foot.x, y: l.c.y - l.foot.y }, 0.22));
  const shadow = ctx.shadowBlur;
  // the hero shoe is a size up and carries the finish
  const k = hero ? 1.22 : 1;
  capsule(ctx, heel, l.foot, Hb * 0.026 * k, Hb * 0.017 * k, shoe);
  ctx.shadowBlur = 0;

  // sole line: heat-orange hardware, white on the hero shoe
  const n = { x: -(l.foot.y - heel.y), y: l.foot.x - heel.x };
  const m = Math.hypot(n.x, n.y) || 1;
  const o = mul({ x: n.x / m, y: n.y / m }, -Hb * 0.018 * k);
  ctx.strokeStyle = hero ? "rgba(255,248,235,0.95)" : "rgba(255,92,26,0.85)";
  ctx.lineWidth = Math.max(1, Hb * (hero ? 0.009 : 0.006));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(heel.x + o.x, heel.y + o.y);
  ctx.lineTo(l.foot.x + o.x * 0.7, l.foot.y + o.y * 0.7);
  ctx.stroke();

  if (hero) {
    // the chip lives in the heel tab — a small lit tag says so
    const tab = add(heel, mul({ x: n.x / m, y: n.y / m }, Hb * 0.02));
    ctx.fillStyle = "rgba(255,248,235,0.9)";
    ctx.beginPath();
    ctx.arc(tab.x, tab.y, Math.max(1.2, Hb * 0.006), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = shadow;
}

/**
 * One leg of the short: a tapered panel from the waistband to the hem,
 * following the thigh. Two of these read as shorts; the old rounded
 * capsules read as padding.
 */
function shortPanel(
  ctx: CanvasRenderingContext2D,
  hip: Pt,
  leg: Limb,
  len: number,
  Hb: number,
  lean: number,
  fill: string | CanvasGradient,
) {
  const f: Pt = { x: Math.cos(lean), y: Math.sin(lean) }; // toward the chest
  const up: Pt = { x: Math.sin(lean), y: -Math.cos(lean) };
  const waist = add(hip, mul(up, Hb * 0.03));
  const wBack = add(waist, mul(f, -Hb * 0.074));
  const wFront = add(waist, mul(f, Hb * 0.062));
  const hem = lerp(leg.a, leg.b, len);
  const dx = leg.b.x - leg.a.x;
  const dy = leg.b.y - leg.a.y;
  const m = Math.hypot(dx, dy) || 1;
  let n: Pt = { x: -dy / m, y: dx / m };
  if (n.x * f.x + n.y * f.y < 0) n = mul(n, -1);
  const hFront = add(hem, mul(n, Hb * 0.05));
  const hBack = add(hem, mul(n, -Hb * 0.05));

  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(wBack.x, wBack.y);
  ctx.lineTo(wFront.x, wFront.y);
  // a slight bow down the front of the thigh
  const mf = lerp(wFront, hFront, 0.5);
  ctx.quadraticCurveTo(mf.x + n.x * Hb * 0.008, mf.y + n.y * Hb * 0.008, hFront.x, hFront.y);
  ctx.lineTo(hBack.x, hBack.y);
  const mb = lerp(hBack, wBack, 0.5);
  ctx.quadraticCurveTo(mb.x - n.x * Hb * 0.012, mb.y - n.y * Hb * 0.012, wBack.x, wBack.y);
  ctx.closePath();
  ctx.fill();
}

function drawArm(ctx: CanvasRenderingContext2D, l: Limb, Hb: number, color: string) {
  capsule(ctx, l.a, l.b, Hb * 0.03, Hb * 0.022, color);
  capsule(ctx, l.b, l.c, Hb * 0.022, Hb * 0.016, color);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(l.c.x, l.c.y, Hb * 0.021, 0, Math.PI * 2);
  ctx.fill();
}

function torsoPath(hip: Pt, sh: Pt, lean: number, Hb: number) {
  // f: toward the chest; the torso axis runs hip → shoulder
  const f: Pt = { x: Math.cos(lean), y: Math.sin(lean) };
  const at = (t: number, side: number, w: number): Pt => {
    const p = lerp(hip, sh, t);
    return add(p, mul(f, side * w * Hb));
  };

  const path = new Path2D();
  const bHip = at(-0.05, -1, 0.07);
  const bMid = at(0.5, -1, 0.05);
  const bSh = at(1.0, -1, 0.06);
  const fSh = at(1.0, 1, 0.055);
  const chest = at(0.72, 1, 0.075);
  const belly = at(0.3, 1, 0.058);
  const fHip = at(-0.05, 1, 0.06);
  path.moveTo(bHip.x, bHip.y);
  path.quadraticCurveTo(bMid.x - Hb * 0.012, bMid.y, bSh.x, bSh.y);
  path.quadraticCurveTo((bSh.x + fSh.x) / 2, Math.min(bSh.y, fSh.y) - Hb * 0.03, fSh.x, fSh.y);
  path.quadraticCurveTo(chest.x + Hb * 0.01, chest.y, belly.x, belly.y);
  path.quadraticCurveTo(fHip.x + Hb * 0.004, fHip.y - Hb * 0.02, fHip.x, fHip.y);
  path.closePath();

  // the garment: same body, hem a touch below the hip, scoop neck
  const garment = new Path2D();
  const gbHip = at(-0.1, -1, 0.074);
  const gfHip = at(-0.1, 1, 0.064);
  const gbSh = at(0.98, -1, 0.062);
  const neckF = at(0.84, 1, 0.05);
  garment.moveTo(gbHip.x, gbHip.y);
  garment.quadraticCurveTo(bMid.x - Hb * 0.014, bMid.y, gbSh.x, gbSh.y);
  garment.quadraticCurveTo(
    (gbSh.x + neckF.x) / 2,
    Math.min(gbSh.y, neckF.y) - Hb * 0.012,
    neckF.x,
    neckF.y,
  );
  garment.quadraticCurveTo(chest.x + Hb * 0.012, chest.y, belly.x + Hb * 0.002, belly.y);
  garment.quadraticCurveTo(gfHip.x + Hb * 0.006, gfHip.y - Hb * 0.02, gfHip.x, gfHip.y);
  garment.closePath();

  // emission edge: the back panel, shoulder blade to hem
  const back: Pt[] = [];
  for (let i = 0; i <= 6; i++) back.push(at(-0.05 + (i / 6) * 1.0, -1, 0.068));
  back.push(at(1.0, 0, 0)); // and the top of the shoulders

  return { path, garment, back };
}

function shortsHem(hip: Pt, near: Limb, far: Limb, Hb: number, lean: number, len: number): Pt[] {
  const nh = lerp(near.a, near.b, len);
  const fh = lerp(far.a, far.b, len);
  const back = add(hip, { x: -Math.cos(lean) * Hb * 0.08, y: Hb * 0.01 });
  // the hem of both legs plus the seat — mist rolls off all of it
  return [
    { x: fh.x - Hb * 0.045, y: fh.y },
    { x: fh.x + Hb * 0.045, y: fh.y },
    back,
    { x: nh.x - Hb * 0.05, y: nh.y },
    { x: nh.x + Hb * 0.05, y: nh.y },
  ];
}

function drawSleeve(
  ctx: CanvasRenderingContext2D,
  arm: Limb,
  Hb: number,
  fill: string | CanvasGradient,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  capsule(ctx, arm.a, lerp(arm.a, arm.b, 0.42), Hb * 0.04, Hb * 0.032, fill);
  ctx.restore();
}

/** fractional part, always in [0, 1) — gradient stops reject negatives */
function frac(v: number) {
  return ((v % 1) + 1) % 1;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
