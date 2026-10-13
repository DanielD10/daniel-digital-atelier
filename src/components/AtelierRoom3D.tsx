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

import { buildRoom, buildEnvScene, disposeEnvScene, type Built } from "@/lib/atelier-build";
import type { LifeCtx } from "@/lib/atelier-life";
import { moodNow, PHASE_ORDER, SEASON_ORDER, type Phase, type Season } from "@/lib/atelier-time";
import { decorFor, DECOR_ORDER, decorLabel, type Decor } from "@/lib/atelier-decor";
import { useAmbient } from "@/lib/ambient";
import AtelierOS from "./AtelierOS";
import AtelierTV, { type TVApi } from "./AtelierTV";
import AtelierLibrary from "./AtelierLibrary";

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
type Triple = [number, number, number];
type Shot = {
  name: string;
  pos: Triple;
  aim: Triple;
  /* A portrait frame is roughly a third as wide as a desktop one,
     and some framings cannot be rescued by stepping back — the
     television is mounted on the left wall, so from the desk
     framing it sits about two frame-widths off the left edge no
     matter how far back the camera goes along that same line. Those
     shots get their own portrait framing rather than a fudge
     factor. */
  narrowPos?: Triple;
  narrowAim?: Triple;
  /**
   * Radius, in metres, of the sphere around the aim point that
   * this shot is actually about — the desk and the set for the
   * desk shot, the whole room for the overview.
   *
   * The camera backs off along its own axis until that sphere
   * fills the tighter of the two half-angles. That is what stops
   * the black: a fixed camera position has to be authored for one
   * frame shape, and the moment the frame is taller or wider than
   * that one, the slack turns into empty room. Fitting instead of
   * placing means a phone, a laptop and a full-screen ultrawide
   * all get a full frame.
   */
  fit: number;
  /** The same, for the portrait framing, which usually has to
   *  hold more of the room in a much narrower frame. */
  narrowFit?: number;
  /**
   * Used instead of `fit` when nothing is playing.
   *
   * The sofa framing has two jobs that pull against each other.
   * With a film on, the screen should fill the frame — that is
   * the whole point of sitting down. With nothing on, the thing
   * worth looking at is the wall: the screen, the fireplace
   * under it and the light it throws. One radius cannot do
   * both, so the shot carries the resting one too and the
   * camera eases between them.
   */
  restFit?: number;
};

/**
 * The lens.
 *
 * three.js takes a *vertical* field of view, so a portrait frame
 * silently throws away horizontal view — a 50° lens that sees 72°
 * across on a laptop sees 31° across on a phone. This widens the
 * vertical angle on narrow frames only as far as it takes to hold
 * a horizontal floor, and leaves desktop exactly as authored.
 */
const BASE_FOV = 50;
const HALF_H_TAN_FLOOR = 0.33; // ~36.5 degrees across
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const BASE_HALF_V_TAN = Math.tan(rad(BASE_FOV / 2));

function fitFov(aspect: number): number {
  const need = HALF_H_TAN_FLOOR / Math.max(aspect, 0.3);
  const capped = Math.min(need, Math.tan(rad(70 / 2)));
  return deg(Math.atan(Math.max(BASE_HALF_V_TAN, capped)) * 2);
}

/**
 * A frame counts as narrow at exactly the point the lens has to
 * widen to hold the horizontal floor — about 0.71. Deriving both
 * from one number means the alternate framings can never be used
 * with the lens they were not drawn for, and there is no media
 * query to disagree with the canvas.
 */
const isNarrow = (aspect: number) => HALF_H_TAN_FLOOR / Math.max(aspect, 0.3) > BASE_HALF_V_TAN;

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
  {
    name: "The studio",
    pos: [5.6, 4.7, 5.4],
    aim: [0.1, 0.8, -0.6],
    fit: 3.35,
    /* A 6m-wide room in a portrait frame fills the width and
       leaves half the height empty — that is geometry, not a bad
       number. So the portrait overview aims at the middle of the
       room rather than the floor, which centres what there is,
       and swings right so the shelving against the far wall is
       inside the frame instead of sliced off by it. */
    narrowPos: [6.1, 4.6, 4.4],
    narrowAim: [0.55, 1.5, -0.95],
    narrowFit: 2.9,
  },
  {
    name: "The desk",
    pos: [1.5, 2.15, 1.5],
    aim: [0.05, 1.05, -2.05],
    /* Swung right and aimed between the two things that matter, so
       the desk sits right of centre and the television left of it.
       Tapping the screen still flies you into it. */
    narrowPos: [3.39, 2.35, 1.83],
    narrowAim: [-0.7, 1.32, -1.4],
    /* On a laptop this shot is about the desk, so it holds the
       desk. The portrait framing has to carry the television on
       the opposite wall as well, which is a much bigger circle. */
    fit: 1.9,
    narrowFit: 1.78,
  },
  {
    name: "The window",
    pos: [-2.3, 2.6, 3.0],
    aim: [0.3, 1.45, -2.3],
    // Centres the glass, which the desktop framing holds off to one side.
    narrowPos: [-2.95, 2.9, 4.2],
    narrowAim: [0.1, 1.5, -2.3],
    // The glass is 3.6 across, so a touch under two from the middle.
    fit: 1.95,
    narrowFit: 1.72,
  },
  { name: "The corner", pos: [-5.2, 3.8, 3.2], aim: [-1.2, 1.1, -1.7], fit: 2.95 },
  /* Two close-ups.
   *
   * Everything in this room is modelled at a level of detail
   * that cannot survive being eighty pixels tall — spines you
   * can read, veins, a coat, whiskers. From the room framings
   * none of it lands, and no amount of further texturing fixes
   * that; the camera has to come in. */
  {
    name: "The shelf",
    pos: [0.9, 1.75, 0.35],
    aim: [2.45, 1.15, -1.25],
    fit: 0.85,
    narrowFit: 0.62,
  },
  {
    /* Sitting on the sofa, looking at the big screen on the far
       wall. Pulled in from where you would actually sit, because
       a television five metres away is a postage stamp — this is
       the distance it reads at, with enough room around it to
       still be in a room. */
    name: "The sofa",
    /* Dead on the screen's normal: same height, same z, only
       the distance differs. That is not a style choice — the
       picture is an axis-aligned rectangle drawn over the
       stage, and a screen viewed from even slightly off-axis
       projects as a trapezoid. Square-on, the two line up
       exactly. Matching a trapezoid would mean a matrix3d
       transform, which is precisely the thing that cannot be
       clicked. */
    pos: [2.16, 1.85, 0.02],
    aim: [-2.84, 1.85, 0.02],
    /* Back where you would actually be sitting. The screen is
       3.25m across, so at this distance it fills a bit under
       half the frame — big enough to watch, with enough room
       either side that you are still in a room. */
    /* The screen is already 3.25m across — a third more and it
       runs out of wall. So the view comes in instead, which is
       the same thing to look at and does not break the room:
       at this distance the picture fills about two thirds of
       the frame. */
    fit: 1.52,
    narrowFit: 1.3,
    /* Nothing playing: stand back far enough to take in the
       fireplace under the screen as well. It closes back in the
       moment a film starts. */
    restFit: 1.95,
  },
  {
    name: "The sill",
    pos: [0.1, 1.45, -1.2],
    aim: [-1.05, 1.12, -2.42],
    fit: 0.42,
    narrowFit: 0.33,
  },
];

/**
 * What the big set is tuned to out of the box.
 *
 * Daniel's pick. Worth him checking it is the studio's own
 * upload rather than someone's re-post: an unauthorised one
 * disappears when the rights holder files, and all that is left
 * on the page is a dead player. Swapping it is one id.
 */
const FILMS = [{ name: "The Outsiders", id: "iOQisO0KAzM" }];

/**
 * The transport, for either set.
 *
 * Both televisions are the same component with different
 * storage keys, so they get the same controls. Neither set can
 * carry its own: the retro one is a CSS3D element whose
 * children paint in one place and hit-test in another, and the
 * big one is a cross-origin iframe whose controls belong to
 * YouTube. So the buttons live out here on the stage and talk
 * to the player over its message channel.
 *
 * A button that cannot do anything is disabled rather than
 * silently ignored. Skip only appears when the dial has
 * somewhere to go, and the two seek buttons stay out until the
 * player has reported a position — "thirty seconds on from
 * where?" has no answer before that.
 */
function Transport({
  api,
  onOff,
}: {
  api: TVApi | null;
  onOff: () => void;
}) {
  if (!api?.tuned) return null;
  const many = api.dial > 1;
  return (
    <div className="room3d-tvbar">
      {many ? (
        <button type="button" onClick={() => api.step(-1)} aria-label="Previous channel">
          ⏮
        </button>
      ) : null}
      <button type="button" onClick={() => api.restart()} aria-label="Start again">
        ↺
      </button>
      <button
        type="button"
        onClick={() => api.seek(-30)}
        disabled={!api.canSeek}
        aria-label="Back thirty seconds"
      >
        −30
      </button>
      <button
        type="button"
        onClick={() => api.toggle()}
        aria-label={api.playing ? "Pause" : "Play"}
      >
        {api.playing ? "❚❚" : "▶"}
      </button>
      <button
        type="button"
        onClick={() => api.seek(30)}
        disabled={!api.canSeek}
        aria-label="Forward thirty seconds"
      >
        +30
      </button>
      {many ? (
        <button type="button" onClick={() => api.step(1)} aria-label="Next channel">
          ⏭
        </button>
      ) : null}
      <button type="button" onClick={() => api.retune()}>
        Tune
      </button>
      <button type="button" onClick={onOff}>
        Off
      </button>
    </div>
  );
}

/** Derived, so inserting a framing cannot silently point it elsewhere. */
const SOFA_SHOT = SHOTS.findIndex((x) => x.name === "The sofa");

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
  const [library, setLibrary] = useState(false);
  /* The set's controls are drawn by the room, because buttons
     inside the 3D picture cannot be pressed. */
  const [tvApi, setTvApi] = useState<TVApi | null>(null);
  const [flatOn, setFlatOn] = useState(false);
  /* Lit by default. A dark fireplace under a dark screen is a
     hole in the wall. */
  const [fireOn, setFireOn] = useState(true);

  const [phase, setPhase] = useState<Phase>("night");
  const [season, setSeason] = useState<Season>("autumn");
  const [decor, setDecor] = useState<Decor>("plain");
  const [clock, setClock] = useState("--:--");
  const [auto, setAuto] = useState(true);

  const { playing } = useAmbient();

  /* Mutable mirrors, so the render loop never closes over stale
     state and never has to be rebuilt when state changes. */
  const stateRef = useRef({ awake: false, tvOn: false, flatOn: false, fireOn: true, phase, season, playing: false, shot: 0, view: 0 });
  stateRef.current.awake = awake;
  stateRef.current.tvOn = tvOn;
  stateRef.current.flatOn = flatOn;
  stateRef.current.fireOn = fireOn;
  stateRef.current.phase = phase;
  stateRef.current.season = season;
  stateRef.current.playing = playing;
  stateRef.current.shot = shot;
  stateRef.current.view = view;

  const osRootRef = useRef<Root | null>(null);
  const osHostRef = useRef<HTMLDivElement | null>(null);
  const tvRootRef = useRef<Root | null>(null);
  const tvHostRef = useRef<HTMLDivElement | null>(null);
  const flatRootRef = useRef<Root | null>(null);
  const flatHostRef = useRef<HTMLDivElement | null>(null);
  const [flatApi, setFlatApi] = useState<TVApi | null>(null);
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
    const DPR_IDLE = Math.min(window.devicePixelRatio || 1, 1.5);
    /* With the set playing there is a hardware video decode, a
       compositor layer for it and the whole WebGL scene with
       bloom all wanting the same frame. Dropping the 3D to 1x
       while the television is on costs a little crispness and
       buys back far more than it costs. */
    const DPR_TV = Math.min(window.devicePixelRatio || 1, 1);
    renderer.setPixelRatio(DPR_IDLE);
    let dprNow = DPR_IDLE;
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
    const camera = new THREE.PerspectiveCamera(fitFov(w / h), w / h, 0.05, 400);
    camera.position.set(0.35, 1.6, 1.6);

    /* Something for the glossy things to reflect.
     *
     * Built once from a handful of coloured panels that match
     * this room's own light, pre-filtered into a mip chain, and
     * then thrown away — what survives is one small cube map.
     * Without it every high-metalness surface in here renders
     * black, because a mirror with nothing in front of it is
     * black and point lights are not something a mirror can
     * show you. */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = buildEnvScene();
    const envRT = pmrem.fromScene(envScene, 0.08);
    disposeEnvScene(envScene);
    pmrem.dispose();
    scene.environment = envRT.texture;
    /* Low. This is here to put highlights on metal, not to
       light the room — the lamps do that, and an environment
       turned up far enough to notice flattens a night interior
       into an overcast afternoon. */
    scene.environmentIntensity = 0.3;

    const built = buildRoom();
    builtRef.current = built;
    scene.add(built.root);

    /* ── CSS3D: the two screens ────────────────────────── */
    const css = new CSS3DRenderer();
    css.setSize(w, h);
    css.domElement.classList.add("room3d-css");
    host.appendChild(css.domElement);

    /* The desktop.
     *
     * NOT a CSS3D object any more. It was, and the OS worked
     * perfectly while being completely unclickable: a CSS3D
     * element carries a matrix3d whose scale here is about
     * 0.0008 (a 780px-wide element standing in for 62cm of
     * world), and at that scale Chromium paints the element in
     * the right place but hit-tests it somewhere else entirely.
     * Every click on the screen fell through to the canvas
     * behind it. Calling .click() on a button opened its window;
     * a mouse could not.
     *
     * So while you are sitting at the machine it is a flat panel
     * over the stage, scaled with a plain 2D transform, which
     * hit-tests exactly and comes out pixel-crisp instead of
     * resampled through a perspective matrix. The camera is
     * square-on to the screen at that point, so it looks the
     * same. Across the room there is nothing to show: the OS
     * renders null and the dark screen in the model stands in.
     */
    const osHost = osHostRef.current;

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

    /* The cursor, as a light.
     *
     * Two halves that have to agree. This one is DOM: a soft
     * halo with a small bright centre, so there is still a
     * precise point to aim with — a pure glow with no centre is
     * pretty and unusable. The other half is a real light in the
     * scene, below, so moving it actually lifts what it passes
     * over rather than just drawing on top of the picture.
     *
     * Only where there is a pointer to replace. A touch screen
     * has none, and hiding a cursor that was never there just
     * leaves a glow stuck wherever the last tap landed.
     */
    const torch = document.createElement("div");
    torch.className = "room3d-torch";
    host.appendChild(torch);
    const hasHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (hasHover) host.classList.add("has-torch");

    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInside = true;
      if (hasHover) {
        torch.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px) translate(-50%, -50%)`;
        torch.style.opacity = "1";
      }
    };
    const onPointerLeave = () => {
      pointerInside = false;
      torch.style.opacity = "0";
    };

    /**
     * What is under a given point on the canvas.
     *
     * The click handler used to read whatever the hover raycast
     * had last found, which is fine with a mouse and useless with
     * a finger: a tap fires pointerleave *before* click, so the
     * loop had already cleared the hover and every tap on the
     * monitor or the set went nowhere. Raycasting from the event's
     * own coordinates needs no hover to have happened first.
     */
    /**
     * Whose name wins, given a ray.
     *
     * Most targets are invisible stand-in boxes, and some of
     * them contain other targets: the sofa's box encloses its
     * own cushions, so the nearest hit is the box and a click
     * aimed at a cushion sat you down instead of throwing it.
     * Real geometry therefore beats a proxy whenever both are
     * on the ray. Only deliberate targets are in this list, so
     * there is nothing else for the rule to catch by accident.
     *
     * Both the click and the per-frame hover go through here,
     * or the thing the cursor says it is over would not be the
     * thing a click acts on.
     */
    const resolve = (r: THREE.Raycaster): THREE.Intersection | null => {
      const live = built.targets.filter((o) => o.visible && !o.userData.inactive);
      const hits = r.intersectObjects(live, false);
      if (!hits.length) return null;
      const real = hits.find((x) => !x.object.userData.proxy);
      return real ?? hits[0];
    };

    const pickV = new THREE.Vector2();
    const pick = (clientX: number, clientY: number): string | null => {
      const rect = host.getBoundingClientRect();
      pickV.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pickV, camera);
      return resolve(ray)?.object.name ?? null;
    };

    const onClick = (e: MouseEvent) => {
      const name = pick(e.clientX, e.clientY);
      if (name) pokeRef.current?.(name);
    };

    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);
    host.addEventListener("click", onClick);

    /* ── Hotspots ──────────────────────────────────────── */
    /**
     * Three dots that say "this one does something".
     *
     * Nothing in a rendered room announces that it is clickable,
     * and on a phone there is no cursor to change shape and no
     * hover to discover it with. These are DOM, not geometry, so
     * they stay a legible size whatever the camera is doing, and
     * they are buttons, so a tap on the dot works as well as a tap
     * on the object.
     *
     * `shown` is per-object, and the two cases are not symmetric.
     * The set is bolted to the left wall and faces into the room,
     * so once the camera walks past that wall you are looking at
     * its back and the dot has to go. The shelving only stands
     * against the right wall — dropping that wall reveals it
     * rather than hiding it — so it is visible from everywhere,
     * and the frame test below is all it needs.
     */
    type Spot = {
      name: string;
      label: string;
      anchor: THREE.Vector3;
      shown: (camX: number) => boolean;
      el: HTMLButtonElement;
    };

    const spotLayer = document.createElement("div");
    spotLayer.className = "room3d-spots";
    host.appendChild(spotLayer);

    const makeSpot = (
      name: string,
      label: string,
      anchor: THREE.Vector3,
      shown: (camX: number) => boolean,
    ): Spot => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "room3d-spot";
      el.setAttribute("aria-label", label);
      el.innerHTML = `<i aria-hidden="true"></i><span>${label}</span>`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        pokeRef.current?.(name);
      });
      spotLayer.appendChild(el);
      return { name, label, anchor, shown, el };
    };

    const spots: Spot[] = [
      makeSpot(
        "monitor",
        "Sit down",
        built.screen.position.clone().add(new THREE.Vector3(0, 0.27, 0.02)),
        () => true,
      ),
      makeSpot(
        "tv",
        "Turn it on",
        built.tv.position.clone().add(new THREE.Vector3(0, 0.3, 0)),
        (x) => x > -2.4,
      ),
      makeSpot("shelf", "Find a book", new THREE.Vector3(2.6, 1.5, -1.25), () => true),
      makeSpot("sofa", "Take a seat", new THREE.Vector3(2.08, 1.05, 0.5), () => true),
      makeSpot(
        "flat",
        "Put a film on",
        built.flat.position.clone().add(new THREE.Vector3(0, built.flat.height / 2 + 0.1, 0)),
        (x) => x > -2.4,
      ),
    ];
    const projV = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    const flatRight = new THREE.Vector3();
    const flatAt = { x: -1, y: -1, fit: -1 };

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
    /* Measured from the canvas, not from a media query, so it
       survives rotating the phone and resizing a window. */
    const rig = { narrow: false, tanV: BASE_HALF_V_TAN, tanH: BASE_HALF_V_TAN };
    const measure = () => {
      const aspect = w / h;
      rig.narrow = isNarrow(aspect);
      rig.tanV = Math.tan(rad(fitFov(aspect) / 2));
      rig.tanH = rig.tanV * aspect;
    };
    measure();
    const WAKE_AIM = built.screen.position.clone();
    const WAKE_POS = new THREE.Vector3();
    /**
     * How far back to sit.
     *
     * A fixed 0.58m was authored against a landscape frame. On a
     * phone the horizontal half-angle is less than half of that,
     * so the 62cm screen overflowed the frame in every direction
     * — the desktop filled the viewport, the dock went off the
     * bottom, and with it the only way out.
     *
     * Solved from the frame instead: back off until the screen
     * fits both axes, with a little air so it is framed rather
     * than wedged in.
     */
    const seat = () => {
      const half = built.screen.width / 2;
      const halfH = built.screen.height / 2;
      const d = Math.max(half / rig.tanH, halfH / rig.tanV) * 1.16;
      WAKE_POS.set(WAKE_AIM.x, WAKE_AIM.y, WAKE_AIM.z + Math.max(0.45, d));
    };
    seat();

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
      flatI: 0,
      fireI: 0,
      coalI: 0,
      city: 1,
      rain: 1,
    fog: 0x0b0720,
    };
    const sunCol = new THREE.Color();
    const fillCol = new THREE.Color();
    const skyTop = new THREE.Color();
    const skyMid = new THREE.Color();
    const skyBot = new THREE.Color();
    const vistaTint = new THREE.Color();
    const WHITE = new THREE.Color(0xffffff);
    const sunPos = new THREE.Vector3();
    const cityCol = new THREE.Color();
    const fogCol = new THREE.Color();
    let starAmt = 1;
    let vinylSpin = 0;
    let chairSpin = 0;

    /* The scene half of the cursor light. Dim and short-range on
       purpose — bright enough to lift the surface it is passing
       over, not bright enough to light the room or to compete
       with the lamp and the neon. */
    const torchLight = new THREE.PointLight(0xffd9a8, 0, 1.5, 2.2);
    scene.add(torchLight);

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
        const hit = resolve(ray);
        const next = hit?.object.name ?? null;
        if (next !== hoverName) {
          hoverName = next;
          setHovered(next);
        }
        if (hit) cursorWorld.copy(hit.point);
        else {
          // No object under the cursor: project onto a plane at
          // the desk so the cat still tracks an empty hand.
          ray.ray.at(2.6, cursorWorld);
        }
      } else if (hoverName !== null) {
        hoverName = null;
        setHovered(null);
      }

      // Sits just off the surface, or it lights the inside of it.
      torchLight.position.copy(cursorWorld).addScaledVector(camera.position.clone().sub(cursorWorld).normalize(), 0.22);
      torchLight.intensity = lerp(
        torchLight.intensity,
        pointerInside && !s.awake ? 0.62 : 0,
        Math.min(1, dt * 6),
      );

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
      /* The underglow. Off in daylight, up with the rest of the
         neon after dark, and brighter when the chair is touched —
         it is the one thing in the room that answers back
         immediately. */
      const glowMat = p.chairGlowRing.material as THREE.MeshBasicMaterial;
      glowMat.opacity = Math.min(
        0.95,
        cur.neon * (0.5 + chairFocus * 0.45) * (reduced ? 1 : 0.88 + Math.sin(t * 1.7) * 0.12),
      );

      // Speaker cones breathe with the music.
      const beat = s.playing && !reduced ? 1 + Math.sin(t * 7.5) * 0.09 + Math.sin(t * 3.1) * 0.05 : 1;
      p.speakerCones.forEach((c, i) => c.scale.setScalar(beat - i * 0.02 * (beat - 1)));
      const speakerFocus = touch("speaker");

      // Neon hum, plus a rare flicker. Real tubes do this.
      const neonFocus = touch("neon");
      const flick = reduced ? 1 : Math.sin(t * 90) > 0.985 ? 0.35 : 1;
      /* This used to hard-set the tube magenta on every frame,
         which quietly overrode the material and was why changing
         the sign's colour appeared to do nothing. The colour
         lives on the material now; this only dims it, which is
         what the flicker was computed for and never used on. */
      p.neonMat.color.copy(p.neonBase).multiplyScalar(flick * (0.9 + neonFocus * 0.35));
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
      /* Every view is painted on the pane, the city included —
         unless the scene has photographs behind the glass, in
         which case the pane gets out of their way. */
      built.vistas.prime(s.view);
      const photo = built.vistas.ready(s.view);
      built.vistas.show(photo ? s.view : -1);
      if (!reduced) built.vistas.tick(t);
      p.vistaMat.uniforms.uScene.value = s.view;
      p.vistaMat.uniforms.uTime.value = reduced ? 0 : t;
      p.vista.visible = !photo;

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
      // The pane carries the view now, so the hour has to reach it
      // as well as the dome behind it.
      const vu = p.vistaMat.uniforms;
      (vu.uTop.value as THREE.Color).lerp(skyTop, k);
      (vu.uMid.value as THREE.Color).lerp(skyMid, k);
      (vu.uBot.value as THREE.Color).lerp(skyBot, k);
      vu.uStars.value = starAmt;
      u.uTime.value = reduced ? 0 : t;

      /* A photograph was taken under whatever light it was taken
         under, which at three in the morning is the wrong light.
         Grading it toward the hour's sky — hard at night, barely
         at all at midday — is what stops it reading as a poster
         taped over the window. */
      const night = 1 - Math.min(1, mood.ambient.intensity / 1.5);
      vistaTint.copy(skyMid).lerp(WHITE, 0.55).multiplyScalar(0.45 + 0.55 * (1 - night));
      vistaTint.lerp(WHITE, 1 - night);
      built.vistas.tint(vistaTint);

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
      /* The big set. Its picture is a flat panel drawn over the
         stage rather than geometry, so in the room all there is
         to show is the dark glass and the light it throws. */
      const flatLive = s.flatOn && s.shot === SOFA_SHOT && !s.awake;

      /* Fit the player to where the screen actually is.
       *
       * A fixed-size panel in the middle of the stage is a
       * cinema overlay, not a television in a room. The set is
       * rotated to face the sofa, so its width runs along world
       * -z; projecting both edges gives the exact pixel width
       * and centre it occupies this frame, and the panel is
       * scaled and placed to match. The illusion holds because
       * this framing looks square-on at it. */
      const flatEl = flatHostRef.current;
      if (flatLive && flatEl) {
        const half = built.flat.width / 2;
        edgeA.copy(built.flat.position).add(flatRight.set(0, 0, -half)).project(camera);
        edgeB.copy(built.flat.position).add(flatRight.set(0, 0, half)).project(camera);
        projV.copy(built.flat.position).project(camera);
        const px = Math.abs(edgeB.x - edgeA.x) * 0.5 * w;
        const cx = Math.round((projV.x * 0.5 + 0.5) * w);
        const cy = Math.round((-projV.y * 0.5 + 0.5) * h);
        const fit = Math.round(Math.max(0.12, px / 960) * 500) / 500;
        /* Only when it has actually moved. Writing a fresh
           transform every frame relaid out an iframe sixty times
           a second off a camera that never stops breathing,
           which is what made the picture shimmer. */
        if (cx !== flatAt.x || cy !== flatAt.y || fit !== flatAt.fit) {
          flatAt.x = cx;
          flatAt.y = cy;
          flatAt.fit = fit;
          flatEl.style.left = `${cx}px`;
          flatEl.style.top = `${cy}px`;
          flatEl.style.setProperty("--flat-fit", String(fit));
        }
      }
      cur.flatI = lerp(cur.flatI, flatLive ? 1.5 : 0, Math.min(1, dt * 3));
      built.lamps.flat.intensity = cur.flatI * (reduced ? 1 : 0.9 + Math.sin(t * 9) * 0.1);
      (p.flatGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.72, cur.flatI * 0.42);
      p.flatOff.visible = !flatLive;
      (p.flatLed.material as THREE.MeshBasicMaterial).color.setHex(flatLive ? 0x4affa0 : 0xff5a4a);

      /* The fire.
       *
       * uLevel carries the flicker rather than the light alone,
       * so the flame itself shortens and gutters instead of the
       * room just getting dimmer around a steady shape. Two
       * beating sines plus a slow one: a fire is never periodic,
       * and anything that is reads as a loop within seconds.
       * uHue walks the ramp round the wheel on a cycle long
       * enough that you notice the colour has changed without
       * ever catching it changing. */
      const fireFocus = touch("hearth");
      const gutter = reduced
        ? 1
        : 0.89 + Math.sin(t * 11.3) * 0.05 + Math.sin(t * 4.1) * 0.04 + Math.sin(t * 1.7) * 0.03;
      cur.fireI = lerp(cur.fireI, s.fireOn ? 1 : 0, Math.min(1, dt * 2.4));
      const fireLevel = cur.fireI * gutter * (1 + fireFocus * 0.22);
      for (const fm of p.fireMats) {
        fm.uniforms.uTime.value = reduced ? 0 : t;
        fm.uniforms.uHue.value = reduced ? 0.04 : (t * 0.021) % 1;
        fm.uniforms.uLevel.value = fireLevel;
      }
      /* The bed and the sparks run off the same level, so
         putting the fire out takes the coals and the embers
         with it rather than leaving them hanging in the dark.
         The coals lag, though — they are the last thing to go
         cold and the slowest to come back. */
      cur.coalI = lerp(cur.coalI, s.fireOn ? 1 : 0, Math.min(1, dt * 0.7));
      p.coalMat.uniforms.uTime.value = reduced ? 0 : t;
      p.coalMat.uniforms.uLevel.value = cur.coalI;
      p.sparkMat.uniforms.uTime.value = reduced ? 0 : t;
      p.sparkMat.uniforms.uLevel.value = cur.fireI;
      built.lamps.fire.intensity = cur.fireI * gutter * (0.85 + fireFocus * 0.3);
      /* And the dark screen above it catches that light. */
      (p.flatOff.material as THREE.MeshStandardMaterial).emissiveIntensity =
        flatLive ? 0 : cur.fireI * gutter * 0.5;

      /* The candle. Its own flicker, faster and shallower than
         the hearth's — a small flame reacts to air the big one
         does not notice. */
      const cflick = reduced
        ? 1
        : 0.86 + Math.sin(t * 7.7) * 0.07 + Math.sin(t * 2.9 + 1.4) * 0.07;
      p.candleMat.uniforms.uTime.value = reduced ? 0 : t;
      p.candleMat.uniforms.uLevel.value = cflick;
      built.lamps.candle.intensity = cflick * 0.55;

      p.tvOff.visible = !s.tvOn;
      /* The picture is a CSS3D element, which the browser sizes
         by distance — sitting at the desk it was being laid out
         at tens of thousands of pixels across, with a YouTube
         player inside it. A DOM layer that size with live video
         in it is the single most expensive thing on the page,
         and at the desk you cannot see the set anyway. */
      tvHost.style.visibility = s.tvOn && !s.awake ? "visible" : "hidden";

      /* Hotspots, projected to the canvas. */
      for (const spot of spots) {
        projV.copy(spot.anchor).project(camera);
        /* Behind the camera, or off the side of the frame — a dot
           pinned to the edge for something you cannot see reads
           as a bug. */
        const onFrame =
          projV.z < 1 && Math.abs(projV.x) < 0.94 && Math.abs(projV.y) < 0.94;
        const live = !s.awake && onFrame && spot.shown(camPos.x);
        spot.el.style.opacity = live ? "1" : "0";
        spot.el.style.pointerEvents = live ? "auto" : "none";
        if (!live) continue;
        const sx = (projV.x * 0.5 + 0.5) * w;
        const sy = (-projV.y * 0.5 + 0.5) * h;
        spot.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
        /* The label sits to the right of its dot, which runs it
           off the edge for anything in the right of the frame —
           on a phone that is most of "FIND A BOOK". Past the
           two-thirds mark it hangs off the other side instead. */
        spot.el.classList.toggle("is-flipped", projV.x > 0.3);
        spot.el.classList.toggle("is-near", hoverName === spot.name);
      }

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
        seat();
        wantPos.copy(WAKE_POS);
        wantAim.copy(WAKE_AIM);
      } else {
        const sh = SHOTS[s.shot] ?? SHOTS[0];
        const useNarrow = rig.narrow && sh.narrowPos && sh.narrowAim;
        const aim = useNarrow ? sh.narrowAim! : sh.aim;
        const pos = useNarrow ? sh.narrowPos! : sh.pos;
        wantAim.set(aim[0], aim[1], aim[2]);
        wantPos.set(pos[0], pos[1], pos[2]);

        /* Fit, rather than place.
         *
         * The authored position only fixes the *direction* the
         * camera looks from; how far back it stands is solved
         * each frame from the frame's own shape. Back off until a
         * sphere of `fit` metres around the aim point fills the
         * tighter of the two half-angles, and the picture is full
         * on a phone, a laptop and a full-screen ultrawide alike
         * — instead of being right on one of them and ringed with
         * empty room on the others. */
        wantPos.sub(wantAim);
        const reach = Math.max(0.001, wantPos.length());
        const watching = s.flatOn && s.shot === SOFA_SHOT;
        const radius =
          !watching && sh.restFit
            ? sh.restFit
            : (useNarrow && sh.narrowFit) || sh.fit;
        const want = radius / Math.min(rig.tanV, rig.tanH);
        // 0.7 rather than 1.6: the close-ups need to get close.
        wantPos.multiplyScalar(THREE.MathUtils.clamp(want, 0.7, 14) / reach).add(wantAim);
        /* Dead still while a film is on. The room breathing is
           what keeps it alive the rest of the time; under a
           picture it is a camera that will not sit down. */
        if (!reduced && !watching) {
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
      // Nothing in the CSS layer unless the set is on and visible.
      if (s.tvOn && !s.awake) css.render(scene, camera);

      const wantDpr = s.tvOn && !s.awake ? DPR_TV : DPR_IDLE;
      if (wantDpr !== dprNow) {
        dprNow = wantDpr;
        renderer.setPixelRatio(wantDpr);
        composer.setPixelRatio?.(wantDpr);
        resize();
      }
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
      if (name === "shelf") {
        setLibrary(true);
        return;
      }
      if (name === "hearth") {
        setFireOn((v) => !v);
        return;
      }
      if (name === "sofa") {
        /* Sitting down, without starting anything. The film is
           a separate decision — clicking the screen makes it,
           clicking the sofa just moves you there. */
        setAwake(false);
        setShot(SOFA_SHOT);
        return;
      }
      if (name === "flat") {
        /* Sit down first. The picture only plays from the sofa
           framing, where the camera is square-on to the screen
           and the player can be a flat panel with working
           controls — a film you cannot pause is not a film. */
        setShot(SOFA_SHOT);
        setFlatOn((v) => !v);
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
      /* The OS panel is laid out at a fixed 780x464 because its
         window geometry is in pixels; it is scaled to the stage
         rather than reflowed. */
      if (osHost) {
        const fit = Math.min((w * 0.94) / 780, (h * 0.88) / 464);
        osHost.style.setProperty("--os-fit", String(Math.max(0.2, fit)));
      }
      camera.aspect = w / h;
      camera.fov = fitFov(w / h);
      camera.updateProjectionMatrix();
      measure();
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
      if (spotLayer.parentNode === host) host.removeChild(spotLayer);
      if (torch.parentNode === host) host.removeChild(torch);
      composer.dispose();
      built.dispose();
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      if (css.domElement.parentNode === host) host.removeChild(css.domElement);
      builtRef.current = null;
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

  /* The big set. Its own storage key, so the two televisions do
     not overwrite each other's channel, and no preset stations —
     it waits to be given something rather than guessing. */
  useEffect(() => {
    const el = flatHostRef.current;
    if (!el) {
      flatRootRef.current?.render(null);
      return;
    }
    if (!flatRootRef.current) flatRootRef.current = createRoot(el);
    flatRootRef.current.render(
      <AtelierTV
        onApi={setFlatApi}
        storeKey="atelier.flat"
        stations={FILMS}
        kicker="Nothing on"
        hint="Paste a YouTube link"
      />,
    );
  }, [flatOn, shot, awake, ready]);

  useEffect(() => {
    if (!ready) return;
    const el = tvHostRef.current;
    if (!el) return;
    if (!tvRootRef.current) tvRootRef.current = createRoot(el);
    tvRootRef.current.render(tvOn ? <AtelierTV onApi={setTvApi} /> : null);
  }, [ready, tvOn]);

  // Unmount the React roots on teardown, on their own, because
  // doing it inside the scene effect races with React's own commit.
  useEffect(() => {
    return () => {
      const roots = [osRootRef.current, tvRootRef.current, flatRootRef.current];
      osRootRef.current = null;
      tvRootRef.current = null;
      flatRootRef.current = null;
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
    <div className={`atelier${awake ? " is-awake" : ""}${flatOn && shot === SOFA_SHOT ? " is-watching" : ""}`}>
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
        {/* The way out.
            Sitting down at the machine, the only exit used to be
            a Sleep button in the desktop's own dock — which is
            inside the 3D screen, so the moment that screen does
            not fit the frame the exit leaves with it. This one is
            part of the page, not part of the room, so it cannot
            go off the bottom of anything. */}
        {/* The desktop, as a flat panel. See the note in the scene
            effect for why this is not a CSS3D object. */}
        <div className="room3d-os" ref={osHostRef} aria-hidden={!awake} />

        {/* The big set's picture. A panel over the stage rather
            than geometry in it: a film needs play, pause and
            seek, and those are the player's own controls, which
            cannot be pressed inside a CSS3D element. The sofa
            framing looks square-on at the screen, so a flat
            panel sits exactly where the glass is. */}
        {/* The host div is owned by a separate React root, which
            clears whatever is inside it — so the controls are a
            sibling of the picture, never a child of it. */}
        {ready && flatOn && shot === SOFA_SHOT && !awake ? (
          <>
            <div className="room3d-flat" ref={flatHostRef} />
            <Transport api={flatApi} onOff={() => setFlatOn(false)} />
          </>
        ) : null}

        {ready && tvOn && !awake ? (
          <Transport api={tvApi} onOff={() => setTvOn(false)} />
        ) : null}

        {ready && awake ? (
          <button type="button" className="room3d-leave" onClick={sleep}>
            ← Back to the room
          </button>
        ) : null}

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

        {library ? <AtelierLibrary onClose={() => setLibrary(false)} /> : null}
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
  cat2: "Doing laps. Will stop if you look.",
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
