"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

import { buildRoom, type Built } from "@/lib/atelier-build";
import type { LifeCtx } from "@/lib/atelier-life";
import { moodNow, PHASE_ORDER, SEASON_ORDER, type Phase, type Season } from "@/lib/atelier-time";
import { decorFor, DECOR_ORDER, decorLabel, type Decor } from "@/lib/atelier-decor";
import { useAmbient } from "@/lib/ambient";
import AtelierOS from "./AtelierOS";
import AtelierTV from "./AtelierTV";

/**
 * The Lab, in three dimensions.
 *
 * Two renderers over one camera. WebGL draws the room; a
 * CSS3DRenderer draws the two screens — the desk machine and the
 * television — as real DOM transformed into the same perspective.
 * That is the only way to have a monitor you can actually type
 * into sitting inside a lit 3D room: a texture would be a picture
 * of a computer, and this is a computer.
 *
 * The CSS layer sits above the canvas and is click-through
 * everywhere except those two screens, so the raycaster below
 * still gets everything else in the room.
 */

/* ── Light, by hour ────────────────────────────────────────── */
type Mood = {
  sun: { color: number; intensity: number; pos: [number, number, number] };
  fill: { color: number; intensity: number };
  ambient: { sky: number; ground: number; intensity: number };
  sky: { top: number; mid: number; bot: number; stars: number };
  lamp: number;
  neon: number;
  /** How lit the city outside is. Nobody leaves the office lights
   *  blazing at noon, and at noon you could not see them anyway. */
  city: number;
  /** Concrete, which is grey in daylight and nearly black at night. */
  cityCol: number;
  /** Weather on the glass. It rains more after dark here. */
  rain: number;
  /** Haze over the city. Depth, and the thing that stops the far
   *  towers reading as a flat sticker behind the glass. */
  fog: number;
  exposure: number;
};

const MOODS: Record<Phase, Mood> = {
  dawn: {
    sun: { color: 0xffbd8a, intensity: 1.1, pos: [-6, 3.4, -7] },
    fill: { color: 0xffc9a0, intensity: 3.2 },
    ambient: { sky: 0x6a6ea0, ground: 0x2a2030, intensity: 0.55 },
    sky: { top: 0x141c3a, mid: 0x5b4a7a, bot: 0xe8a177, stars: 0.3 },
    lamp: 1.1,
    neon: 0.9,
    city: 0.5,
    cityCol: 0x6a6480,
    rain: 0.5,
    fog: 0x2a2440,
    exposure: 1.05,
  },
  day: {
    sun: { color: 0xfff4e2, intensity: 3.6, pos: [-4, 8, -6] },
    fill: { color: 0xdceaf8, intensity: 5.8 },
    ambient: { sky: 0xb4d0f0, ground: 0x60556a, intensity: 1.5 },
    sky: { top: 0x3f6ea8, mid: 0x7aa8d0, bot: 0xb8cfe0, stars: 0 },
    lamp: 0,
    neon: 0.25,
    city: 0,
    cityCol: 0xa8b4c8,
    rain: 0.18,
    fog: 0x8fa8c4,
    exposure: 0.82,
  },
  dusk: {
    sun: { color: 0xff8a4a, intensity: 1.4, pos: [7, 2.2, -7] },
    fill: { color: 0xff9a62, intensity: 3.6 },
    ambient: { sky: 0x7a4a7a, ground: 0x2a1a2a, intensity: 0.6 },
    sky: { top: 0x241546, mid: 0x79356d, bot: 0xef7a3c, stars: 0.45 },
    lamp: 1.9,
    neon: 2.4,
    city: 0.85,
    cityCol: 0x5e4a66,
    rain: 0.8,
    fog: 0x3a1e40,
    exposure: 1.05,
  },
  night: {
    sun: { color: 0x6f86ff, intensity: 0.3, pos: [-3, 6, -7] },
    fill: { color: 0x49b8ff, intensity: 2.1 },
    ambient: { sky: 0x3a4a8c, ground: 0x2c1434, intensity: 0.62 },
    sky: { top: 0x04030c, mid: 0x1b0840, bot: 0x7a1d63, stars: 1 },
    lamp: 3.1,
    neon: 3.4,
    city: 1,
    cityCol: 0x2a2740,
    rain: 1,
    fog: 0x0b0720,
    exposure: 1.2,
  },
};

/* Season tints the leaves and what grows outside. */
const LEAF: Record<Season, [number, number]> = {
  spring: [0x5f9150, 0x86b468],
  summer: [0x3f7a42, 0x5f9a4e],
  autumn: [0x8a6a30, 0xb08440],
  winter: [0x4c6b58, 0x6f8c78],
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Where you can stand.
 *
 * The room is a cutaway model rather than somewhere you are
 * inside, so moving around it is a short list of framings rather
 * than free orbit — free orbit in a room with three walls mostly
 * shows you the back of a wall. Arrows step between them.
 */
type Shot = { name: string; pos: [number, number, number]; aim: [number, number, number] };

/** What is out of the window. Index matches uScene in the shader. */
export const WINDOW_SCENES = [
  "City",
  "Deep space",
  "Mountains",
  "Ocean",
  "Forest",
  "Desert",
  "Aurora",
  "Snowfield",
  "Sunset",
  "Storm",
] as const;

const SHOTS: Shot[] = [
  { name: "The studio", pos: [5.6, 4.7, 5.4], aim: [0.1, 0.8, -0.6] },
  { name: "The desk", pos: [1.5, 2.15, 1.5], aim: [0.05, 1.05, -2.05] },
  { name: "The window", pos: [-2.3, 2.6, 3.0], aim: [0.3, 1.45, -2.3] },
  { name: "The corner", pos: [-5.2, 3.8, 3.2], aim: [-1.2, 1.1, -1.7] },
];

export default function AtelierRoom3D() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [supported, setSupported] = useState(true);
  const [ready, setReady] = useState(false);
  const [awake, setAwake] = useState(false);
  const [tvOn, setTvOn] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [shot, setShot] = useState(0);
  const [view, setView] = useState(0);

  const [phase, setPhase] = useState<Phase>("night");
  const [season, setSeason] = useState<Season>("autumn");
  const [decor, setDecor] = useState<Decor>("plain");
  const [clock, setClock] = useState("--:--");
  const [auto, setAuto] = useState(true);

  const { playing } = useAmbient();

  /* Mutable mirrors, so the render loop never closes over stale
     state and never has to be rebuilt when state changes. */
  const stateRef = useRef({ awake: false, tvOn: false, phase, season, playing: false, shot: 0, view: 0 });
  stateRef.current.awake = awake;
  stateRef.current.tvOn = tvOn;
  stateRef.current.phase = phase;
  stateRef.current.season = season;
  stateRef.current.playing = playing;
  stateRef.current.shot = shot;
  stateRef.current.view = view;

  const osRootRef = useRef<Root | null>(null);
  const osHostRef = useRef<HTMLDivElement | null>(null);
  const tvRootRef = useRef<Root | null>(null);
  const tvHostRef = useRef<HTMLDivElement | null>(null);
  const builtRef = useRef<Built | null>(null);
  const pokeRef = useRef<((name: string) => void) | null>(null);

  /* ── Clock and calendar ──────────────────────────────── */
  useEffect(() => {
    const sync = () => {
      const m = moodNow();
      setClock(m.clock);
      if (auto) {
        setPhase(m.phase);
        setSeason(m.season);
        setDecor(decorFor().key);
      }
    };
    sync();
    const id = window.setInterval(sync, 20_000);
    return () => window.clearInterval(id);
  }, [auto]);

  const sleep = useCallback(() => setAwake(false), []);
  const wake = useCallback(() => {
    setAwake(true);
    stageRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!awake) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAwake(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [awake]);

  const cyclePhase = useCallback((next?: Phase) => {
    setAuto(false);
    setPhase((p) => next ?? PHASE_ORDER[(PHASE_ORDER.indexOf(p) + 1) % PHASE_ORDER.length]);
  }, []);
  const cycleSeason = useCallback((next?: Season) => {
    setAuto(false);
    setSeason((s) => next ?? SEASON_ORDER[(SEASON_ORDER.indexOf(s) + 1) % SEASON_ORDER.length]);
  }, []);
  const cycleDecor = useCallback(() => {
    setAuto(false);
    setDecor((d) => DECOR_ORDER[(DECOR_ORDER.indexOf(d) + 1) % DECOR_ORDER.length]);
  }, []);

  /* ══ The scene ═══════════════════════════════════════════ */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setSupported(false);
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    RectAreaLightUniformsLib.init();

    let w = host.clientWidth || 1;
    let h = host.clientHeight || 1;

    // Bloom runs the scene through extra full-screen passes, so
    // every pixel here is paid for several times over.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.classList.add("room3d-gl");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    /* Exponential haze. Light enough that the room is untouched at
       a few metres, heavy enough that the far side of the city
       fades out instead of ending at a hard edge. */
    scene.fog = new THREE.FogExp2(0x0b0720, 0.011);
    // 42 degrees framed the desk and cropped both corners of the
    // room off the sides, which is where most of the furniture is.
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.05, 400);
    camera.position.set(0.35, 1.6, 1.6);

    const built = buildRoom();
    builtRef.current = built;
    scene.add(built.root);

    /* ── CSS3D: the two screens ────────────────────────── */
    const css = new CSS3DRenderer();
    css.setSize(w, h);
    css.domElement.classList.add("room3d-css");
    host.appendChild(css.domElement);

    // The desktop. React renders into this element; CSS3D only
    // ever moves it, so the OS keeps its own state across every
    // camera move.
    const osHost = document.createElement("div");
    osHost.className = "room3d-screen";
    osHost.style.width = "780px";
    osHost.style.height = "464px";
    osHostRef.current = osHost;

    const osObject = new CSS3DObject(osHost);
    osObject.position.copy(built.screen.position);
    const osScale = built.screen.width / 780;
    osObject.scale.setScalar(osScale);
    scene.add(osObject);

    // The television.
    const tvHost = document.createElement("div");
    tvHost.className = "room3d-screen room3d-tv";
    tvHost.style.width = "480px";
    tvHost.style.height = "360px";
    tvHostRef.current = tvHost;
    const tvObject = new CSS3DObject(tvHost);
    tvObject.position.copy(built.tv.position);
    // The set is turned toward the room; its picture has to turn with it.
    tvObject.rotation.y = built.tv.rotationY;
    tvObject.scale.setScalar(built.tv.width / 480);
    scene.add(tvObject);

    /* ── Post ──────────────────────────────────────────── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Half resolution: bloom is a blur, and nobody can see the
    // difference, but the mip chain is a quarter of the work.
    const bloom = new UnrealBloomPass(new THREE.Vector2(w * 0.5, h * 0.5), 0.62, 0.72, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setSize(w, h);

    /* ── Interaction ───────────────────────────────────── */
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0);
    /** Pointer in world space, so the cat has something to look at. */
    const cursorWorld = new THREE.Vector3(0, 1.2, 0);
    const focus = new Map<string, number>();
    let hoverName: string | null = null;
    let pointerInside = false;

    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInside = true;
    };
    const onPointerLeave = () => {
      pointerInside = false;
    };
    const onClick = () => {
      if (!hoverName) return;
      pokeRef.current?.(hoverName);
    };

    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);
    host.addEventListener("click", onClick);

    /* ── Camera rigs ───────────────────────────────────── */
    const IDLE_POS = new THREE.Vector3(...SHOTS[0].pos);
    const IDLE_AIM = new THREE.Vector3(...SHOTS[0].aim);

    /**
     * On a phone the frame is portrait, so the horizontal field of
     * view is much narrower than on a desktop and anything against
     * a side wall — the television, the shelving — falls straight
     * off the edge. Every shot steps back from its own aim point
     * by a fixed factor rather than being re-authored.
     */
    const narrow = window.matchMedia("(max-width: 860px)").matches;
    const PULL = narrow ? 1.42 : 1;
    const WAKE_POS = new THREE.Vector3(
      built.screen.position.x,
      built.screen.position.y,
      built.screen.position.z + 0.58,
    );
    const WAKE_AIM = built.screen.position.clone();

    const camPos = IDLE_POS.clone();
    const camAim = IDLE_AIM.clone();
    const wantPos = new THREE.Vector3();
    const wantAim = new THREE.Vector3();

    /* ── Loop ──────────────────────────────────────────── */
    const clockT = new THREE.Clock();
    let t = 0;
    let frame = 0;
    let disposed = false;

    // Eased, so changing the hour is a sunset rather than a cut.
    const cur = {
      sunI: 0,
      fillI: 0,
      ambI: 0,
      lamp: 0,
      neon: 0,
      exposure: 1.1,
      screenI: 0,
      tvI: 0,
      city: 1,
      rain: 1,
    fog: 0x0b0720,
    };
    const sunCol = new THREE.Color();
    const fillCol = new THREE.Color();
    const skyTop = new THREE.Color();
    const skyMid = new THREE.Color();
    const skyBot = new THREE.Color();
    const sunPos = new THREE.Vector3();
    const cityCol = new THREE.Color();
    const fogCol = new THREE.Color();
    let starAmt = 1;
    let vinylSpin = 0;
    let chairSpin = 0;

    const lifeCtx: LifeCtx = { focus: 0, cursor: cursorWorld, t: 0, dt: 0, reduced };

    const render = () => {
      if (disposed) return;
      frame = requestAnimationFrame(render);

      const dt = Math.min(clockT.getDelta(), 0.05);
      t += dt;
      const s = stateRef.current;

      /* Hover. One raycast per frame against a short list. */
      if (pointerInside && !s.awake) {
        ray.setFromCamera(pointer, camera);
        const live = built.targets.filter((o) => o.visible && !o.userData.inactive);
        const hits = ray.intersectObjects(live, false);
        const next = hits.length ? hits[0].object.name : null;
        if (next !== hoverName) {
          hoverName = next;
          setHovered(next);
        }
        if (hits.length) cursorWorld.copy(hits[0].point);
        else {
          // No object under the cursor: project onto a plane at
          // the desk so the cat still tracks an empty hand.
          ray.ray.at(2.6, cursorWorld);
        }
      } else if (hoverName !== null) {
        hoverName = null;
        setHovered(null);
      }

      // Ease every focus value toward 0 or 1. Boolean hover makes
      // things snap; a living room never snaps.
      const touch = (name: string) => {
        const want = hoverName === name ? 1 : 0;
        const have = focus.get(name) ?? 0;
        const v = have + (want - have) * Math.min(1, dt * (want > have ? 7 : 4));
        focus.set(name, v);
        return v;
      };

      /* Living things. */
      lifeCtx.t = t;
      lifeCtx.dt = dt;
      for (const item of built.life) {
        lifeCtx.focus = touch(item.name);
        item.update(lifeCtx);
      }
      lifeCtx.focus = Math.max(
        touch("tree"),
        touch("pumpkin"),
        touch("flowers"),
        touch("fan"),
      );
      built.decor.update(lifeCtx);

      /* Props with simpler lives. */
      const p = built.props;

      // The record turns when watched, and keeps turning a moment
      // after you look away.
      const vinylFocus = touch("vinyl");
      vinylSpin += dt * (0.25 + vinylFocus * 9);
      p.vinyl.rotation.y = vinylSpin;

      const chairFocus = touch("chair");
      chairSpin += dt * chairFocus * 1.6;
      p.chair.rotation.y = 0.22 + Math.sin(chairSpin) * 0.5 * chairFocus;

      // Speaker cones breathe with the music.
      const beat = s.playing && !reduced ? 1 + Math.sin(t * 7.5) * 0.09 + Math.sin(t * 3.1) * 0.05 : 1;
      p.speakerCones.forEach((c, i) => c.scale.setScalar(beat - i * 0.02 * (beat - 1)));
      const speakerFocus = touch("speaker");

      // Neon hum, plus a rare flicker. Real tubes do this.
      const neonFocus = touch("neon");
      const flick = reduced ? 1 : Math.sin(t * 90) > 0.985 ? 0.35 : 1;
      p.neonMat.color.setHex(0xff2f86);
      p.neonSign.scale.setScalar(1 + neonFocus * 0.06);

      const posterFocus = touch("poster");
      const pm = p.posters[0].material as THREE.MeshStandardMaterial;
      pm.emissiveIntensity = 0.4 + posterFocus * 1.6;

      const clockFocus = focus.get("clock") ?? 0;
      void clockFocus;
      void speakerFocus;

      /* Lighting, eased toward the current hour. */
      const mood = MOODS[s.phase];
      const k = Math.min(1, dt * 1.6);
      cur.sunI = lerp(cur.sunI, mood.sun.intensity, k);
      cur.fillI = lerp(cur.fillI, mood.fill.intensity, k);
      cur.ambI = lerp(cur.ambI, mood.ambient.intensity, k);
      const lampFocus = touch("lamp");
      cur.lamp = lerp(cur.lamp, mood.lamp * (1 + lampFocus * 0.7), k);
      cur.neon = lerp(cur.neon, mood.neon * (1 + neonFocus * 0.8), k);
      cur.exposure = lerp(cur.exposure, mood.exposure, k);
      cur.city = lerp(cur.city, mood.city, k);
      cur.rain = lerp(cur.rain, mood.rain, k);
      /* The window scene. The skyline is geometry, so a scene
         that is not a city has to take it out of the room, not
         just stop drawing sky behind it. */
      const cityOut = s.view === 0;
      p.skyMat.uniforms.uScene.value = 0;
      p.vistaMat.uniforms.uScene.value = s.view;
      p.vistaMat.uniforms.uTime.value = reduced ? 0 : t;
      p.vista.visible = !cityOut;
      p.cityGroup.visible = cityOut;
      p.ships.visible = cityOut || s.view === 1;
      p.rift.visible = cityOut || s.view === 1;

      p.rainMat.uniforms.uTime.value = reduced ? 0 : t;
      /* Weather belongs to the view. A mountain range behind a
         pane streaming with rain just reads as a grey pane. */
      p.rainMat.uniforms.uAmount.value =
        s.view === 9 ? 1 : s.view === 0 ? cur.rain : s.view === 7 ? 0.25 : 0;
      p.ledGlowA.intensity = 0.55 + cur.neon * 0.22;
      p.ledGlowB.intensity = 0.5 + cur.neon * 0.2;

      // A handful of the signs out there are on their last legs.
      if (!reduced) {
        for (const sign of p.signs) {
          const m = sign.material as THREE.MeshBasicMaterial;
          if (sign.userData.flicker) {
            const ph = sign.userData.phase as number;
            m.opacity = Math.sin(t * 14 + ph) > 0.55 ? 0.18 : 0.92;
          }
          m.opacity *= 0.25 + cur.city * 0.75;
        }
      }
      fogCol.setHex(mood.fog);
      (scene.fog as THREE.FogExp2).color.lerp(fogCol, k);
      cityCol.setHex(mood.cityCol);
      for (const m of p.towerMats) {
        m.emissiveIntensity = cur.city * 0.95;
        m.color.lerp(cityCol, k);
      }

      sunCol.lerpColors(built.lamps.sun.color, new THREE.Color(mood.sun.color), k);
      built.lamps.sun.color.copy(sunCol);
      built.lamps.sun.intensity = cur.sunI;
      sunPos.set(...mood.sun.pos);
      built.lamps.sun.position.lerp(sunPos, k);

      fillCol.lerpColors(built.lamps.windowFill.color, new THREE.Color(mood.fill.color), k);
      built.lamps.windowFill.color.copy(fillCol);
      built.lamps.windowFill.intensity = cur.fillI;

      built.lamps.ambient.intensity = cur.ambI;
      built.lamps.ambient.color.lerp(new THREE.Color(mood.ambient.sky), k);
      built.lamps.ambient.groundColor.lerp(new THREE.Color(mood.ambient.ground), k);

      built.lamps.desk.intensity = cur.lamp * flick;
      (p.lampBulb.material as THREE.MeshBasicMaterial).color.setScalar(
        Math.min(1, 0.25 + cur.lamp * 0.35),
      );
      built.lamps.neon.intensity = cur.neon * flick;
      renderer.toneMappingExposure = cur.exposure;

      // Sky outside.
      const u = p.skyMat.uniforms;
      skyTop.setHex(mood.sky.top);
      skyMid.setHex(mood.sky.mid);
      skyBot.setHex(mood.sky.bot);
      (u.uTop.value as THREE.Color).lerp(skyTop, k);
      (u.uMid.value as THREE.Color).lerp(skyMid, k);
      (u.uBot.value as THREE.Color).lerp(skyBot, k);
      starAmt = lerp(starAmt, mood.sky.stars, k);
      u.uStars.value = starAmt;
      u.uTime.value = reduced ? 0 : t;

      // Screens.
      const monitorFocus = touch("monitor");
      cur.screenI = lerp(cur.screenI, s.awake ? 1.6 : monitorFocus * 0.4, Math.min(1, dt * 4));
      built.lamps.screen.intensity = cur.screenI;
      (p.screenGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, cur.screenI * 0.5);
      p.screenOff.visible = !s.awake;
      (p.screenOff.material as THREE.MeshStandardMaterial).emissive.setScalar(monitorFocus * 0.06);

      const tvFocus = touch("tv");
      cur.tvI = lerp(cur.tvI, s.tvOn ? 1.5 : tvFocus * 0.3, Math.min(1, dt * 4));
      built.lamps.tv.intensity = cur.tvI * (reduced ? 1 : 0.86 + Math.sin(t * 11) * 0.14);
      (p.tvGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, cur.tvI * 0.45);
      p.tvOff.visible = !s.tvOn;
      tvHost.style.visibility = s.tvOn ? "visible" : "hidden";

      // Ships cross the window and wrap round.
      if (!reduced) {
        for (const ship of p.ships.children) {
          const d = ship.userData as { speed: number; t: number };
          d.t += dt * d.speed * 0.012;
          if (d.t > 1.2) d.t = -0.2;
          if (d.t < -0.2) d.t = 1.2;
          ship.position.x = -46 + d.t * 92;
          ship.position.y += Math.sin(t * 0.4 + d.t * 6) * 0.004;
        }
        p.riftMat.uniforms.uTime.value = t;
        p.rift.lookAt(camera.position);
      }

      /* Camera. */
      if (s.awake) {
        wantPos.copy(WAKE_POS);
        wantAim.copy(WAKE_AIM);
      } else {
        const sh = SHOTS[s.shot] ?? SHOTS[0];
        wantAim.set(sh.aim[0], sh.aim[1], sh.aim[2]);
        wantPos
          .set(sh.pos[0], sh.pos[1], sh.pos[2])
          .sub(wantAim)
          .multiplyScalar(PULL)
          .add(wantAim);
        if (!reduced) {
          // A slow breath, plus a little parallax toward the
          // cursor. Enough that the room is never quite still.
          wantPos.x += Math.sin(t * 0.17) * 0.07 + pointer.x * 0.1;
          wantPos.y += Math.cos(t * 0.13) * 0.035 + pointer.y * 0.05;
          wantAim.x += pointer.x * 0.06;
        }
      }
      const camK = Math.min(1, dt * (s.awake ? 2.6 : 1.8));
      camPos.lerp(wantPos, camK);
      camAim.lerp(wantAim, camK);
      camera.position.copy(camPos);
      camera.lookAt(camAim);

      /* The cutaway. The ceiling only exists when you are sitting
         inside at the desk; from outside it is a lid on a box.
         Side walls drop out as the camera passes them, which is
         the one thing that makes a model like this readable from
         more than one side. */
      p.ceiling.visible = s.awake;
      p.rightWall.visible = camPos.x < 2.4;
      p.leftWall.visible = camPos.x > -2.4;
      p.plinth.visible = !s.awake;
      // The overview needs a light of its own; sitting at the desk
      // does not, and keeping it on there flattens the lamp.
      p.modelFill.intensity = lerp(p.modelFill.intensity, s.awake ? 0 : 5.2, Math.min(1, dt * 2));

      composer.render();
      css.render(scene, camera);
    };

    /* ── Poke handler ──────────────────────────────────── */
    pokeRef.current = (name: string) => {
      if (name === "monitor") {
        wake();
        return;
      }
      if (name === "tv") {
        setTvOn((v) => !v);
        return;
      }
      const item = built.life.find((l) => l.name === name);
      item?.poke?.();
    };

    /* ── Resize ────────────────────────────────────────── */
    const resize = () => {
      w = host.clientWidth || 1;
      h = host.clientHeight || 1;
      renderer.setSize(w, h);
      css.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w * 0.5, h * 0.5);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else {
        clockT.getDelta();
        frame = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    render();
    setReady(true);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("click", onClick);
      composer.dispose();
      built.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      if (css.domElement.parentNode === host) host.removeChild(css.domElement);
      builtRef.current = null;
      osHostRef.current = null;
      tvHostRef.current = null;
    };
    // Built once. Everything that changes is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Mount the OS into the CSS3D element ─────────────── */
  useEffect(() => {
    if (!ready) return;
    const el = osHostRef.current;
    if (!el) return;
    if (!osRootRef.current) osRootRef.current = createRoot(el);
    osRootRef.current.render(
      awake ? (
        <AtelierOS
          phase={phase}
          season={season}
          clock={clock}
          reduced={false}
          onPhase={cyclePhase}
          onSeason={cycleSeason}
          onSleep={sleep}
        />
      ) : null,
    );
  }, [ready, awake, phase, season, clock, cyclePhase, cycleSeason, sleep]);

  useEffect(() => {
    if (!ready) return;
    const el = tvHostRef.current;
    if (!el) return;
    if (!tvRootRef.current) tvRootRef.current = createRoot(el);
    tvRootRef.current.render(tvOn ? <AtelierTV /> : null);
  }, [ready, tvOn]);

  // Unmount the React roots on teardown, on their own, because
  // doing it inside the scene effect races with React's own commit.
  useEffect(() => {
    return () => {
      const roots = [osRootRef.current, tvRootRef.current];
      osRootRef.current = null;
      tvRootRef.current = null;
      setTimeout(() => {
        for (const r of roots) r?.unmount();
      }, 0);
    };
  }, []);

  /* ── Decor and season into the scene ─────────────────── */
  useEffect(() => {
    builtRef.current?.decor.show(decor);
  }, [decor, ready]);

  useEffect(() => {
    const built = builtRef.current;
    if (!built) return;
    const [a, b] = LEAF[season];
    // Leaf materials are shared across every plant, so recolouring
    // two of them repaints the whole room's greenery at once.
    built.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!mat || !mat.color) return;
      if (mat.userData.leaf === "a") mat.color.setHex(a);
      if (mat.userData.leaf === "b") mat.color.setHex(b);
    });
  }, [season, ready]);

  if (!supported) {
    return (
      <div className="atelier">
        <p className="micro">
          This room is drawn with WebGL, and this browser has it switched off.
        </p>
      </div>
    );
  }

  const decorNote = decorLabel(decor);

  return (
    <div className="atelier">
      <div className={`room3d-stage${awake ? " is-awake" : ""}`} ref={stageRef}>
        <div className={`room3d-host${hovered ? " is-pointing" : ""}`} ref={hostRef} />

        {!ready ? <p className="room3d-boot">Lighting the room…</p> : null}

        {!awake && hovered ? (
          <p className="room3d-tip" aria-live="polite">
            {TIPS[hovered] ?? hovered}
          </p>
        ) : null}

        {/* Move around the model. Arrows rather than free orbit,
            because a cutaway room has three walls and free orbit
            spends half its time behind one of them. */}
        {ready && !awake ? (
          <div className="room3d-nav">
            <button
              type="button"
              aria-label="Previous view"
              onClick={() => setShot((v) => (v - 1 + SHOTS.length) % SHOTS.length)}
            >
              ←
            </button>
            <span className="room3d-shot">{SHOTS[shot].name}</span>
            <button
              type="button"
              aria-label="Next view"
              onClick={() => setShot((v) => (v + 1) % SHOTS.length)}
            >
              →
            </button>
          </div>
        ) : null}
      </div>

      <div className="atelier-bar">
        <p className="micro">
          {clock} — {PHASE_NOTE[phase]}, {SEASON_NOTE[season]}
          {auto ? " · live" : " · manual"}
          {decorNote ? ` · ${decorNote}` : ""}
        </p>

        <div className="atelier-ctl">
          {awake ? (
            <button type="button" onClick={sleep}>
              Step back
            </button>
          ) : null}
          <button type="button" onClick={() => cyclePhase()}>
            Time
          </button>
          <button type="button" onClick={() => cycleSeason()}>
            Season
          </button>
          <button type="button" onClick={cycleDecor}>
            Decor
          </button>
          <button
            type="button"
            onClick={() => setView((v) => (v + 1) % WINDOW_SCENES.length)}
            title="What is outside the window"
          >
            {WINDOW_SCENES[view]}
          </button>
          <button type="button" onClick={() => setAuto(true)} disabled={auto}>
            Back to now
          </button>
        </div>
      </div>
    </div>
  );
}

/** What the room says about itself when you point at something. */
const TIPS: Record<string, string> = {
  cat: "She has noticed you.",
  monitor: "Click to sit down at it",
  tv: "Click to switch it on",
  lamp: "The lamp",
  chair: "Give it a spin",
  vinyl: "Something from the shelf",
  mug: "Still warm",
  speaker: "Turn the sound on",
  neon: "Hand-bent, buzzing",
  clock: "The actual time",
  poster: "A print from a while back",
  tree: "Up since late November",
  pumpkin: "Carved badly, on purpose",
  flowers: "Cut this morning",
  fan: "Doing its best",
  "plant-monstera-71": "Monstera. Thriving, somehow.",
  "plant-snake-83": "Snake plant. Unkillable.",
  "plant-pothos-97": "Pothos, taking over the shelf",
  "plant-succulent-113": "Small and smug",
  sofa: "Where the thinking actually happens",
  shelf: "Mostly books, mostly unread",
  table: "Two cups, both cold",
  floorlamp: "On a timer that never worked",
  crates: "Not unpacked yet",
};
