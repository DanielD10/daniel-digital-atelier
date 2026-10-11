"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

import AtelierOS, { OS_W, OS_H } from "./AtelierOS";
import TvScreen from "./TvScreen";
import { buildRoom, type Built } from "@/lib/atelier-build";
import { bringToLife, type Life } from "@/lib/atelier-life";
import {
  moodNow,
  PHASE_ORDER,
  SEASON_ORDER,
  type Phase,
  type Season,
} from "@/lib/atelier-time";

/**
 * The Lab, in three dimensions.
 *
 * Geometry and materials live in lib/atelier-build. This file is
 * the part that moves: the camera, the light, the pointer, and the
 * clock. Three renderers are stacked on one camera —
 *
 *   WebGL      the room, through a bloom pass
 *   CSS3D      the two live screens, as real DOM in perspective
 *
 * — because a screen rendered as a texture is a picture of a
 * computer, and the whole point is that you can use this one. The
 * CSS layer sits above the canvas with pointer-events off, so
 * clicks land on the desktop where there is a desktop and fall
 * through to the raycaster everywhere else.
 */

/* How far the light moves between times of day. Each phase is a
   full lighting rig, not a tint. */
type Rig = {
  sun: { color: number; intensity: number; pos: [number, number, number] };
  fill: { color: number; intensity: number };
  ambient: { sky: number; ground: number; intensity: number };
  lamp: number;
  neon: number;
  sky: { top: number; mid: number; bot: number; stars: number };
  exposure: number;
};

const RIGS: Record<Phase, Rig> = {
  dawn: {
    sun: { color: 0xffb98a, intensity: 1.5, pos: [-5, 3.4, -7] },
    fill: { color: 0xffc3a0, intensity: 2.6 },
    ambient: { sky: 0x4a5a8c, ground: 0x2a2030, intensity: 0.55 },
    lamp: 1.1,
    neon: 1.1,
    sky: { top: 0x141c3a, mid: 0x4a4274, bot: 0xe8a177, stars: 0.3 },
    exposure: 1.0,
  },
  day: {
    sun: { color: 0xfff4e2, intensity: 3.4, pos: [-4, 8, -6] },
    fill: { color: 0xdceaf4, intensity: 5.5 },
    ambient: { sky: 0x9cc5e6, ground: 0x4a4038, intensity: 1.15 },
    lamp: 0,
    neon: 0.18,
    sky: { top: 0x5d92cf, mid: 0x9cc5e6, bot: 0xdceaf4, stars: 0 },
    exposure: 1.0,
  },
  dusk: {
    sun: { color: 0xff8a4c, intensity: 1.7, pos: [-6, 2.2, -6] },
    fill: { color: 0xff9a62, intensity: 3.0 },
    ambient: { sky: 0x6b3a6a, ground: 0x2a1a28, intensity: 0.6 },
    lamp: 1.5,
    neon: 1.5,
    sky: { top: 0x241546, mid: 0x79356d, bot: 0xef7a3c, stars: 0.45 },
    exposure: 1.05,
  },
  night: {
    sun: { color: 0x7a90d8, intensity: 0.32, pos: [-3, 6, -7] },
    fill: { color: 0x6f7fd8, intensity: 1.1 },
    ambient: { sky: 0x28224a, ground: 0x140f20, intensity: 0.34 },
    lamp: 2.6,
    neon: 2.2,
    sky: { top: 0x07061a, mid: 0x241048, bot: 0x6d1f5c, stars: 1 },
    exposure: 1.18,
  },
};

const PHASE_NOTE: Record<Phase, string> = {
  dawn: "First light",
  day: "Daylight",
  dusk: "Golden hour",
  night: "After hours",
};
const SEASON_NOTE: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

/** Camera framing, asleep and at the desk. */
const VIEW = {
  idle: { pos: new THREE.Vector3(0.22, 1.62, 1.75), look: new THREE.Vector3(0.05, 1.18, -1.9) },
  desk: { pos: new THREE.Vector3(0, 1.272, -1.33), look: new THREE.Vector3(0, 1.272, -2.1) },
};

export default function AtelierRoom3D() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [screenEl, setScreenEl] = useState<HTMLDivElement | null>(null);
  const [tvEl, setTvEl] = useState<HTMLDivElement | null>(null);
  const [tvOn, setTvOn] = useState(false);

  const [phase, setPhase] = useState<Phase>("night");
  const [season, setSeason] = useState<Season>("autumn");
  const [clock, setClock] = useState("--:--");
  const [auto, setAuto] = useState(true);
  const [awake, setAwake] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // Read by the animation loop, which must not re-subscribe on
  // every React render.
  const live = useRef({ phase, season, awake, reduced, auto, tvOn });
  live.current = { phase, season, awake, reduced, auto, tvOn };

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const sync = () => {
      const m = moodNow();
      setClock(m.clock);
      if (auto) {
        setPhase(m.phase);
        setSeason(m.season);
      }
    };
    sync();
    const id = window.setInterval(sync, 30_000);
    return () => window.clearInterval(id);
  }, [auto]);

  const onPhase = useCallback((next?: Phase) => {
    setAuto(false);
    setPhase((p) => next ?? PHASE_ORDER[(PHASE_ORDER.indexOf(p) + 1) % PHASE_ORDER.length]);
  }, []);

  const onSeason = useCallback((next?: Season) => {
    setAuto(false);
    setSeason(
      (s) => next ?? SEASON_ORDER[(SEASON_ORDER.indexOf(s) + 1) % SEASON_ORDER.length],
    );
  }, []);

  const sleep = useCallback(() => setAwake(false), []);

  useEffect(() => {
    if (!awake) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAwake(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [awake]);

  /* ══ The scene ═══════════════════════════════════════════ */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }

    RectAreaLightUniformsLib.init();

    let disposed = false;
    let frame = 0;
    let shown = false;

    const w = () => host.clientWidth || 1;
    const h = () => host.clientHeight || 1;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(w(), h());
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "room3d-canvas";
    host.appendChild(renderer.domElement);

    const css = new CSS3DRenderer();
    css.setSize(w(), h());
    css.domElement.className = "room3d-css";
    host.appendChild(css.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w() / h(), 0.08, 300);
    camera.position.copy(VIEW.idle.pos);
    camera.lookAt(VIEW.idle.look);

    let built: Built;
    try {
      built = buildRoom();
    } catch (err) {
      console.error("[lab] scene build failed", err);
      setFailed(true);
      renderer.dispose();
      return;
    }
    scene.add(built.root);

    // Geometry is built; this is what moves it.
    const life: Life = bringToLife(built);

    /* ── The two live screens ─────────────────────────────
       Real DOM, placed in the scene. Sized in CSS pixels and
       scaled down to metres, so the desktop inside keeps its own
       sensible pixel grid instead of being authored in millimetres. */
    const mkScreen = (cls: string, pxW: number, pxH: number, worldW: number) => {
      const el = document.createElement("div");
      el.className = cls;
      el.style.width = `${pxW}px`;
      el.style.height = `${pxH}px`;
      const obj = new CSS3DObject(el);
      obj.scale.setScalar(worldW / pxW);
      return { el, obj };
    };

    const deskScreen = mkScreen("os3d", OS_W, OS_H, built.screen.width);
    deskScreen.obj.position.copy(built.screen.position);
    scene.add(deskScreen.obj);
    setScreenEl(deskScreen.el);

    // The television gets the same treatment — a real embed in
    // perspective, rather than video painted onto a box.
    const tvScreen = mkScreen("tv3d", 480, 360, built.tv.width);
    tvScreen.obj.position.copy(built.tv.position);
    scene.add(tvScreen.obj);
    setTvEl(tvScreen.el);

    /* ── Post ─────────────────────────────────────────────
       Bloom is doing real work here, not decoration: the neon, the
       bulb, the city windows and the screen are all emissive, and
       the bleed off them is most of what makes the room feel lit
       rather than coloured. */
    const composer = new EffectComposer(renderer);
    composer.setSize(w(), h());
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w(), h()), 0.62, 0.72, 0.74);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    /* ── Pointer ──────────────────────────────────────────── */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2(0, 0);
    const parallax = new THREE.Vector2(0, 0);
    const parallaxTarget = new THREE.Vector2(0, 0);
    let hovered: string | null = null;

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      parallaxTarget.set(ndc.x, ndc.y);
    };

    const onLeave = () => {
      parallaxTarget.set(0, 0);
      ndc.set(99, 99);
    };

    const pick = (): string | null => {
      if (live.current.awake) return null;
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) return null;
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(built.targets, false)[0];
      return hit ? hit.object.name : null;
    };

    const onClick = () => {
      const name = pick();
      if (name === "monitor") setAwake(true);
      else if (name === "tv") setTvOn((v) => !v);
    };

    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("click", onClick);

    /* ── Light rig ────────────────────────────────────────── */
    const applied = { phase: "" as string, season: "" as string };
    const cur = {
      sunColor: new THREE.Color(),
      fillColor: new THREE.Color(),
      skyTop: new THREE.Color(),
      skyMid: new THREE.Color(),
      skyBot: new THREE.Color(),
      ambSky: new THREE.Color(),
      ambGround: new THREE.Color(),
    };
    const want = {
      sunColor: new THREE.Color(),
      fillColor: new THREE.Color(),
      skyTop: new THREE.Color(),
      skyMid: new THREE.Color(),
      skyBot: new THREE.Color(),
      ambSky: new THREE.Color(),
      ambGround: new THREE.Color(),
    };
    const num = { sun: 0, fill: 0, amb: 0, lamp: 0, neon: 0, stars: 0, exposure: 1 };
    const numWant = { ...num };
    const sunPos = new THREE.Vector3();
    const sunWant = new THREE.Vector3();

    function targetRig(p: Phase) {
      const r = RIGS[p];
      want.sunColor.setHex(r.sun.color);
      want.fillColor.setHex(r.fill.color);
      want.skyTop.setHex(r.sky.top);
      want.skyMid.setHex(r.sky.mid);
      want.skyBot.setHex(r.sky.bot);
      want.ambSky.setHex(r.ambient.sky);
      want.ambGround.setHex(r.ambient.ground);
      numWant.sun = r.sun.intensity;
      numWant.fill = r.fill.intensity;
      numWant.amb = r.ambient.intensity;
      numWant.lamp = r.lamp;
      numWant.neon = r.neon;
      numWant.stars = r.sky.stars;
      numWant.exposure = r.exposure;
      sunWant.set(...r.sun.pos);
    }

    // Snap on the first frame; lerp on every change after.
    targetRig(live.current.phase);
    cur.sunColor.copy(want.sunColor);
    cur.fillColor.copy(want.fillColor);
    cur.skyTop.copy(want.skyTop);
    cur.skyMid.copy(want.skyMid);
    cur.skyBot.copy(want.skyBot);
    cur.ambSky.copy(want.ambSky);
    cur.ambGround.copy(want.ambGround);
    Object.assign(num, numWant);
    sunPos.copy(sunWant);
    applied.phase = live.current.phase;

    /* ── Camera ───────────────────────────────────────────── */
    const camPos = camera.position.clone();
    const camLook = VIEW.idle.look.clone();
    const lookWant = VIEW.idle.look.clone();
    const posWant = VIEW.idle.pos.clone();

    function resize() {
      const W = w();
      const H = h();
      renderer.setSize(W, H);
      css.setSize(W, H);
      composer.setSize(W, H);
      bloom.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize, { passive: true });
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* ── Loop ─────────────────────────────────────────────── */
    const clk = new THREE.Clock();
    let t = 0;

    function tick() {
      if (disposed) return;
      frame = requestAnimationFrame(tick);

      const dt = Math.min(clk.getDelta(), 0.05);
      t += dt;
      const { phase: ph, season: se, awake: aw, reduced: rd } = live.current;

      if (applied.phase !== ph) {
        targetRig(ph);
        applied.phase = ph;
      }
      if (applied.season !== se) {
        life.setSeason(se, !live.current.auto);
        applied.season = se;
      }

      // Light eases rather than cuts, so changing the hour is a
      // sunrise instead of a switch.
      const k = Math.min(1, dt * 1.7);
      cur.sunColor.lerp(want.sunColor, k);
      cur.fillColor.lerp(want.fillColor, k);
      cur.skyTop.lerp(want.skyTop, k);
      cur.skyMid.lerp(want.skyMid, k);
      cur.skyBot.lerp(want.skyBot, k);
      cur.ambSky.lerp(want.ambSky, k);
      cur.ambGround.lerp(want.ambGround, k);
      sunPos.lerp(sunWant, k);
      for (const key of Object.keys(num) as Array<keyof typeof num>) {
        num[key] += (numWant[key] - num[key]) * k;
      }

      const L = built.lamps;
      L.sun.color.copy(cur.sunColor);
      L.sun.intensity = num.sun;
      L.sun.position.copy(sunPos);
      L.windowFill.color.copy(cur.fillColor);
      L.windowFill.intensity = num.fill;
      L.ambient.color.copy(cur.ambSky);
      L.ambient.groundColor.copy(cur.ambGround);
      L.ambient.intensity = num.amb;
      renderer.toneMappingExposure = num.exposure;

      built.skyMat.uniforms.uTop.value.copy(cur.skyTop);
      built.skyMat.uniforms.uMid.value.copy(cur.skyMid);
      built.skyMat.uniforms.uBot.value.copy(cur.skyBot);
      built.skyMat.uniforms.uStars.value = num.stars;
      built.skyMat.uniforms.uTime.value = t;
      built.riftMat.uniforms.uTime.value = t;

      // Hover, and what each thing does about it.
      const name = pick();
      if (name !== hovered) {
        hovered = name;
        life.setHover(name);
        renderer.domElement.style.cursor = name ? "pointer" : "default";
        setHint(name ? life.hintFor(name) : null);
      }

      life.update(t, dt, {
        reduced: rd,
        awake: aw,
        lamp: num.lamp,
        neon: num.neon,
        pointer: parallax,
        tv: live.current.tvOn,
      });

      // Camera: ease to whichever framing is current, plus a
      // little parallax so the room has weight when you move.
      const view = aw ? VIEW.desk : VIEW.idle;
      posWant.copy(view.pos);
      lookWant.copy(view.look);
      if (!aw && !rd) {
        parallax.lerp(parallaxTarget, Math.min(1, dt * 2.4));
        posWant.x += parallax.x * 0.16;
        posWant.y += parallax.y * 0.09;
        posWant.y += Math.sin(t * 0.33) * 0.012;
      }
      const ck = Math.min(1, dt * (aw ? 2.6 : 2.0));
      camPos.lerp(posWant, ck);
      camLook.lerp(lookWant, ck);
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      composer.render();
      css.render(scene, camera);

      if (!shown) {
        shown = true;
        setReady(true);
      }
    }

    resize();
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("click", onClick);
      setScreenEl(null);
      setTvEl(null);
      built.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      if (css.domElement.parentNode === host) host.removeChild(css.domElement);
    };
  }, []);

  return (
    <div className="atelier" data-phase={phase} data-season={season}>
      <div
        className={`atelier-stage room3d${ready ? " is-ready" : ""}${awake ? " is-awake" : ""}`}
      >
        <div className="room3d-mount" ref={hostRef} />

        {failed ? (
          <p className="room3d-boot">
            This room needs WebGL, and this browser has it switched off.
          </p>
        ) : null}

        {hint && !awake ? <p className="room3d-tip">{hint}</p> : null}

        {screenEl
          ? createPortal(
              awake ? (
                <AtelierOS
                  phase={phase}
                  season={season}
                  clock={clock}
                  reduced={reduced}
                  onPhase={onPhase}
                  onSeason={onSeason}
                  onSleep={sleep}
                />
              ) : (
                <div className="os3d-off" />
              ),
              screenEl,
            )
          : null}

        {tvEl ? createPortal(<TvScreen on={tvOn} />, tvEl) : null}
      </div>

      <div className="atelier-bar">
        <p className="micro">
          {clock} — {PHASE_NOTE[phase]}, {SEASON_NOTE[season]}
          {auto ? " · live" : " · manual"}
        </p>

        <div className="atelier-ctl">
          {awake ? (
            <button type="button" onClick={sleep}>
              Step back
            </button>
          ) : null}
          <button type="button" onClick={() => onPhase()}>
            Time
          </button>
          <button type="button" onClick={() => onSeason()}>
            Season
          </button>
          <button type="button" onClick={() => setAuto(true)} disabled={auto}>
            Back to now
          </button>
        </div>
      </div>
    </div>
  );
}
