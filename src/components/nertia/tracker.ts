/**
 * Live camera → body landmarks → the same Emitter the demo runner
 * produces. MediaPipe's pose model runs fully in the browser on
 * WebAssembly (GPU where available); no frame leaves the device.
 */

import type { PoseLandmarker as PoseLandmarkerT } from "@mediapipe/tasks-vision";
import type { Region } from "@/lib/nertia";
import type { Emitter, Vec } from "./effects";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// BlazePose indices
const L_SH = 11;
const R_SH = 12;
const L_HIP = 23;
const R_HIP = 24;
const L_KNEE = 25;
const R_KNEE = 26;
const USED = [L_SH, R_SH, L_HIP, R_HIP, L_KNEE, R_KNEE];

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

export class PoseTracker {
  private lm: PoseLandmarkerT;
  private smooth = new Map<number, Vec>();
  private lastCenter: Vec | null = null;
  private vel: Vec = { x: 0, y: 0 };
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
        numPoses: 1,
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
   * Returns null when the garment's region is not in frame — the
   * caller shows a framing hint instead of guessing.
   */
  detect(video: HTMLVideoElement, ts: number, fit: Fit, region: Region): BodyFrame | null {
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    const dt = this.lastTs ? Math.min(0.1, (ts - this.lastTs) / 1000) : 1 / 30;
    this.lastTs = ts;

    const res = this.lm.detectForVideo(video, ts);
    const pose = res.landmarks?.[0];
    if (!pose) {
      this.smooth.clear();
      this.lastCenter = null;
      return null;
    }

    const need = region === "top" ? [L_SH, R_SH, L_HIP, R_HIP] : [L_HIP, R_HIP, L_KNEE, R_KNEE];
    for (const i of need) {
      if ((pose[i].visibility ?? 1) < 0.45) return null;
    }

    // screen-space, smoothed: landmarks jitter a few px a frame and
    // fire emitted from a jittering edge looks like static
    const P: Record<number, Vec> = {};
    for (const i of USED) {
      const l = pose[i];
      let x = fit.ox + l.x * fit.vw * fit.s;
      const y = fit.oy + l.y * fit.vh * fit.s;
      if (fit.mirror) x = 2 * (fit.ox + (fit.vw * fit.s) / 2) - x;
      const prev = this.smooth.get(i);
      const k = 0.5;
      const v = prev ? { x: prev.x + (x - prev.x) * k, y: prev.y + (y - prev.y) * k } : { x, y };
      this.smooth.set(i, v);
      P[i] = v;
    }

    const shoulderW = dist(P[L_SH], P[R_SH]);
    const hipW = dist(P[L_HIP], P[R_HIP]);

    let path: Vec[];
    let fabric: Vec[];
    let scale: number;
    let center: Vec;

    if (region === "top") {
      scale = Math.max(shoulderW, hipW * 1.2, 30);
      const neck = mid(P[L_SH], P[R_SH]);
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
      center = mid(neck, mid(P[L_HIP], P[R_HIP]));
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
      center = mid(P[L_HIP], P[R_HIP]);
    }

    if (this.lastCenter) {
      const vx = (center.x - this.lastCenter.x) / dt;
      const vy = (center.y - this.lastCenter.y) / dt;
      const k = 1 - Math.exp(-8 * dt);
      this.vel.x += (vx - this.vel.x) * k;
      this.vel.y += (vy - this.vel.y) * k;
    }
    this.lastCenter = center;

    return {
      emitter: {
        path,
        scale,
        bodyVel: { ...this.vel },
        // the phone is still, so the air is still
        worldVel: { x: 0, y: 0 },
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
