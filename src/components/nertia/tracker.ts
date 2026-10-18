/**
 * Live camera → body landmarks → the same Emitter the demo runner
 * produces. MediaPipe's pose model runs fully in the browser on
 * WebAssembly (GPU where available); no frame leaves the device.
 *
 * Tracks up to two people, so two NERTIA units in frame can link.
 */

import type { PoseLandmarker as PoseLandmarkerT, NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Region } from "@/lib/nertia";
import type { Emitter, Vec } from "./effects";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// BlazePose indices
const NOSE = 0;
const L_EYE = 2;
const R_EYE = 5;
const L_EAR = 7;
const R_EAR = 8;
const L_SH = 11;
const R_SH = 12;
const L_EL = 13;
const R_EL = 14;
const L_WR = 15;
const R_WR = 16;
const L_HIP = 23;
const R_HIP = 24;
const L_KNEE = 25;
const R_KNEE = 26;
const L_ANK = 27;
const R_ANK = 28;
const L_HEEL = 29;
const R_HEEL = 30;
const L_TOE = 31;
const R_TOE = 32;
const USED = [
  NOSE, L_EYE, R_EYE, L_EAR, R_EAR, L_SH, R_SH, L_EL, R_EL, L_WR, R_WR,
  L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANK, R_ANK, L_HEEL, R_HEEL, L_TOE, R_TOE,
];

export type Fit = { s: number; ox: number; oy: number; vw: number; vh: number; mirror: boolean };

/** Where the video lands on the canvas when drawn object-fit: cover. */
export function coverFit(vw: number, vh: number, W: number, H: number, mirror: boolean): Fit {
  const s = Math.max(W / vw, H / vh);
  return { s, ox: (W - vw * s) / 2, oy: (H - vh * s) / 2, vw, vh, mirror };
}

export type BodyFrame = {
  emitter: Emitter;
  /** torso quad (top garments) or hips→hem quad (shorts), for the fabric sheen */
  fabric: Vec[];
};

/** Per-person smoothing and motion state. Slot 0 is the leftmost person. */
type Track = {
  smooth: Map<number, Vec>;
  lastCenter: Vec | null;
  vel: Vec;
  feet: { y: number; vy: number; cool: number; seen: boolean }[];
};

const newTrack = (): Track => ({
  smooth: new Map(),
  lastCenter: null,
  vel: { x: 0, y: 0 },
  feet: [
    { y: 0, vy: 0, cool: 0, seen: false },
    { y: 0, vy: 0, cool: 0, seen: false },
  ],
});

export class PoseTracker {
  private lm: PoseLandmarkerT;
  private tracks: Track[] = [newTrack(), newTrack()];
  private lastTs = 0;

  private constructor(lm: PoseLandmarkerT) {
    this.lm = lm;
  }

  static async create(): Promise<PoseTracker> {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "VIDEO",
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return new PoseTracker(await make("GPU"));
    } catch {
      // some phones expose WebGL but not the extensions the GPU path needs
      return new PoseTracker(await make("CPU"));
    }
  }

  /**
   * One entry per person in frame, left to right; null where that
   * person's garment region isn't visible (the caller shows a framing
   * hint instead of guessing).
   */
  detect(video: HTMLVideoElement, ts: number, fit: Fit, region: Region): (BodyFrame | null)[] {
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    const dt = this.lastTs ? Math.min(0.1, (ts - this.lastTs) / 1000) : 1 / 30;
    this.lastTs = ts;

    const res = this.lm.detectForVideo(video, ts);
    // sort people left to right so slot 0 stays the same person
    const poses = [...(res.landmarks ?? [])]
      .map((p) => ({ p, x: (p[L_SH].x + p[R_SH].x + p[L_HIP].x + p[R_HIP].x) / 4 }))
      .sort((a, b) => (fit.mirror ? b.x - a.x : a.x - b.x))
      .map((o) => o.p);

    const out: (BodyFrame | null)[] = [];
    for (let i = 0; i < 2; i++) {
      if (!poses[i]) {
        const t = this.tracks[i];
        t.smooth.clear();
        t.lastCenter = null;
        t.feet.forEach((f) => (f.seen = false));
        continue;
      }
      out.push(this.frame(poses[i], this.tracks[i], dt, fit, region));
    }
    return out;
  }

  private frame(
    pose: NormalizedLandmark[],
    track: Track,
    dt: number,
    fit: Fit,
    region: Region,
  ): BodyFrame | null {
    const vis = (i: number, min = 0.45) => (pose[i].visibility ?? 1) >= min;
    const need =
      region === "top"
        ? [L_SH, R_SH, L_HIP, R_HIP]
        : region === "bottom"
          ? [L_HIP, R_HIP, L_KNEE, R_KNEE]
          : region === "feet"
            ? [L_ANK, R_ANK, L_TOE, R_TOE]
            : [NOSE];
    for (const i of need) if (!vis(i)) return null;

    // screen-space, smoothed: landmarks jitter a few px a frame and
    // fire emitted from a jittering edge looks like static
    const P: Record<number, Vec> = {};
    for (const i of USED) {
      const l = pose[i];
      let x = fit.ox + l.x * fit.vw * fit.s;
      const y = fit.oy + l.y * fit.vh * fit.s;
      if (fit.mirror) x = 2 * (fit.ox + (fit.vw * fit.s) / 2) - x;
      const prev = track.smooth.get(i);
      const k = 0.5;
      const v = prev ? { x: prev.x + (x - prev.x) * k, y: prev.y + (y - prev.y) * k } : { x, y };
      track.smooth.set(i, v);
      P[i] = v;
    }

    const shoulderW = dist(P[L_SH], P[R_SH]);
    const hipW = dist(P[L_HIP], P[R_HIP]);
    const neck = mid(P[L_SH], P[R_SH]);
    const pelvis = mid(P[L_HIP], P[R_HIP]);
    const torsoLen = dist(neck, pelvis);
    const up = torsoLen > 4 ? norm(sub(neck, pelvis)) : { x: 0, y: -1 };
    const across = { x: -up.y, y: up.x };

    let path: Vec[];
    let fabric: Vec[];
    let scale: number;
    let center: Vec;
    let strikes: Vec[] | undefined;
    let head: Emitter["head"];

    if (region === "head") {
      // at least one ear, or a side-on head has nothing to anchor to
      if (!vis(L_EAR, 0.35) && !vis(R_EAR, 0.35)) return null;
      const earMid =
        vis(L_EAR, 0.35) && vis(R_EAR, 0.35) ? mid(P[L_EAR], P[R_EAR]) : vis(L_EAR, 0.35) ? P[L_EAR] : P[R_EAR];
      const c = lerp(earMid, P[NOSE], 0.25);
      const r = Math.max(
        dist(P[L_EAR], P[R_EAR]) * 0.6,
        dist(P[L_EYE], P[R_EYE]) * 1.6,
        dist(P[NOSE], earMid) * 1.1,
        20,
      );
      const hup = vis(L_SH, 0.4) && vis(R_SH, 0.4) ? norm(sub(c, neck)) : { x: 0, y: -1 };
      // facing: the nose's offset from the ears, across the up axis
      const side = { x: -hup.y, y: hup.x };
      const toNose = sub(P[NOSE], earMid);
      const d = toNose.x * side.x + toNose.y * side.y;
      const front = Math.abs(d) <= r * 0.3;
      const fwd = !front && d < 0 ? mul(side, -1) : side;

      scale = r / 0.27; // matches the demo runner's head-to-scale ratio
      head = { c, r, up: hup, fwd, front };
      path = [];
      for (let i = 0; i <= 6; i++) {
        const th = -1.25 + (i / 6) * 2.5;
        path.push(add(c, add(mul(hup, Math.cos(th) * r), mul(fwd, Math.sin(th) * r))));
      }
      fabric = [];
      center = c;
    } else if (region === "feet") {
      // shoe size sets the scale; fall back to ankle spacing when the
      // feet are side-on and the heel-to-toe line is foreshortened
      const shoeL = Math.max(dist(P[L_HEEL], P[L_TOE]), dist(P[R_HEEL], P[R_TOE]));
      scale = Math.max(shoeL * 2.2, dist(P[L_ANK], P[R_ANK]) * 0.8, 30);
      const lf = lerp(P[L_HEEL], P[L_TOE], 0.5);
      const rf = lerp(P[R_HEEL], P[R_TOE], 0.5);
      path = [lf, rf];
      fabric = [];
      center = mid(lf, rf);

      // touchdown: a foot that was dropping fast and has just stopped
      const hits: Vec[] = [];
      [lf, rf].forEach((f, i) => {
        const st = track.feet[i];
        if (st.seen) {
          const v = (f.y - st.y) / dt;
          const wasFalling = st.vy > scale * 1.4;
          st.vy += (v - st.vy) * (1 - Math.exp(-14 * dt));
          st.cool -= dt;
          if (wasFalling && st.vy < scale * 0.35 && st.cool <= 0) {
            hits.push({ ...f });
            st.cool = 0.22;
          }
        }
        st.y = f.y;
        st.seen = true;
      });
      strikes = hits;
    } else if (region === "top") {
      scale = Math.max(shoulderW, hipW * 1.2, 30);
      // flame line: down each side and across the shoulders
      const lift = { x: 0, y: -scale * 0.06 };
      path = [
        P[L_HIP],
        mid(P[L_HIP], P[L_SH]),
        P[L_SH],
        add(neck, lift),
        P[R_SH],
        mid(P[R_HIP], P[R_SH]),
        P[R_HIP],
      ];
      // widen the fabric a touch past the joints — landmarks sit inside the body
      fabric = expand([P[L_SH], P[R_SH], P[R_HIP], P[L_HIP]], 1.12);
      center = mid(neck, pelvis);
    } else {
      scale = Math.max(hipW * 1.6, 30);
      const lh = lerp(P[L_HIP], P[L_KNEE], 0.38);
      const rh = lerp(P[R_HIP], P[R_KNEE], 0.38);
      const w = hipW * 0.45;
      const side = norm(sub(P[L_HIP], P[R_HIP]));
      path = [
        add(lh, mul(side, w)),
        add(lh, mul(side, -w * 0.4)),
        add(rh, mul(side, w * 0.4)),
        add(rh, mul(side, -w)),
      ];
      fabric = expand([P[L_HIP], P[R_HIP], add(rh, mul(side, -w)), add(lh, mul(side, w))], 1.1);
      center = pelvis;
    }

    if (track.lastCenter) {
      const vx = (center.x - track.lastCenter.x) / dt;
      const vy = (center.y - track.lastCenter.y) / dt;
      const k = 1 - Math.exp(-8 * dt);
      track.vel.x += (vx - track.vel.x) * k;
      track.vel.y += (vy - track.vel.y) * k;
    }
    track.lastCenter = center;

    // whole body as capsules — only the parts the camera can see
    const unit = Math.max(shoulderW, hipW, torsoLen * 0.45, 20);
    const body: [Vec, Vec, number][] = [];
    const seg = (a: number, b: number, r: number) => {
      if (vis(a, 0.4) && vis(b, 0.4)) body.push([P[a], P[b], unit * r]);
    };
    seg(L_SH, L_EL, 0.13);
    seg(L_EL, L_WR, 0.1);
    seg(R_SH, R_EL, 0.13);
    seg(R_EL, R_WR, 0.1);
    seg(L_HIP, L_KNEE, 0.2);
    seg(L_KNEE, L_ANK, 0.14);
    seg(R_HIP, R_KNEE, 0.2);
    seg(R_KNEE, R_ANK, 0.14);
    if (vis(L_SH, 0.4) && vis(R_SH, 0.4) && vis(L_HIP, 0.4) && vis(R_HIP, 0.4)) {
      body.push([lerp(neck, pelvis, 0.12), lerp(neck, pelvis, 0.9), Math.max(shoulderW, hipW) * 0.5]);
    }
    if (vis(NOSE, 0.4)) body.push([P[NOSE], P[NOSE], unit * 0.32]);

    // side-on when the shoulders overlap; facing direction from the nose
    const sideOn = shoulderW < torsoLen * 0.38;
    const nd = (P[NOSE].x - neck.x) * across.x + (P[NOSE].y - neck.y) * across.y;
    const fwd = sideOn && nd < 0 ? mul(across, -1) : across;

    return {
      emitter: {
        path,
        scale,
        bodyVel: { ...track.vel },
        // the phone is still, so the air is still
        worldVel: { x: 0, y: 0 },
        strikes,
        head,
        core: lerp(neck, pelvis, 0.32),
        chip:
          region === "top"
            ? lerp(neck, pelvis, 0.3)
            : region === "bottom"
              ? lerp(P[L_HIP], P[L_KNEE], 0.3)
              : region === "feet"
                ? path[0]
                : head
                  ? add(head.c, mul(head.up, head.r * 0.6))
                  : neck,
        body,
        torso: { neck, pelvis, lSh: P[L_SH], rSh: P[R_SH], up, fwd, side: sideOn },
      },
      fabric,
    };
  }

  close() {
    this.lm.close();
  }
}

/* ─────────────────────────── vec ─────────────────────────── */

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (a: Vec): Vec => {
  const m = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / m, y: a.y / m };
};
function expand(poly: Vec[], k: number): Vec[] {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;
  return poly.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}
