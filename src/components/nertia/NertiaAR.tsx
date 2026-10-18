"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  categoryOf,
  finishes,
  units,
  unitEffect,
  unitLabel,
  type Category,
  type Unit,
} from "@/lib/nertia";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "apparel", label: "Apparel" },
  { id: "footwear", label: "Footwear" },
  { id: "headwear", label: "Headwear" },
];
import { createEffect, type Effect, type Emitter, type Vec } from "./effects";
import { DemoScene } from "./runner";
import { coverFit, PoseTracker } from "./tracker";

type Mode = "demo" | "camera";
type Chip = "idle" | "reading" | "live";
type CamState =
  | { kind: "off" }
  | { kind: "loading"; note: string }
  | { kind: "on" }
  | { kind: "error"; note: string };

const READ_MS = 950;

type Props = {
  /** false hides the camera source — for hosts that can't grant a camera */
  allowCamera?: boolean;
  /**
   * Hand the still to the host instead of starting a browser download
   * (sandboxed hosts block <a download>). Return false to hide the button.
   */
  saveStill?: ((png: Blob, filename: string) => void) | false;
};

export default function NertiaAR({ allowCamera = true, saveStill }: Props = {}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [mode, setMode] = useState<Mode>("demo");
  const [unit, setUnit] = useState<Unit>(units[0]);
  const [chip, setChip] = useState<Chip>("idle");
  const [cam, setCam] = useState<CamState>({ kind: "off" });
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [inFrame, setInFrame] = useState(true);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [cat, setCat] = useState<Category>("apparel");

  // The render loop reads these through refs so React re-renders never
  // restart it.
  const live = useRef({
    mode: "demo" as Mode,
    unit: units[0],
    chip: "idle" as Chip,
    facing: "user" as "user" | "environment",
    intensity: 0,
    paused: false,
    visible: true,
  });
  useEffect(() => {
    Object.assign(live.current, { mode, unit, chip, facing, paused });
  }, [mode, unit, chip, facing, paused]);

  const effectRef = useRef<{ id: string; fx: Effect } | null>(null);
  const sceneRef = useRef<DemoScene | null>(null);
  const trackerRef = useRef<PoseTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastEmitter = useRef<Emitter | null>(null);
  const igniteNext = useRef(false);
  const readTimer = useRef<number | null>(null);
  const inFrameRef = useRef(true);

  /* ───────────────────── the tap ───────────────────── */

  const tap = useCallback((u: Unit) => {
    setTouched(true);
    setUnit(u);
    setChip("reading");
    live.current.intensity = 0;
    if (readTimer.current) window.clearTimeout(readTimer.current);
    readTimer.current = window.setTimeout(() => {
      setChip("live");
      igniteNext.current = true;
    }, READ_MS);
  }, []);

  // Read the first chip by itself once the stage is in view, so a
  // visitor who only scrolls still sees the system work.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPaused(true);
      return;
    }
    const el = stageRef.current;
    if (!el) return;
    let fired = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !fired) {
          fired = true;
          window.setTimeout(() => {
            if (live.current.chip === "idle") tap(units[0]);
          }, 1400);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tap]);

  /* ───────────────────── camera ───────────────────── */

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (face: "user" | "environment") => {
      setCam({ kind: "loading", note: "Asking for the camera" });
      if (!navigator.mediaDevices?.getUserMedia) {
        setCam({ kind: "error", note: "This browser can't open a camera here. The demo runner still works." });
        setMode("demo");
        return;
      }
      try {
        stopCamera();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();

        if (!trackerRef.current) {
          setCam({ kind: "loading", note: "Loading body tracking" });
          trackerRef.current = await PoseTracker.create();
        }
        setCam({ kind: "on" });
      } catch (err) {
        stopCamera();
        const name = err instanceof DOMException ? err.name : "";
        const note =
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser settings, or stay on the demo runner."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera found on this device. The demo runner still works."
              : "Couldn't start body tracking on this device. The demo runner still works.";
        setCam({ kind: "error", note });
        setMode("demo");
      }
    },
    [stopCamera],
  );

  const chooseMode = (m: Mode) => {
    setTouched(true);
    if (m === mode) return;
    setMode(m);
    effectRef.current?.fx.clear();
    if (m === "camera") {
      void startCamera(facing);
    } else {
      stopCamera();
      setCam({ kind: "off" });
    }
  };

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    effectRef.current?.fx.clear();
    void startCamera(next);
  };

  useEffect(
    () => () => {
      stopCamera();
      trackerRef.current?.close();
      if (readTimer.current) window.clearTimeout(readTimer.current);
    },
    [stopCamera],
  );

  /* ───────────────────── pause offscreen ───────────────────── */

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      live.current.visible = e.isIntersecting;
    });
    io.observe(el);
    const onVis = () => {
      live.current.visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  /* ───────────────────── the loop ───────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    sceneRef.current = new DemoScene();
    let raf = 0;
    let last = performance.now();
    let W = 0;
    let H = 0;
    let dpr = 1;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      // phones get a lower ceiling: fill-rate, not geometry, is the cost
      dpr = Math.min(window.devicePixelRatio || 1, r.width < 700 ? 1.6 : 2);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = live.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!L.visible) return;
      if (L.paused) {
        // keep the frame on screen, just don't advance it
        return;
      }

      const finish = finishes[L.unit.finish];

      // one effect instance per finish, swapped on tap
      const fxId = unitEffect(L.unit).id;
      if (!effectRef.current || effectRef.current.id !== fxId) {
        effectRef.current = { id: fxId, fx: createEffect(fxId) };
      }
      const fx = effectRef.current.fx;

      const target = L.chip === "live" ? 1 : 0;
      L.intensity += (target - L.intensity) * (1 - Math.exp(-(target ? 2.4 : 6) * dt));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      let emitter: Emitter | null = null;

      if (L.mode === "demo") {
        const f = sceneRef.current!.frame(ctx, W, H, dt, L.unit, finish, L.chip === "live");
        emitter = f.emitter;
      } else {
        const v = videoRef.current;
        ctx.fillStyle = "#070708";
        ctx.fillRect(0, 0, W, H);
        if (v && v.readyState >= 2 && v.videoWidth) {
          const mirror = L.facing === "user";
          const fit = coverFit(v.videoWidth, v.videoHeight, W, H, mirror);
          ctx.save();
          if (mirror) {
            ctx.translate(W, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(v, fit.ox, fit.oy, fit.vw * fit.s, fit.vh * fit.s);
          ctx.restore();
          // grade the feed down so the light reads
          ctx.fillStyle = "rgba(7,6,5,0.28)";
          ctx.fillRect(0, 0, W, H);

          const tr = trackerRef.current;
          if (tr) {
            const body = tr.detect(v, now, fit, L.unit.region);
            const ok = !!body;
            if (ok !== inFrameRef.current) {
              inFrameRef.current = ok;
              setInFrame(ok);
            }
            if (body) {
              emitter = body.emitter;
              if (L.intensity > 0.02) drawFabric(ctx, body.fabric, finish.ramp, now, L.intensity);
            }
          }
        }
      }

      if (emitter) lastEmitter.current = emitter;
      if (igniteNext.current && emitter) {
        igniteNext.current = false;
        fx.ignite(emitter);
      }

      fx.update(dt, emitter, L.intensity);
      fx.draw(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      drawHud(ctx, W, H, dpr, L.unit, L.chip === "live");
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  /* ───────────────────── capture ───────────────────── */

  const capture = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const filename = `NERTIA-${unit.product.replace(/\W+/g, "")}-${unit.unit}.png`;
      if (saveStill) {
        saveStill(blob, filename);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  };

  const finish = finishes[unit.finish];

  return (
    <section className="nx" aria-label="NERTIA AR prototype" style={{ ["--nx-accent" as string]: finish.accent }}>
      <div className="nx-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="nx-canvas"
          role="img"
          aria-label={
            mode === "demo"
              ? `A runner in the ${unit.product}, ${finish.name}, ${chip === "live" ? `with the ${unitEffect(unit).name.toLowerCase()} effect active` : "effect inactive"}`
              : "Your camera feed with the AR effect applied"
          }
        />
        <video ref={videoRef} className="nx-video" playsInline muted aria-hidden="true" />

        <div className="nx-bar">
          {allowCamera ? (
            <div className="nx-seg" role="group" aria-label="Source">
              <button type="button" aria-pressed={mode === "demo"} onClick={() => chooseMode("demo")}>
                Demo runner
              </button>
              <button type="button" aria-pressed={mode === "camera"} onClick={() => chooseMode("camera")}>
                Your camera
              </button>
            </div>
          ) : (
            <span />
          )}
          <div className="nx-tools">
            {mode === "camera" && cam.kind === "on" ? (
              <button type="button" className="nx-icon" onClick={flip} aria-label="Switch camera">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              className="nx-icon"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play" : "Pause"}
            >
              {paused ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5l11 7-11 7z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14M16 5v14" />
                </svg>
              )}
            </button>
            {saveStill !== false ? (
              <button type="button" className="nx-icon" onClick={capture} aria-label="Save a still">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="7" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        {chip === "reading" ? (
          <div className="nx-read" aria-live="polite">
            <span className="nx-ring" />
            <span className="nx-ring" />
            <span className="nx-ring" />
            <p>Reading chip</p>
          </div>
        ) : null}

        {mode === "camera" && cam.kind === "loading" ? (
          <p className="nx-note" aria-live="polite">
            {cam.note}…
          </p>
        ) : null}
        {mode === "camera" && cam.kind === "on" && !inFrame ? (
          <p className="nx-note" aria-live="polite">
            {unit.region === "top"
              ? "Step back until your shoulders and hips are in frame"
              : unit.region === "bottom"
                ? "Step back until your hips and knees are in frame"
                : unit.region === "feet"
                  ? "Point the camera at your feet, or step back until they're in frame"
                  : "Face the camera so your head and ears are in frame"}
          </p>
        ) : null}
        {cam.kind === "error" ? (
          <p className="nx-note is-error" role="status">
            {cam.note}
          </p>
        ) : null}
        {chip === "idle" && !touched ? <p className="nx-cue">Tap a unit to read its chip</p> : null}
      </div>

      <div className="nx-side">
        <p className="micro nx-side-label">Drop 001 · Liquid Series — tap a chip</p>
        <div className="nx-tabs" role="group" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => {
                setTouched(true);
                setCat(c.id);
              }}
            >
              {c.label}
              <span>{units.filter((u) => categoryOf(u.region) === c.id).length}</span>
            </button>
          ))}
        </div>
        <ul className="nx-units">
          {units.filter((u) => categoryOf(u.region) === cat).map((u) => {
            const f = finishes[u.finish];
            const on = u.id === unit.id && chip !== "idle";
            return (
              <li key={u.id}>
                <button
                  type="button"
                  className="nx-unit"
                  aria-pressed={on}
                  onClick={() => tap(u)}
                  style={{ ["--sw" as string]: `linear-gradient(135deg, ${f.ramp.join(", ")})` }}
                >
                  <span className="nx-swatch" aria-hidden="true" />
                  <span className="nx-unit-text">
                    <span className="nx-unit-name">
                      {u.product} <i>{u.concept ? "Concept" : u.fit}</i>
                    </span>
                    <span className="nx-unit-meta">
                      {f.name} · {unitEffect(u).name}
                    </span>
                  </span>
                  <span className="nx-unit-no">{String(u.unit).padStart(String(u.of).length, "0")}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <Certificate unit={unit} chip={chip} />
      </div>
    </section>
  );
}

/* ───────────────────── certificate ───────────────────── */

function Certificate({ unit, chip }: { unit: Unit; chip: Chip }) {
  const f = finishes[unit.finish];
  const fx = unitEffect(unit);
  const [no, of] = unitLabel(unit).split(" / ");
  return (
    <article className={`nx-cert is-${chip}`} aria-live="polite">
      <header className="nx-cert-head">
        <span className="nx-cert-brand">NERTIA</span>
        <span className="nx-cert-status">
          {chip === "live" ? (
            <>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 6.2l2.3 2.3 4.7-5" />
              </svg>
              Authenticated
            </>
          ) : chip === "reading" ? (
            "Reading…"
          ) : (
            "Awaiting tap"
          )}
        </span>
      </header>

      <p className="nx-cert-kicker">
        Certificate of unit{unit.concept ? ` · ${categoryOf(unit.region)} concept` : ""}
      </p>
      <p className="nx-cert-no">
        {no}
        <span>/ {of}</span>
      </p>

      <dl className="nx-cert-rows">
        <div>
          <dt>Product</dt>
          <dd>
            {unit.product} ({unit.fit === "M" ? "Men's" : "Women's"})
          </dd>
        </div>
        <div>
          <dt>Finish</dt>
          <dd>{f.name}</dd>
        </div>
        <div>
          <dt>Effect license</dt>
          <dd>
            <b>{fx.name}</b> — bound to this unit
          </dd>
        </div>
        {unit.chip ? (
          <div>
            <dt>Chip</dt>
            <dd>{unit.chip}</dd>
          </div>
        ) : (
          <div>
            <dt>Wash log</dt>
            <dd>
              {unit.washes} of 50 guaranteed
              <span className="nx-meter" aria-hidden="true">
                <span style={{ width: `${(unit.washes / 50) * 100}%` }} />
              </span>
            </dd>
          </div>
        )}
        <div>
          <dt>Owner</dt>
          <dd>You — the effect transfers with the {unit.region === "feet" ? "pair" : unit.region === "head" ? "piece" : "garment"} at resale</dd>
        </div>
      </dl>

      <p className="nx-cert-line">{fx.line}</p>
    </article>
  );
}

/* ───────────────────── canvas overlays ───────────────────── */

/** A wash of the finish over the wearer's torso, so they look dressed in it. */
function drawFabric(ctx: CanvasRenderingContext2D, poly: Vec[], ramp: string[], now: number, k: number) {
  if (poly.length < 3) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const shift = ((now / 1000) * 0.15) % 1;
  const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
  const stops: [number, string][] = [];
  ramp.forEach((c, i) => {
    stops.push([((i / ramp.length) * 0.5 + shift * 0.5) % 1, c]);
    stops.push([((i / ramp.length) * 0.5 + 0.5 + shift * 0.5) % 1, c]);
  });
  stops.sort((a, b) => a[0] - b[0]);
  stops.forEach(([o, c]) => g.addColorStop(o, c));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = 0.85 * k;
  ctx.fillStyle = g;
  ctx.fill();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.18 * k;
  ctx.fill();
  ctx.restore();
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  unit: Unit,
  isLive: boolean,
) {
  const f = finishes[unit.finish];
  const pad = 18 * dpr;
  ctx.save();
  ctx.textBaseline = "alphabetic";

  ctx.font = `600 ${12 * dpr}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = "rgba(239,234,225,0.92)";
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${4 * dpr}px`;
  ctx.fillText("NERTIA", pad, H - pad - 16 * dpr);

  ctx.font = `400 ${9.5 * dpr}px ui-monospace, "SF Mono", Menlo, monospace`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${1.5 * dpr}px`;
  ctx.fillStyle = "rgba(239,234,225,0.6)";
  ctx.fillText(
    `${unit.product.toUpperCase()} · ${f.name.toUpperCase()} · ${unitLabel(unit)}`,
    pad,
    H - pad,
  );

  if (isLive) {
    const label = `${unitEffect(unit).name.toUpperCase()} · LIVE`;
    const w = ctx.measureText(label).width;
    const x = W - pad - w;
    // on a phone the unit line runs full width, so the live tag moves
    // up to the wordmark's row instead of colliding with it
    const narrow = W / dpr < 560;
    const y = narrow ? H - pad - 16 * dpr : H - pad;
    ctx.fillStyle = "rgba(239,234,225,0.75)";
    ctx.fillText(label, x, y);
    ctx.fillStyle = f.accent;
    ctx.beginPath();
    ctx.arc(x - 10 * dpr, y - 3.2 * dpr, 3 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
