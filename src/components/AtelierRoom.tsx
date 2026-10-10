"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { projects } from "@/lib/projects";
import {
  moodNow,
  PHASE_ORDER,
  SEASON_ORDER,
  type Phase,
  type Season,
} from "@/lib/atelier-time";

/**
 * The Lab — a corner room you can look into.
 *
 * Drawn as vector rather than rendered in 3D, for two reasons that
 * both matter here. The homepage already owns a WebGL context for
 * the globe, and a second one is the kind of thing that turns a
 * mid-range phone into a space heater. And an illustrated room can
 * be lit by swapping a handful of CSS custom properties, which is
 * what makes four times of day and four seasons tractable at all —
 * sixteen states, one palette table.
 *
 * Everything in here is a token lookup. Nothing is hard-coded to a
 * particular hour.
 */

/* ── Palettes ──────────────────────────────────────────────────
   Each phase sets the light in the room: what comes through the
   window, what the walls do with it, and what the desk lamp has to
   compensate for. These are the only numbers that change. */
const PHASE_PALETTE: Record<Phase, Record<string, string>> = {
  dawn: {
    "--sky-top": "#1d2740",
    "--sky-bot": "#c98b62",
    "--sun": "#ffd9a8",
    "--wall": "#2a2622",
    "--wall-lit": "#3b332b",
    "--floor": "#241f1b",
    "--desk": "#3a2f25",
    "--glow": "rgba(255, 196, 140, 0.26)",
    "--screen": "#8fb7d6",
    "--lamp": "0.35",
    "--room-dim": "0.55",
  },
  day: {
    "--sky-top": "#6fa0cc",
    "--sky-bot": "#cfe2ef",
    "--sun": "#fffaf0",
    "--wall": "#45403a",
    "--wall-lit": "#5d564d",
    "--floor": "#372f28",
    "--desk": "#54432f",
    "--glow": "rgba(255, 248, 232, 0.3)",
    "--screen": "#a9cbe4",
    "--lamp": "0",
    "--room-dim": "0.12",
  },
  dusk: {
    "--sky-top": "#2b2340",
    "--sky-bot": "#d8743c",
    "--sun": "#ffb061",
    "--wall": "#2f2621",
    "--wall-lit": "#46362a",
    "--floor": "#271f1a",
    "--desk": "#43332444",
    "--glow": "rgba(255, 150, 72, 0.32)",
    "--screen": "#9ec2dd",
    "--lamp": "0.5",
    "--room-dim": "0.48",
  },
  night: {
    "--sky-top": "#05070f",
    "--sky-bot": "#0d1424",
    "--sun": "#dfe7f5",
    "--wall": "#16130f",
    "--wall-lit": "#211c16",
    "--floor": "#120f0c",
    "--desk": "#241c14",
    "--glow": "rgba(120, 150, 200, 0.14)",
    "--screen": "#bcd8ef",
    "--lamp": "1",
    "--room-dim": "0.8",
  },
};

/* Season only changes what is outside the window, plus the colour
   of the one tree in it. The room does not redecorate. */
const SEASON_PALETTE: Record<Season, Record<string, string>> = {
  spring: { "--leaf": "#7fa05a", "--leaf-2": "#9bb86f", "--ground": "#4a5538" },
  summer: { "--leaf": "#4e7a3f", "--leaf-2": "#6b9450", "--ground": "#3f4e30" },
  autumn: { "--leaf": "#b4702c", "--leaf-2": "#d39340", "--ground": "#4a3a26" },
  winter: { "--leaf": "#6d7784", "--leaf-2": "#8c96a2", "--ground": "#5b6168" },
};

/** Where the sun or moon sits in the window, per phase. */
const ORB_Y: Record<Phase, number> = {
  dawn: 372,
  day: 170,
  dusk: 384,
  night: 158,
};

const SEASON_NOTE: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

const PHASE_NOTE: Record<Phase, string> = {
  dawn: "First light",
  day: "Daylight",
  dusk: "Golden hour",
  night: "After hours",
};

export default function AtelierRoom() {
  // Rendered on the server too, so it must not read the clock until
  // after mount or the markup mismatches and React complains.
  const [phase, setPhase] = useState<Phase>("night");
  const [season, setSeason] = useState<Season>("autumn");
  const [clock, setClock] = useState("--:--");
  const [auto, setAuto] = useState(true);
  const [awake, setAwake] = useState(false);
  const [slide, setSlide] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  // Snow only falls in winter, and only at all if motion is allowed.
  const [snow, setSnow] = useState<Array<{ x: number; d: number; s: number }>>([]);
  useEffect(() => {
    if (season !== "winter") {
      setSnow([]);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setSnow(
      Array.from({ length: 26 }, (_, i) => ({
        x: (i * 37) % 100,
        d: 6 + ((i * 13) % 9),
        s: 1 + ((i * 7) % 3) * 0.4,
      })),
    );
  }, [season]);

  const vars = { ...PHASE_PALETTE[phase], ...SEASON_PALETTE[season] } as React.CSSProperties;

  const cycle = <T,>(list: T[], current: T): T =>
    list[(list.indexOf(current) + 1) % list.length];

  return (
    <div className="atelier" style={vars} ref={rootRef} data-phase={phase} data-season={season}>
      <div className="atelier-stage">
        <svg
          className="room"
          viewBox="0 0 1200 760"
          role="img"
          aria-label={`An illustrated corner studio at ${PHASE_NOTE[phase].toLowerCase()} in ${SEASON_NOTE[season].toLowerCase()}, with a desk, an iMac and plants by the window.`}
        >
          <defs>
            <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--sky-top)" />
              <stop offset="100%" stopColor="var(--sky-bot)" />
            </linearGradient>
            <linearGradient id="wallGrad" x1="0" y1="0" x2="1" y2="0.4">
              <stop offset="0%" stopColor="var(--wall-lit)" />
              <stop offset="100%" stopColor="var(--wall)" />
            </linearGradient>
            <radialGradient id="windowGlow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="var(--glow)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id="screenGrad" x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0%" stopColor="var(--screen)" />
              <stop offset="100%" stopColor="#4a6b85" />
            </linearGradient>
            <clipPath id="windowClip">
              <rect x="604" y="96" width="446" height="330" rx="4" />
            </clipPath>
          </defs>

          {/* ── Walls. Two planes meeting at a corner. ───────── */}
          <rect x="0" y="0" width="1200" height="640" fill="url(#wallGrad)" />
          <polygon points="0,0 236,74 236,600 0,660" fill="var(--wall)" opacity="0.72" />
          <line x1="236" y1="74" x2="236" y2="600" stroke="#000" strokeOpacity="0.3" />

          {/* ── Floor ───────────────────────────────────────── */}
          <polygon points="0,660 236,600 1200,640 1200,760 0,760" fill="var(--floor)" />
          <polygon
            points="604,600 1050,614 1120,760 520,760"
            fill="var(--glow)"
            opacity="0.5"
          />

          {/* ── Window ──────────────────────────────────────── */}
          <g clipPath="url(#windowClip)">
            <rect x="604" y="96" width="446" height="330" fill="url(#skyGrad)" />

            {/* Sun or moon. Height is set from the phase in JS —
                SVG geometry attributes take numbers, not calc(). */}
            <circle
              className="orb"
              cx="890"
              cy={ORB_Y[phase]}
              r={phase === "night" ? 22 : 30}
              fill="var(--sun)"
              opacity="0.92"
            />

            {/* Night sky gets stars; the others don't. */}
            {phase === "night" ? (
              <g className="win-stars">
                {Array.from({ length: 30 }, (_, i) => (
                  <circle
                    key={i}
                    cx={620 + ((i * 97) % 420)}
                    cy={108 + ((i * 53) % 190)}
                    r={0.8 + ((i * 11) % 3) * 0.35}
                    fill="#e8eefb"
                    opacity={0.3 + ((i * 17) % 7) / 12}
                  />
                ))}
              </g>
            ) : null}

            {/* Skyline, far then near, so there's depth outside. */}
            <g opacity="0.55">
              <rect x="604" y="300" width="70" height="130" fill="#000" opacity="0.35" />
              <rect x="684" y="268" width="52" height="162" fill="#000" opacity="0.42" />
              <rect x="748" y="316" width="84" height="114" fill="#000" opacity="0.3" />
              <rect x="846" y="286" width="60" height="144" fill="#000" opacity="0.4" />
              <rect x="918" y="330" width="74" height="100" fill="#000" opacity="0.32" />
              <rect x="1000" y="300" width="56" height="130" fill="#000" opacity="0.38" />
            </g>

            {/* Lit windows in the skyline, but only after dark. */}
            {phase === "night" || phase === "dusk" ? (
              <g className="city-lights">
                {Array.from({ length: 34 }, (_, i) => (
                  <rect
                    key={i}
                    x={612 + ((i * 71) % 430)}
                    y={310 + ((i * 29) % 100)}
                    width="5"
                    height="7"
                    fill="#ffd9a0"
                    opacity={0.25 + ((i * 13) % 6) / 9}
                  />
                ))}
              </g>
            ) : null}

            {/* The tree. The only thing that changes with season. */}
            <g>
              <rect x="648" y="368" width="12" height="62" fill="#2f2419" />
              <circle cx="654" cy="356" r="40" fill="var(--leaf)" opacity="0.92" />
              <circle cx="628" cy="372" r="26" fill="var(--leaf-2)" opacity="0.85" />
              <circle cx="680" cy="374" r="24" fill="var(--leaf-2)" opacity="0.8" />
            </g>
            <rect x="604" y="420" width="446" height="10" fill="var(--ground)" opacity="0.8" />

            {snow.map((f, i) => (
              <circle
                key={i}
                className="flake"
                cx={610 + (f.x / 100) * 430}
                cy="100"
                r={f.s}
                fill="#eef3fb"
                style={{ animationDuration: `${f.d}s`, animationDelay: `${-i * 0.4}s` }}
              />
            ))}
          </g>

          {/* Window frame over the view. */}
          <g fill="none" stroke="#17120d" strokeWidth="10">
            <rect x="604" y="96" width="446" height="330" rx="4" />
            <line x1="827" y1="96" x2="827" y2="426" />
            <line x1="604" y1="261" x2="1050" y2="261" />
          </g>
          <rect
            x="560"
            y="60"
            width="534"
            height="410"
            fill="url(#windowGlow)"
            opacity="0.9"
            pointerEvents="none"
          />

          {/* ── Desk ────────────────────────────────────────── */}
          <polygon points="250,520 1090,548 1090,578 250,552" fill="var(--desk)" />
          <polygon points="250,552 1090,578 1090,592 250,566" fill="#000" opacity="0.35" />
          <rect x="300" y="566" width="16" height="150" fill="var(--desk)" opacity="0.8" />
          <rect x="1020" y="580" width="16" height="150" fill="var(--desk)" opacity="0.8" />

          {/* ── iMac. The one thing you can click. ──────────── */}
          <g
            className={`imac${awake ? " is-awake" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={awake}
            aria-label={awake ? "Put the iMac to sleep" : "Wake the iMac and see the work"}
            onClick={() => setAwake((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setAwake((v) => !v);
              }
            }}
          >
            <rect x="430" y="250" width="330" height="222" rx="10" fill="#1b1b1e" />
            <rect
              className="imac-screen"
              x="442"
              y="262"
              width="306"
              height="182"
              rx="3"
              fill={awake ? "url(#screenGrad)" : "#0c1016"}
            />
            <rect x="430" y="444" width="330" height="28" rx="4" fill="#2a2a2e" />
            <polygon points="560,472 630,472 644,520 546,520" fill="#232327" />
            <ellipse cx="595" cy="524" rx="62" ry="8" fill="#1b1b1e" />
            {!awake ? (
              <text className="imac-hint" x="595" y="360" textAnchor="middle">
                CLICK TO WAKE
              </text>
            ) : null}
          </g>

          {/* Keyboard and mouse */}
          <rect x="500" y="536" width="150" height="12" rx="3" fill="#2c2c30" />
          <ellipse cx="700" cy="543" rx="14" ry="9" fill="#2c2c30" />

          {/* ── Plants ──────────────────────────────────────── */}
          {/* Desk plant */}
          <g>
            <path d="M850 532 h44 l-6 -34 h-32 z" fill="#8a5b3c" />
            <path d="M872 498 c-26 -6 -36 -28 -30 -48 c20 -2 34 14 30 48 z" fill="var(--leaf)" />
            <path d="M872 498 c26 -10 32 -34 24 -52 c-20 2 -30 20 -24 52 z" fill="var(--leaf-2)" />
            <path d="M872 498 c-4 -24 2 -44 2 -56 c8 14 10 38 -2 56 z" fill="var(--leaf)" />
          </g>
          {/* Tall floor plant in the corner */}
          <g>
            <path d="M1108 760 h86 l-12 -92 h-62 z" fill="#7a4f33" />
            <path d="M1150 668 c-40 -14 -52 -58 -42 -92 c32 2 52 38 42 92 z" fill="var(--leaf)" />
            <path d="M1150 668 c40 -18 48 -64 36 -96 c-32 6 -46 44 -36 96 z" fill="var(--leaf-2)" />
            <path d="M1150 668 c-6 -44 2 -80 2 -104 c14 26 16 68 -2 104 z" fill="var(--leaf)" />
          </g>
          {/* Small shelf plant */}
          <g>
            <rect x="250" y="300" width="130" height="10" fill="var(--desk)" />
            <path d="M292 300 h32 l-5 -24 h-22 z" fill="#8a5b3c" />
            <path d="M308 276 c-18 -4 -24 -20 -20 -34 c14 -2 24 10 20 34 z" fill="var(--leaf-2)" />
            <path d="M308 276 c18 -8 22 -24 16 -36 c-14 2 -20 14 -16 36 z" fill="var(--leaf)" />
          </g>

          {/* ── Desk lamp, on when the room is dark ─────────── */}
          <g className="lamp">
            <rect x="790" y="470" width="44" height="6" rx="3" fill="#2b2b2f" />
            <line x1="812" y1="470" x2="838" y2="396" stroke="#2b2b2f" strokeWidth="5" />
            <path d="M826 396 l34 0 l-10 26 l-30 0 z" fill="#32323a" />
            <ellipse className="lamp-pool" cx="820" cy="520" rx="130" ry="34" fill="#ffd9a0" />
          </g>

          {/* Warm cast over the whole room from the window. */}
          <rect
            x="0"
            y="0"
            width="1200"
            height="760"
            fill="var(--glow)"
            opacity="0.35"
            pointerEvents="none"
          />
          {/* Darkness, scaled by phase. */}
          <rect
            className="room-dim"
            x="0"
            y="0"
            width="1200"
            height="760"
            fill="#05060a"
            pointerEvents="none"
          />
        </svg>

        {/* ── What's on the screen once it's awake ──────────── */}
        {awake ? (
          <div className="screen-ui" role="region" aria-label="Work on the iMac">
            <div className="screen-bar">
              <span className="screen-dot" />
              <span className="screen-dot" />
              <span className="screen-dot" />
              <span className="screen-path">~/work/{projects[slide].slug}</span>
            </div>

            <div className="screen-body">
              <span className="screen-idx">
                {String(slide + 1).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}
              </span>
              <h3 className="screen-name">
                {projects[slide].name}
                {projects[slide].nameTail ? <b>{projects[slide].nameTail}</b> : null}
              </h3>
              <p className="screen-kind">{projects[slide].kind}</p>
              <p className="screen-sum">{projects[slide].summary}</p>

              <div className="screen-actions">
                <button
                  type="button"
                  onClick={() => setSlide((s) => (s - 1 + projects.length) % projects.length)}
                  aria-label="Previous project"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setSlide((s) => (s + 1) % projects.length)}
                  aria-label="Next project"
                >
                  →
                </button>
                <Link href={`/work/${projects[slide].slug}`}>Open</Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Controls ────────────────────────────────────────── */}
      <div className="atelier-bar">
        <p className="micro">
          {clock} — {PHASE_NOTE[phase]}, {SEASON_NOTE[season]}
          {auto ? " · live" : " · manual"}
        </p>

        <div className="atelier-ctl">
          <button
            type="button"
            onClick={() => {
              setAuto(false);
              setPhase((p) => cycle(PHASE_ORDER, p));
            }}
          >
            Time
          </button>
          <button
            type="button"
            onClick={() => {
              setAuto(false);
              setSeason((s) => cycle(SEASON_ORDER, s));
            }}
          >
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
