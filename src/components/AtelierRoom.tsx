"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AtelierOS from "./AtelierOS";
import {
  moodNow,
  PHASE_ORDER,
  SEASON_ORDER,
  type Phase,
  type Season,
} from "@/lib/atelier-time";

/**
 * The Lab — a corner room with a machine in it.
 *
 * Drawn as vector rather than rendered in 3D, for two reasons that
 * both matter. The homepage already owns a WebGL context for the
 * globe, and a second one is how you turn a mid-range phone into a
 * space heater. And an illustrated room can be relit by swapping a
 * handful of CSS custom properties — which is the only thing that
 * makes four times of day times four seasons tractable at all.
 * Sixteen rooms, one palette table.
 *
 * Nothing below is hard-coded to a particular hour. Every colour in
 * the scene is a token, and the tokens come from the clock.
 */

/* ── Palettes ──────────────────────────────────────────────────
   Phase sets the light: what comes through the window, what the
   walls do with it, and how hard the lamp has to work. */
const PHASE_PALETTE: Record<Phase, Record<string, string>> = {
  dawn: {
    "--sky-1": "#141c3a",
    "--sky-2": "#4a4274",
    "--sky-3": "#e8a177",
    "--city-far": "#2a2748",
    "--city-near": "#15142b",
    "--wall": "#2b2538",
    "--wall-2": "#1f1a2a",
    "--floor": "#201a26",
    "--rug": "#3a2a3c",
    "--desk": "#4a3528",
    "--desk-2": "#2e2019",
    "--glow": "rgba(255, 186, 142, 0.20)",
    "--shaft": "rgba(255, 198, 158, 0.13)",
    "--neon": "#ff6fa8",
    "--sun": "#ffd9b0",
    "--screen-tint": "#8fb7d6",
    "--lamp": "0.34",
    "--room-dim": "0.22",
    "--stars": "0.25",
    "--city-lit": "0.45",
  },
  day: {
    "--sky-1": "#5d92cf",
    "--sky-2": "#9cc5e6",
    "--sky-3": "#dceaf4",
    "--city-far": "#8fa9c2",
    "--city-near": "#5d708a",
    "--wall": "#4b4356",
    "--wall-2": "#3a3343",
    "--floor": "#372d3a",
    "--rug": "#55404f",
    "--desk": "#6b4c33",
    "--desk-2": "#432f20",
    "--glow": "rgba(246, 250, 255, 0.26)",
    "--shaft": "rgba(255, 253, 245, 0.17)",
    "--neon": "#ff6fa8",
    "--sun": "#fffaf0",
    "--screen-tint": "#a9cbe4",
    "--lamp": "0",
    "--room-dim": "0.06",
    "--stars": "0",
    "--city-lit": "0",
  },
  dusk: {
    "--sky-1": "#241546",
    "--sky-2": "#79356d",
    "--sky-3": "#ef7a3c",
    "--city-far": "#3a1f48",
    "--city-near": "#1b0f26",
    "--wall": "#2a1b33",
    "--wall-2": "#1d1225",
    "--floor": "#1c1222",
    "--rug": "#3d2338",
    "--desk": "#4a3024",
    "--desk-2": "#2b1a14",
    "--glow": "rgba(255, 138, 86, 0.24)",
    "--shaft": "rgba(255, 150, 92, 0.16)",
    "--neon": "#ff4f98",
    "--sun": "#ffb061",
    "--screen-tint": "#9ec2dd",
    "--lamp": "0.58",
    "--room-dim": "0.24",
    "--stars": "0.4",
    "--city-lit": "0.8",
  },
  night: {
    "--sky-1": "#07061a",
    "--sky-2": "#241048",
    "--sky-3": "#6d1f5c",
    "--city-far": "#180e33",
    "--city-near": "#0a0618",
    "--wall": "#241a42",
    "--wall-2": "#18112e",
    "--floor": "#1b1430",
    "--rug": "#3b2350",
    "--desk": "#452c45",
    "--desk-2": "#261733",
    "--glow": "rgba(132, 96, 230, 0.26)",
    "--shaft": "rgba(150, 120, 255, 0.13)",
    "--neon": "#ff2f86",
    "--sun": "#e6ecfb",
    "--screen-tint": "#bcd8ef",
    "--lamp": "1",
    "--room-dim": "0.26",
    "--stars": "1",
    "--city-lit": "1",
  },
};

/* Season changes what grows, outside and in. The room does not
   redecorate itself — only the light and the leaves move. */
const SEASON_PALETTE: Record<Season, Record<string, string>> = {
  spring: {
    "--leaf": "#5f9150",
    "--leaf-2": "#86b468",
    "--leaf-3": "#44703f",
    "--ground": "#3f5a38",
  },
  summer: {
    "--leaf": "#3f7a42",
    "--leaf-2": "#5f9a4e",
    "--leaf-3": "#2d5c32",
    "--ground": "#35522f",
  },
  autumn: {
    "--leaf": "#a8652b",
    "--leaf-2": "#cf8f3c",
    "--leaf-3": "#7d4420",
    "--ground": "#4a3524",
  },
  winter: {
    "--leaf": "#5c6b72",
    "--leaf-2": "#7f8e96",
    "--leaf-3": "#44525a",
    "--ground": "#5e676e",
  },
};

/** Where the sun or moon sits in the window, per phase. */
const ORB: Record<Phase, { y: number; r: number }> = {
  dawn: { y: 362, r: 30 },
  day: { y: 158, r: 32 },
  dusk: { y: 374, r: 34 },
  night: { y: 150, r: 22 },
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

/* ── Deterministic scatter ─────────────────────────────────────
   Math.random would hand the server one room and the client
   another, and React would rightly complain. A hash of the index
   gives scatter that both sides agree on. */
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* Lit windows in the skyline. Built once, at module scope, so the
   array identity never changes and React never re-keys them. */
const CITY_WINDOWS = Array.from({ length: 240 }, (_, i) => ({
  x: 322 + Math.floor(rand(i, 1) * 80) * 10.1,
  y: 184 + Math.floor(rand(i, 2) * 21) * 11.6,
  w: 3.6,
  h: 5,
  o: 0.28 + rand(i, 3) * 0.72,
}));

const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: 322 + rand(i, 7) * 800,
  y: 88 + rand(i, 8) * 150,
  r: 0.7 + rand(i, 9) * 1.5,
  o: 0.35 + rand(i, 10) * 0.6,
}));

const MOTES = Array.from({ length: 16 }, (_, i) => ({
  x: 360 + rand(i, 11) * 640,
  y: 200 + rand(i, 12) * 300,
  r: 1.2 + rand(i, 13) * 1.8,
  d: 9 + rand(i, 14) * 11,
}));

/* ── Traffic ───────────────────────────────────────────────────
   Five lanes over the city. `base` is where a craft rests when
   motion is switched off — the CSS transform that flies it across
   overrides the attribute, so with the animation gone the ship
   falls back to a sensible parked position instead of the origin.
   Far craft are small, slow and dim; close ones are quick. */
type Ship = {
  kind: "liner" | "darter" | "hauler";
  base: number;
  y: number;
  scale: number;
  dur: number;
  delay: number;
  /** Right to left. */
  back?: boolean;
  dim?: number;
};

const SHIPS: Ship[] = [
  { kind: "liner", base: 402, y: 132, scale: 1, dur: 52, delay: -8, dim: 1 },
  { kind: "darter", base: 700, y: 196, scale: 0.72, dur: 9.5, delay: -2, back: true },
  { kind: "darter", base: 520, y: 112, scale: 0.46, dur: 15, delay: -6, dim: 0.6 },
  { kind: "hauler", base: 840, y: 298, scale: 0.8, dur: 31, delay: -14, back: true },
  { kind: "darter", base: 610, y: 238, scale: 0.9, dur: 7.4, delay: -19 },
];

export default function AtelierRoom() {
  // Rendered on the server too, so it must not read the clock until
  // after mount or the markup mismatches and React complains.
  const [phase, setPhase] = useState<Phase>("night");
  const [season, setSeason] = useState<Season>("autumn");
  const [clock, setClock] = useState("--:--");
  const [auto, setAuto] = useState(true);
  const [awake, setAwake] = useState(false);
  const [reduced, setReduced] = useState(false);
  const wakeRef = useRef<SVGGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Follow the real clock until the visitor takes over.
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

  // Escape backs out of the machine — the same reflex as any
  // full-screen thing, and the only way out for a keyboard.
  useEffect(() => {
    if (!awake) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAwake(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [awake]);

  // Sitting down at the desk means the desk should be in front of
  // you. Without this the camera pushes in on something half off
  // the top of the window.
  const wake = useCallback(() => {
    setAwake(true);
    stageRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  // Hand focus back to the monitor on the way out, or it lands at
  // the top of the document and the room scrolls away.
  const sleep = useCallback(() => {
    setAwake(false);
    window.setTimeout(() => wakeRef.current?.focus(), 60);
  }, []);

  const toggleWake = useCallback(() => {
    if (awake) sleep();
    else wake();
  }, [awake, sleep, wake]);

  const step = <T,>(list: T[], current: T, next?: T): T =>
    next ?? list[(list.indexOf(current) + 1) % list.length];

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

  const vars = {
    ...PHASE_PALETTE[phase],
    ...SEASON_PALETTE[season],
  } as React.CSSProperties;

  const orb = ORB[phase];
  const dark = phase === "night" || phase === "dusk";

  return (
    <div className="atelier" style={vars} data-phase={phase} data-season={season}>
      <div className={`atelier-stage${awake ? " is-awake" : ""}`} ref={stageRef}>
        <div className="room-layer">
          <svg
            className="room"
            viewBox="0 0 1200 760"
            role="img"
            aria-label={`An illustrated corner studio at ${PHASE_NOTE[
              phase
            ].toLowerCase()} in ${SEASON_NOTE[
              season
            ].toLowerCase()} — a desk against a wide window over a lit city, an iMac, a lamp and plants.`}
          >
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--sky-1)" />
                <stop offset="56%" stopColor="var(--sky-2)" />
                <stop offset="100%" stopColor="var(--sky-3)" />
              </linearGradient>

              <linearGradient id="wallGrad" x1="0" y1="0" x2="0.25" y2="1">
                <stop offset="0%" stopColor="var(--wall)" />
                <stop offset="100%" stopColor="var(--wall-2)" />
              </linearGradient>

              <linearGradient id="deskGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--desk)" />
                <stop offset="100%" stopColor="var(--desk-2)" />
              </linearGradient>

              <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--floor)" />
                <stop offset="100%" stopColor="var(--wall-2)" />
              </linearGradient>

              <linearGradient id="screenGrad" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="var(--screen-tint)" />
                <stop offset="100%" stopColor="#3f5f7d" />
              </linearGradient>

              <radialGradient id="lampGrad" cx="50%" cy="0%" r="100%">
                <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#ffd9a0" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="neonGrad" cx="50%" cy="50%">
                <stop offset="0%" stopColor="var(--neon)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="var(--neon)" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="biasGrad" cx="50%" cy="50%">
                <stop offset="0%" stopColor="var(--screen-tint)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="var(--screen-tint)" stopOpacity="0" />
              </radialGradient>

              <radialGradient id="winGlow" cx="50%" cy="46%">
                <stop offset="0%" stopColor="var(--glow)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>

              <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#000" stopOpacity="0.3" />
                <stop offset="30%" stopColor="#000" stopOpacity="0" />
                <stop offset="80%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#000" stopOpacity="0.34" />
              </linearGradient>

              <clipPath id="winClip">
                <rect x="318" y="84" width="812" height="352" rx="3" />
              </clipPath>

              {/* One monstera leaf, reused at a dozen angles. The
                  notches are cut into the outline rather than
                  painted over it, so it survives any backdrop. */}
              <path
                id="monstera"
                d="M0,0 C-16,-6 -38,-18 -45,-36 L-25,-43
                   C-34,-55 -38,-66 -37,-77 L-19,-74
                   C-23,-87 -21,-97 -15,-107 L-3,-99
                   C-1,-108 0,-114 0,-121
                   C1,-114 2,-108 4,-99 L16,-107
                   C22,-97 24,-87 20,-74 L38,-77
                   C39,-66 35,-55 26,-43 L46,-36
                   C39,-18 17,-6 0,0 Z"
              />

              {/* A sansevieria blade. Straight, tapered, stubborn. */}
              <path
                id="blade"
                d="M0,0 C-8,-34 -9,-78 -3,-122 C-1,-130 2,-130 4,-122
                   C10,-78 8,-34 0,0 Z"
              />

              <filter id="soft" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
              <filter id="softer" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="14" />
              </filter>

              {/**
               * The fold.
               *
               * Turbulence driving a displacement map — the only
               * way to bend what is already drawn rather than draw
               * something bent. Kept to the rift's own box so the
               * cost stays with the effect instead of the scene.
               */}
              <filter
                id="riftWarp"
                filterUnits="userSpaceOnUse"
                x="560"
                y="108"
                width="352"
                height="258"
              >
                <feTurbulence
                  type="turbulence"
                  baseFrequency="0.004 0.006"
                  numOctaves="1"
                  seed="11"
                  result="churn"
                />
                {/* Low and slow. Past about a dozen units the city
                    stops bending and starts shredding, and confetti
                    is not a paradox — you have to still recognise
                    what you are looking at for the wrongness of it
                    to land. */}
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="churn"
                  scale="11"
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="bent"
                />
                {/* The city inside the fold is the same city, so
                    inverting it alone just looks like more city.
                    Rotating the hue is what makes it read as
                    somewhere else: magenta out here, cold green in
                    there, the same buildings in both. */}
                <feColorMatrix in="bent" type="hueRotate" values="146" result="shifted" />
                <feComponentTransfer in="shifted">
                  <feFuncR type="linear" slope="1.35" intercept="0.02" />
                  <feFuncG type="linear" slope="1.35" intercept="0.03" />
                  <feFuncB type="linear" slope="1.35" intercept="0.04" />
                </feComponentTransfer>
              </filter>

              <radialGradient id="riftVoid" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#0b0320" />
                <stop offset="62%" stopColor="#1d0740" />
                <stop offset="100%" stopColor="#4a0f5e" />
              </radialGradient>

              <radialGradient id="riftHalo" cx="50%" cy="50%">
                <stop offset="52%" stopColor="var(--neon)" stopOpacity="0" />
                <stop offset="76%" stopColor="var(--neon)" stopOpacity="0.30" />
                <stop offset="100%" stopColor="var(--neon)" stopOpacity="0" />
              </radialGradient>

              <clipPath id="riftClip">
                <ellipse cx="736" cy="236" rx="152" ry="114" />
              </clipPath>

              {/* ── Craft ──────────────────────────────────────
                  Each one drawn nose-right from a rear origin, so
                  a scale(-1,1) is all it takes to turn one round. */}
              {/* A pure silhouette disappears against a night sky —
                  which is realistic and useless. Each hull gets a
                  lit upper surface catching the city below it, and
                  engines bright enough to find. */}
              <g id="ship-liner">
                <path d="M6,13 L120,5 L176,11 L120,21 L6,18 Z" fill="#241c44" />
                <path d="M6,13 L120,5 L176,11 L124,9 L8,15 Z" fill="#6f6aa8" />
                <path d="M54,6 L88,-11 L100,5 Z" fill="#2b2250" />
                <path d="M30,18 L86,19 L78,28 L38,27 Z" fill="#171238" />
                <g fill="#bfe8ff">
                  {Array.from({ length: 13 }, (_, i) => (
                    <rect key={i} x={34 + i * 9} y={10 + (i % 2) * 2} width="3.5" height="2.6" />
                  ))}
                </g>
                <circle className="nav-r" cx="172" cy="11" r="2.6" fill="#ff5e5e" />
                <circle className="nav-g" cx="90" cy="-11" r="2.4" fill="#6bffac" />
                <g>
                  <rect x="0" y="8" width="9" height="5" fill="#120d2c" />
                  <rect x="0" y="16" width="9" height="5" fill="#120d2c" />
                  <ellipse cx="-14" cy="10.5" rx="24" ry="4.4" fill="#8feaff" filter="url(#soft)" />
                  <ellipse cx="-14" cy="18.5" rx="24" ry="4.4" fill="#8feaff" filter="url(#soft)" />
                </g>
              </g>

              <g id="ship-darter">
                <path d="M4,6 L42,0 L58,6 L42,12 Z" fill="#2a2150" />
                <path d="M4,6 L42,0 L58,6 L44,4 Z" fill="#8a84c8" />
                <path d="M16,6 L2,-9 L28,1 Z" fill="#241c44" />
                <path d="M16,6 L2,21 L28,11 Z" fill="#171238" />
                <circle className="nav-r" cx="54" cy="6" r="1.9" fill="#ff6a6a" />
                <ellipse cx="-8" cy="6" rx="20" ry="3.6" fill="#a8f0ff" filter="url(#soft)" />
                <ellipse cx="-24" cy="6" rx="34" ry="1.7" fill="#a8f0ff" opacity="0.6" />
              </g>

              <g id="ship-hauler">
                <path d="M4,0 L104,0 L124,10 L104,22 L4,22 Z" fill="#282050" />
                <path d="M4,0 L104,0 L124,10 L106,4 L6,4 Z" fill="#7b74b4" />
                <rect x="78" y="-12" width="30" height="13" fill="#241c44" />
                <g fill="#ffd79a">
                  <rect x="84" y="-8" width="5" height="4" />
                  <rect x="93" y="-8" width="5" height="4" />
                </g>
                <g fill="#140e2c">
                  <rect x="18" y="22" width="26" height="15" />
                  <rect x="48" y="22" width="26" height="15" />
                  <rect x="78" y="22" width="20" height="15" />
                </g>
                <circle className="nav-g" cx="10" cy="-4" r="2.3" fill="#6bffac" />
                <ellipse cx="-10" cy="11" rx="26" ry="6" fill="#ffb060" filter="url(#soft)" />
              </g>
            </defs>

            {/* ══ Walls ════════════════════════════════════════ */}
            <rect x="0" y="0" width="1200" height="648" fill="url(#wallGrad)" />
            <polygon points="0,0 200,62 200,604 0,668" fill="var(--wall-2)" />
            <line x1="200" y1="62" x2="200" y2="604" stroke="#000" strokeOpacity="0.35" />

            {/* ══ Floor ════════════════════════════════════════ */}
            <polygon points="0,668 200,604 1200,648 1200,760 0,760" fill="url(#floorGrad)" />
            {/* Boards, so the floor has a direction. */}
            <g stroke="#000" strokeOpacity="0.16" strokeWidth="2">
              {Array.from({ length: 9 }, (_, i) => (
                <line
                  key={i}
                  x1={-40 + i * 170}
                  y1="760"
                  x2={360 + i * 92}
                  y2="620"
                />
              ))}
            </g>
            {/* Rug under the desk. */}
            <polygon
              points="236,744 322,648 1012,672 1070,760"
              fill="var(--rug)"
              opacity="0.72"
            />
            <polygon
              points="268,730 342,662 992,684 1038,748"
              fill="none"
              stroke="#000"
              strokeOpacity="0.22"
              strokeWidth="3"
            />

            {/* ══ Window ═══════════════════════════════════════ */}
            <g clipPath="url(#winClip)">
              <rect x="318" y="84" width="812" height="352" fill="url(#skyGrad)" />

              {/* Stars, faded by phase rather than switched off, so
                  dusk keeps a few and day keeps none. */}
              <g className="win-stars" style={{ opacity: "var(--stars)" }}>
                {STARS.map((s, i) => (
                  <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#e8eefb" opacity={s.o} />
                ))}
              </g>

              {/* Sun or moon. SVG geometry takes numbers, not calc,
                  so the height comes from the phase table in JS. */}
              <circle
                className="orb"
                cx="952"
                cy={orb.y}
                r={orb.r}
                fill="var(--sun)"
                opacity="0.95"
              />
              <circle
                className="orb"
                cx="952"
                cy={orb.y}
                r={orb.r * 2.6}
                fill="var(--sun)"
                opacity="0.14"
              />

              {/**
               * The city, as one group — because the rift needs a
               * second copy of it and a copy is the whole trick.
               * What hangs upside down inside the fold is not an
               * illustration of another city; it is this one.
               */}
              <g id="cityScene">
              {/* Far skyline — flat, hazy, no detail. */}
              <g fill="var(--city-far)">
                {Array.from({ length: 22 }, (_, i) => {
                  const w = 26 + rand(i, 21) * 42;
                  const h = 60 + rand(i, 22) * 130;
                  return (
                    <rect
                      key={i}
                      x={312 + i * 38}
                      y={436 - h}
                      width={w}
                      height={h}
                      opacity="0.8"
                    />
                  );
                })}
              </g>

              {/* Near skyline — taller, darker, the silhouette that
                  actually reads as a city. */}
              <g fill="var(--city-near)">
                {Array.from({ length: 13 }, (_, i) => {
                  const w = 52 + rand(i, 31) * 58;
                  const h = 120 + rand(i, 32) * 180;
                  return (
                    <rect
                      key={i}
                      x={304 + i * 66}
                      y={436 - h}
                      width={w}
                      height={h}
                    />
                  );
                })}
              </g>

              {/* Lit windows. The thing that makes it a city at
                  night rather than a row of blocks. */}
              <g className="city-lights" style={{ opacity: "var(--city-lit)" }}>
                {CITY_WINDOWS.map((c, i) => (
                  <rect
                    key={i}
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    fill="#ffd79a"
                    opacity={c.o}
                  />
                ))}
              </g>

              {/* Radio mast with the aircraft warning light. */}
              <g>
                <path d="M742 232 l10 0 l5 -92 l-20 0 z" fill="var(--city-near)" />
                <line x1="747" y1="140" x2="747" y2="104" stroke="var(--city-near)" strokeWidth="4" />
                <circle className="beacon" cx="747" cy="100" r="5" fill="#ff3b3b" />
              </g>

              {/* The park at the foot of the block. Treetops, not
                  a tree — this is a window several floors up, and
                  a single trunk at skyline height would read as a
                  mistake. It is also where the season shows
                  outside: the canopy takes the leaf colour. */}
              <g className="park">
                {Array.from({ length: 26 }, (_, i) => (
                  <circle
                    key={i}
                    cx={312 + i * 33 + rand(i, 51) * 14}
                    cy={424 + rand(i, 52) * 8}
                    r={11 + rand(i, 53) * 9}
                    fill={i % 3 === 0 ? "var(--leaf-2)" : i % 3 === 1 ? "var(--leaf)" : "var(--leaf-3)"}
                    opacity="0.85"
                  />
                ))}
              </g>
              <rect x="318" y="430" width="812" height="12" fill="var(--ground)" opacity="0.7" />
              </g>

              {/* ── Traffic ────────────────────────────────── */}
              <g className="ships">
                {SHIPS.map((s, i) => (
                  <g key={i} transform={`translate(${s.base} ${s.y})`}>
                    <g
                      className="ship"
                      style={{
                        animationDuration: `${s.dur}s`,
                        animationDelay: `${s.delay}s`,
                        animationDirection: s.back ? "reverse" : "normal",
                      }}
                    >
                      <g
                        transform={`scale(${s.back ? -s.scale : s.scale} ${s.scale})`}
                        opacity={s.dim ?? 1}
                      >
                        <use href={`#ship-${s.kind}`} />
                      </g>
                    </g>
                  </g>
                ))}
              </g>

              {/* ══ The fold ═══════════════════════════════════
                  A tear in the view where the city folds back
                  through itself. The giveaway is not that it
                  shimmers — it is that the skyline inside hangs
                  the wrong way up and its horizon does not meet
                  the one outside. */}
              <g className="rift">
                <ellipse cx="736" cy="236" rx="248" ry="196" fill="url(#riftHalo)" />

                <g clipPath="url(#riftClip)">
                  <ellipse cx="736" cy="236" rx="152" ry="114" fill="url(#riftVoid)" />

                  <g className="rift-churn" filter="url(#riftWarp)">
                    {/* The city, inverted. Same buildings, same
                        lit windows, hung from the wrong side. */}
                    <g transform="rotate(180 736 236) translate(0 -112) scale(1)" opacity="0.9">
                      <use href="#cityScene" />
                    </g>

                    {/* And again, smaller, further in — the fold
                        does not stop at one. */}
                    <g
                      transform="rotate(188 736 236) translate(272 48) scale(0.64)"
                      opacity="0.45"
                    >
                      <use href="#cityScene" />
                    </g>
                  </g>

                  {/* A horizon that refuses to line up with the
                      real one, which is the entire point. */}
                  <line
                    x1="560"
                    y1="214"
                    x2="912"
                    y2="268"
                    stroke="var(--neon)"
                    strokeOpacity="0.5"
                    strokeWidth="1.5"
                  />
                  <ellipse
                    cx="736"
                    cy="236"
                    rx="152"
                    ry="114"
                    fill="none"
                    stroke="#000"
                    strokeOpacity="0.55"
                    strokeWidth="26"
                  />
                </g>

                {/* Edge. Three strokes a hair apart do what one
                    stroke cannot: split the light at the rim. */}
                <g fill="none">
                  <ellipse cx="733" cy="234" rx="153" ry="115" stroke="#49e8ff" strokeOpacity="0.75" strokeWidth="2.2" />
                  <ellipse cx="739" cy="238" rx="153" ry="115" stroke="var(--neon)" strokeOpacity="0.75" strokeWidth="2.2" />
                  <ellipse
                    className="rift-rim"
                    cx="736"
                    cy="236"
                    rx="152"
                    ry="114"
                    stroke="#fff"
                    strokeOpacity="0.85"
                    strokeWidth="1.6"
                    strokeDasharray="7 19"
                  />
                  <ellipse
                    cx="736"
                    cy="236"
                    rx="152"
                    ry="114"
                    stroke="var(--neon)"
                    strokeOpacity="0.45"
                    strokeWidth="7"
                    filter="url(#softer)"
                  />
                </g>
              </g>

              {season === "winter" && !reduced ? (
                <g className="snow">
                  {Array.from({ length: 30 }, (_, i) => (
                    <circle
                      key={i}
                      className="flake"
                      cx={322 + rand(i, 41) * 800}
                      cy="80"
                      r={1 + rand(i, 42) * 1.8}
                      fill="#eef3fb"
                      style={{
                        animationDuration: `${7 + rand(i, 43) * 7}s`,
                        animationDelay: `${-rand(i, 44) * 10}s`,
                      }}
                    />
                  ))}
                </g>
              ) : null}

              {/* Blinds, half drawn. Horizontal slats are what stop
                  a big window reading as a hole in the wall. */}
              <g className="blinds">
                {Array.from({ length: 7 }, (_, i) => (
                  <rect
                    key={i}
                    x="318"
                    y={88 + i * 17}
                    width="812"
                    height="9"
                    fill="#0d0916"
                    opacity="0.5"
                  />
                ))}
              </g>
            </g>

            {/* Window frame over the view. */}
            <g fill="none" stroke="#0f0a18" strokeWidth="11">
              <rect x="318" y="84" width="812" height="352" rx="3" />
              <line x1="589" y1="84" x2="589" y2="436" />
              <line x1="860" y1="84" x2="860" y2="436" />
              <line x1="318" y1="262" x2="1130" y2="262" />
            </g>
            {/* Sill. */}
            <rect x="302" y="436" width="844" height="16" rx="3" fill="var(--desk-2)" />

            {/* Light spilling off the window into the room. */}
            <rect
              x="240"
              y="30"
              width="968"
              height="500"
              fill="url(#winGlow)"
              pointerEvents="none"
            />

            {/* Shafts across the floor. Two, not parallel, because
                the window has mullions in it. */}
            <g className="shafts" pointerEvents="none">
              <polygon points="330,452 580,452 500,760 150,760" fill="var(--shaft)" />
              <polygon points="610,452 850,452 880,760 560,760" fill="var(--shaft)" opacity="0.8" />
            </g>

            {/* ══ Left wall dressing ══════════════════════════ */}
            {/* Two framed prints, skewed onto the angled wall. */}
            <g transform="matrix(1,0.31,0,1,0,0)">
              <rect x="38" y="118" width="96" height="124" fill="#0e0a16" />
              <rect x="46" y="126" width="80" height="108" fill="var(--neon)" opacity="0.22" />
              <circle cx="86" cy="172" r="26" fill="var(--neon)" opacity="0.4" />
              <rect x="46" y="196" width="80" height="38" fill="#0e0a16" opacity="0.6" />

              <rect x="40" y="288" width="112" height="78" fill="#0e0a16" />
              <rect x="48" y="296" width="96" height="62" fill="var(--screen-tint)" opacity="0.18" />
            </g>

            {/* Neon sign, with its own bloom. Off in daylight. */}
            <g className="neon" opacity={dark ? 1 : 0.18}>
              <ellipse cx="248" cy="300" rx="150" ry="110" fill="url(#neonGrad)" />
              <g
                fill="none"
                stroke="var(--neon)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M212 268 l0 64" />
                <path d="M212 268 c30 0 30 64 0 64" />
                <path d="M258 332 l16 -64 l16 64" />
                <path d="M264 310 l20 0" />
              </g>
            </g>

            {/* Wall shelf: books, a record, a trailing pothos. */}
            <g>
              <rect x="208" y="330" width="156" height="9" fill="var(--desk-2)" />
              {/* Books */}
              <g>
                <rect x="216" y="292" width="13" height="38" fill="#7b3f58" />
                <rect x="231" y="286" width="11" height="44" fill="#3f5a7b" />
                <rect x="244" y="296" width="14" height="34" fill="#7b6a3f" />
                <rect x="260" y="290" width="10" height="40" fill="#4a3f7b" />
              </g>
              {/* Record, leaning */}
              <g transform="rotate(-8 318 304)">
                <rect x="292" y="278" width="52" height="52" fill="#15101f" />
                <circle cx="318" cy="304" r="19" fill="var(--neon)" opacity="0.55" />
                <circle cx="318" cy="304" r="4" fill="#15101f" />
              </g>
              {/* Pothos, trailing down the wall */}
              <g className="vine">
                <path
                  d="M224 330 C218 372 232 396 220 438 C212 468 224 486 216 512"
                  fill="none"
                  stroke="var(--leaf-3)"
                  strokeWidth="3"
                />
                {Array.from({ length: 9 }, (_, i) => (
                  <ellipse
                    key={i}
                    cx={218 + (i % 2 ? 11 : -10)}
                    cy={346 + i * 19}
                    rx="9"
                    ry="6.5"
                    fill={i % 2 ? "var(--leaf)" : "var(--leaf-2)"}
                    transform={`rotate(${i % 2 ? 24 : -24} ${218 + (i % 2 ? 11 : -10)} ${346 + i * 19})`}
                  />
                ))}
              </g>
            </g>

            {/* String lights along the top of the window. */}
            <g className="fairy">
              <path
                d="M300 92 Q 440 140 580 96 Q 720 142 860 98 Q 1000 142 1148 100"
                fill="none"
                stroke="#2a2038"
                strokeWidth="2.5"
              />
              {Array.from({ length: 18 }, (_, i) => {
                const t = i / 17;
                const x = 300 + t * 848;
                const seg = (x - 300) % 283;
                const y = 94 + Math.sin((seg / 283) * Math.PI) * 44;
                return (
                  <circle
                    key={i}
                    className="bulb"
                    cx={x}
                    cy={y}
                    r="4.5"
                    fill="#ffd79a"
                    style={{ animationDelay: `${(i % 6) * 0.45}s` }}
                  />
                );
              })}
            </g>

            {/* ══ Desk ════════════════════════════════════════ */}
            {/* Bias light behind the monitor, thrown on the wall. */}
            <ellipse
              className="bias"
              cx="595"
              cy="340"
              rx="300"
              ry="190"
              fill="url(#biasGrad)"
              opacity={awake ? 0.9 : 0.34}
              pointerEvents="none"
            />

            <polygon points="214,508 1046,536 1046,566 214,540" fill="url(#deskGrad)" />
            <polygon points="214,540 1046,566 1046,582 214,556" fill="#000" opacity="0.4" />
            {/* Legs and a drawer unit. */}
            <rect x="256" y="556" width="15" height="186" fill="var(--desk-2)" />
            <rect x="1008" y="578" width="15" height="166" fill="var(--desk-2)" />
            <g>
              <polygon points="836,566 1004,572 1004,718 836,712" fill="var(--desk-2)" />
              <line x1="848" y1="602" x2="992" y2="606" stroke="#000" strokeOpacity="0.4" strokeWidth="3" />
              <line x1="848" y1="652" x2="992" y2="656" stroke="#000" strokeOpacity="0.4" strokeWidth="3" />
            </g>
            {/* Cables, because every real desk has them. */}
            <g fill="none" stroke="#120d1c" strokeWidth="4" strokeLinecap="round">
              <path d="M700 540 C 706 600 672 630 684 700" />
              <path d="M742 544 C 756 598 730 626 740 694" opacity="0.7" />
            </g>

            {/* ══ iMac — the one thing you can click ══════════ */}
            <g
              className={`imac${awake ? " is-awake" : ""}`}
              ref={wakeRef}
              role="button"
              tabIndex={0}
              aria-pressed={awake}
              aria-label={awake ? "Put the machine to sleep" : "Wake the machine"}
              onClick={toggleWake}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleWake();
                }
              }}
            >
              <rect x="430" y="250" width="330" height="222" rx="9" fill="#17141f" />
              <rect
                className="imac-screen"
                x="442"
                y="262"
                width="306"
                height="182"
                rx="2"
                fill={awake ? "#0a0d14" : "url(#screenGrad)"}
                opacity={awake ? 1 : 0.5}
              />
              <rect x="430" y="444" width="330" height="26" rx="3" fill="#221e2c" />
              <polygon points="562,470 628,470 642,518 548,518" fill="#1d1927" />
              <ellipse cx="595" cy="522" rx="64" ry="9" fill="#17141f" />
              {!awake ? (
                <text className="imac-hint" x="595" y="358" textAnchor="middle">
                  CLICK TO WAKE
                </text>
              ) : null}
            </g>

            {/* Keyboard, mousepad, mouse. */}
            <polygon points="476,528 668,534 664,548 472,542" fill="#231f2e" />
            <polygon points="692,536 790,540 788,552 690,548" fill="#1b1826" opacity="0.8" />
            <ellipse cx="738" cy="544" rx="13" ry="8" fill="#2b2636" />

            {/* Mug, with steam when the room is cold or dark. */}
            <g>
              <path d="M352 500 l40 2 l-5 34 l-30 -1 z" fill="#b9607a" />
              <path
                d="M392 508 c12 0 12 16 0 16"
                fill="none"
                stroke="#b9607a"
                strokeWidth="4"
              />
              <g className="steam" opacity={dark || season === "winter" ? 0.75 : 0}>
                <path d="M364 496 c-6 -12 6 -18 0 -30" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M378 496 c6 -14 -6 -20 0 -32" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </g>

            {/* A small speaker and a stack of books on the desk. */}
            <g>
              <rect x="800" y="482" width="44" height="54" rx="4" fill="#211c2b" />
              <circle cx="822" cy="500" r="11" fill="#15121d" />
              <circle cx="822" cy="523" r="6" fill="#15121d" />
            </g>
            <g>
              <rect x="272" y="520" width="68" height="9" fill="#55406a" />
              <rect x="276" y="511" width="62" height="9" fill="#8a5b3c" />
              <rect x="280" y="502" width="56" height="9" fill="#3f5a7b" />
            </g>

            {/* ══ Desk lamp ═══════════════════════════════════ */}
            <g className="lamp">
              <ellipse cx="884" cy="534" rx="30" ry="7" fill="#201b2a" />
              <line x1="884" y1="532" x2="912" y2="438" stroke="#201b2a" strokeWidth="6" />
              <path d="M898 438 l40 0 l-12 30 l-34 0 z" fill="#2b2436" />
              <circle cx="916" cy="468" r="7" fill="#ffd9a0" />
              {/* The cone, and the pool it lands in. */}
              <polygon
                className="lamp-cone"
                points="898,468 936,468 1012,560 830,552"
                fill="url(#lampGrad)"
              />
              <ellipse className="lamp-pool" cx="918" cy="552" rx="118" ry="26" fill="#ffd9a0" />
            </g>

            {/* ══ Plants ══════════════════════════════════════ */}
            {/* Monstera, floor, right of the desk. */}
            <g className="plant">
              <path d="M1086 760 h110 l-16 -108 h-78 z" fill="#6b4230" />
              <rect x="1080" y="646" width="122" height="14" rx="3" fill="#7d4e38" />
              <g transform="translate(1141 648)">
                <use href="#monstera" transform="rotate(-26) scale(0.92)" fill="var(--leaf)" />
                <use href="#monstera" transform="rotate(8) scale(1.05)" fill="var(--leaf-2)" />
                <use href="#monstera" transform="rotate(34) scale(0.84)" fill="var(--leaf-3)" />
                <use href="#monstera" transform="translate(-14 6) rotate(-54) scale(0.7)" fill="var(--leaf-3)" />
              </g>
            </g>

            {/* Snake plant, floor, left of the desk. */}
            <g className="plant">
              <path d="M96 760 h96 l-12 -92 h-72 z" fill="#5d3b2c" />
              <rect x="90" y="660" width="108" height="12" rx="3" fill="#6f4835" />
              <g transform="translate(144 662)">
                <use href="#blade" transform="rotate(-20)" fill="var(--leaf-3)" />
                <use href="#blade" transform="rotate(-7) scale(1.1)" fill="var(--leaf)" />
                <use href="#blade" transform="rotate(9) scale(0.95)" fill="var(--leaf-2)" />
                <use href="#blade" transform="rotate(23) scale(0.82)" fill="var(--leaf-3)" />
              </g>
            </g>

            {/* Succulent on the desk. Small — at any size it
                competes with the monitor beside it. */}
            <g>
              <path d="M424 502 h28 l-4 -21 h-20 z" fill="#8a5b3c" />
              {Array.from({ length: 7 }, (_, i) => (
                <ellipse
                  key={i}
                  cx="438"
                  cy="472"
                  rx="4"
                  ry="10"
                  fill={i % 2 ? "var(--leaf)" : "var(--leaf-2)"}
                  transform={`rotate(${-54 + i * 18} 438 481)`}
                />
              ))}
            </g>

            {/* Sill plant, small, by the cat. */}
            <g>
              <rect x="1052" y="408" width="34" height="28" rx="3" fill="#8a5b3c" />
              <g transform="translate(1069 408)">
                <use href="#blade" transform="rotate(-14) scale(0.34)" fill="var(--leaf-2)" />
                <use href="#blade" transform="rotate(12) scale(0.28)" fill="var(--leaf)" />
              </g>
            </g>

            {/* ══ The cat on the sill ═════════════════════════
                Parked clear of the monitor, or she reads as a
                shape stuck to the screen rather than an animal
                sitting in a window. */}
            <g className="cat" transform="translate(492 0)">
              <path
                d="M388 436 c0 -30 18 -48 44 -48 c26 0 44 18 44 48 z"
                fill="#15101f"
              />
              <path d="M396 392 l-4 -20 l18 10 z" fill="#15101f" />
              <path d="M460 392 l16 -18 l2 20 z" fill="#15101f" />
              <circle cx="414" cy="404" r="2.6" fill="var(--sun)" opacity="0.85" />
              <circle cx="444" cy="404" r="2.6" fill="var(--sun)" opacity="0.85" />
              <path
                className="tail"
                d="M476 432 c26 4 34 -10 30 -26"
                fill="none"
                stroke="#15101f"
                strokeWidth="9"
                strokeLinecap="round"
              />
            </g>

            {/* ══ Chair, back to us ═══════════════════════════ */}
            {/* Low enough that it sits in front of the desk
                rather than on top of it. */}
            <g className="chair">
              <path
                d="M486 760 c-8 -74 -3 -126 5 -150 c33 -12 122 -12 156 0 c8 24 13 76 5 150 z"
                fill="#201a38"
              />
              <path
                d="M500 620 c30 -9 110 -9 139 0 l-5 19 c-41 -9 -88 -9 -129 0 z"
                fill="#2c2449"
              />
              <rect x="558" y="724" width="16" height="36" fill="#171230" />
            </g>

            {/* ══ Atmosphere ══════════════════════════════════ */}
            {!reduced ? (
              <g className="motes" pointerEvents="none">
                {MOTES.map((m, i) => (
                  <circle
                    key={i}
                    cx={m.x}
                    cy={m.y}
                    r={m.r}
                    fill="#fff"
                    opacity="0.3"
                    style={{ animationDuration: `${m.d}s`, animationDelay: `${-i * 0.9}s` }}
                  />
                ))}
              </g>
            ) : null}

            {/* Darkness, scaled by phase. */}
            <rect
              className="room-dim"
              x="0"
              y="0"
              width="1200"
              height="760"
              fill="#05040d"
              pointerEvents="none"
            />
            {/* Top and bottom falloff — the thing that makes it feel
                photographed rather than drawn. */}
            <rect
              x="0"
              y="0"
              width="1200"
              height="760"
              fill="url(#vignette)"
              pointerEvents="none"
            />
          </svg>

          {/* ══ The machine ═══════════════════════════════════ */}
          {awake ? (
            <div className="screen-ui">
              <AtelierOS
                phase={phase}
                season={season}
                clock={clock}
                reduced={reduced}
                onPhase={onPhase}
                onSeason={onSeason}
                onSleep={sleep}
              />
              <span className="screen-scan" aria-hidden="true" />
            </div>
          ) : null}
        </div>
      </div>

      {/* ══ Controls ════════════════════════════════════════ */}
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
