"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ability, type AbilityId } from "@/lib/nertia-race";
import { BOX_ROWS, POINTS, RACE_M, Race, SPEEDUP, TEAM_NAMES, clock, ordinal, type Runner, type Tone } from "./engine";
import RaceIcon, { ICON_PATHS } from "./RaceIcon";

type Phase = "intro" | "countdown" | "race" | "done";

const TEAM_COL = ["#5b9bff", "#ff7a2e"];

type Hud = {
  place: number;
  t: number;
  x: number;
  item: AbilityId | null;
  charges: number;
  stamina: number;
  nextBox: number | null;
  warn: { text: string; sub: string; urgent: boolean; p: number } | null;
  rows: { name: string; team: number; you: boolean; gap: string; armed: boolean; tags: string[] }[];
  pts: [number, number];
  feed: { text: string; tone: Tone; key: string }[];
};

const EMPTY: Hud = { place: 4, t: 0, x: 0, item: null, charges: 0, stamina: 1, nextBox: BOX_ROWS[0], warn: null, rows: [], pts: [0, 0], feed: [] };

/**
 * A playable club race: you and two teammates against three rivals over
 * a mile, sped up four times. Item boxes every 200 m, held items fire
 * with Space (or the button), and holding Shift surges at the cost of
 * stamina, which is also how Headwinds and Potholes are dodged.
 */
export default function NertiaRace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const raceRef = useRef<Race>(new Race());
  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState<Hud>(EMPTY);
  const phaseRef = useRef<Phase>("intro");
  const surgeKeys = useRef(new Set<string>());
  const surgeHold = useRef(false);
  const visible = useRef(true);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const start = useCallback(() => {
    raceRef.current = new Race();
    setHud(EMPTY);
    setPhase("countdown");
    setCount(3);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(id);
        setPhase("race");
      } else setCount(n);
    }, 700);
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  const fireItem = useCallback(() => {
    if (phaseRef.current !== "race") return;
    const r = raceRef.current;
    r.use(r.you);
  }, []);

  /* ───────────── input ───────────── */

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "e" || e.key === "E") {
        if (phaseRef.current === "race") {
          e.preventDefault();
          fireItem();
        }
      }
      if (["Shift", "ArrowUp", "ArrowRight", "w", "W"].includes(e.key)) {
        surgeKeys.current.add(e.key);
        if (phaseRef.current === "race") e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => surgeKeys.current.delete(e.key);
    const blur = () => surgeKeys.current.clear();
    el.addEventListener("keydown", down);
    el.addEventListener("keyup", up);
    el.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("keydown", down);
      el.removeEventListener("keyup", up);
      el.removeEventListener("blur", blur);
    };
  }, [fireItem]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ───────────── loop ───────────── */

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      const b = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(b.width * dpr));
      H = Math.max(1, Math.round(b.height * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const view = new View();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible.current) return;
      const race = raceRef.current;
      const ph = phaseRef.current;
      if (ph === "race") {
        race.you.surging = surgeKeys.current.size > 0 || surgeHold.current;
        const step = (dt * SPEEDUP) / 3;
        for (let k = 0; k < 3; k++) race.step(step);
        if (race.done) {
          setPhase("done");
          phaseRef.current = "done";
        }
      }
      view.draw(ctx, W, H, dpr, race, ph, now / 1000);
      if (now - hudAt > 90 || ph !== "race") {
        hudAt = now;
        setHud(snapshot(race));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const race = raceRef.current;
  const results = phase === "done" ? race.standings() : [];
  const pts = race.teamPoints();
  const you = race.you;

  return (
    <section className="rc" aria-label="NERTIA Race demo">
      <div
        className={`rc-stage is-${phase}`}
        ref={stageRef}
        tabIndex={0}
        aria-label="Race. Space uses your item, hold Shift to surge."
      >
        <canvas ref={canvasRef} className="rc-canvas" aria-hidden="true" />

        {phase === "race" || phase === "countdown" ? (
          <>
            <div className="rc-hud-tl">
              <p className="rc-place">
                {ordinal(hud.place)}
                <span>/ 6</span>
              </p>
              <p className="rc-clock">{clock(hud.t, true)}</p>
              <p className="rc-dist">
                {Math.min(RACE_M, Math.round(hud.x))} <span>/ {RACE_M} m</span>
              </p>
            </div>
            <div className={`rc-slot${hud.item ? " is-full" : ""}`}>
              {hud.item ? (
                <>
                  <RaceIcon id={hud.item} className="rc-slot-icon" />
                  <span className="rc-slot-name">
                    {ability(hud.item).name}
                    {hud.item === "gel-pack" ? ` ×${hud.charges}` : ""}
                  </span>
                  <span className="rc-slot-key">Space</span>
                </>
              ) : (
                <>
                  <span className="rc-slot-empty">?</span>
                  <span className="rc-slot-name">{hud.nextBox !== null ? `Box in ${hud.nextBox} m` : "No more boxes"}</span>
                </>
              )}
            </div>
            {hud.warn ? (
              <div className={`rc-warn${hud.warn.urgent ? " is-urgent" : ""}`} role="status">
                <b>{hud.warn.text}</b>
                <span>{hud.warn.sub}</span>
                <i style={{ transform: `scaleX(${hud.warn.p})` }} />
              </div>
            ) : null}
            <div className="rc-controls">
              <div className="rc-stamina" aria-label={`Stamina ${Math.round(hud.stamina * 100)}%`}>
                <span>Stamina</span>
                <i>
                  <b style={{ transform: `scaleX(${hud.stamina})` }} />
                </i>
              </div>
              <button
                type="button"
                className="rc-btn is-surge"
                onPointerDown={(e) => {
                  e.preventDefault();
                  surgeHold.current = true;
                }}
                onPointerUp={() => (surgeHold.current = false)}
                onPointerLeave={() => (surgeHold.current = false)}
                onPointerCancel={() => (surgeHold.current = false)}
                onContextMenu={(e) => e.preventDefault()}
              >
                Surge <kbd>Shift</kbd>
              </button>
              <button type="button" className="rc-btn is-use" onClick={fireItem} disabled={!hud.item}>
                Use <kbd>Space</kbd>
              </button>
            </div>
          </>
        ) : null}

        {phase === "countdown" ? <p className="rc-count">{count}</p> : null}

        {phase === "intro" ? (
          <div className="rc-intro">
            <p className="micro">Club race · 1 mile · Blue vs Orange</p>
            <h3>You, Maya and Sam against Dre, Kim and Luis.</h3>
            <ul>
              <li>
                <b>Boxes every 200 m.</b> Run through a row to pick up an ability.
              </li>
              <li>
                <b>Space</b> uses it. Hold <b>Shift</b> to surge. It costs stamina.
              </li>
              <li>
                <b>Surge to dodge.</b> When a Headwind warning hits, or a Pothole is ahead, surge and it misses.
              </li>
            </ul>
            <button type="button" className="nx-btn is-primary rc-go" onClick={start}>
              Start the race <span aria-hidden="true">&#8594;</span>
            </button>
            <p className="rc-note">Runs at 4x speed. In the real game this is your actual run, and items fire from your earbuds.</p>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="rc-results">
            <p className="micro">Final · 1 mile</p>
            <h3>
              {TEAM_NAMES[pts[0] > pts[1] ? 0 : 1]} wins, {Math.max(...pts)}–{Math.min(...pts)}
              {pts[0] > pts[1] ? <span> Your team took it.</span> : <span> Run it back.</span>}
            </h3>
            <table className="rc-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Runner</th>
                  <th scope="col">Game time</th>
                  <th scope="col">Items</th>
                  <th scope="col">Pts</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.i} className={r.you ? "is-you" : undefined}>
                    <td>{i + 1}</td>
                    <td>
                      <i style={{ background: TEAM_COL[r.team] }} aria-hidden="true" />
                      {r.name}
                    </td>
                    <td>{clock(r.finish ?? 0, true)}</td>
                    <td className={r.itemSec >= 0 ? "is-gain" : "is-loss"}>
                      {r.itemSec >= 0 ? "−" : "+"}
                      {Math.abs(r.itemSec).toFixed(1)}s
                    </td>
                    <td>{POINTS[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rc-note">
              Items column: what abilities were worth to each runner. Real times never change; you ran {clock((you.finish ?? 0) + you.itemSec, true)}.
            </p>
            <button type="button" className="nx-btn is-primary rc-go" onClick={start}>
              Race again <span aria-hidden="true">&#8594;</span>
            </button>
          </div>
        ) : null}
      </div>

      <aside className="rc-side" aria-label="Race standings">
        <div className="rc-score">
          <span style={{ color: TEAM_COL[0] }}>
            Blue <b>{phase === "intro" ? 0 : hud.pts[0]}</b>
          </span>
          <span className="micro">Club points</span>
          <span style={{ color: TEAM_COL[1] }}>
            <b>{phase === "intro" ? 0 : hud.pts[1]}</b> Orange
          </span>
        </div>
        <ol className="rc-rows">
          {(hud.rows.length ? hud.rows : race.standings().map((r) => row(r, race))).map((r, i) => (
            <li key={r.name} className={r.you ? "is-you" : undefined}>
              <span className="rc-pos">{i + 1}</span>
              <i style={{ background: TEAM_COL[r.team] }} aria-hidden="true" />
              <span className="rc-name">
                {r.name}
                {r.tags.length ? <em>{r.tags.join(" · ")}</em> : null}
              </span>
              {r.armed ? <span className="rc-armed" title="Holding an item">?</span> : null}
              <span className="rc-gap">{r.gap}</span>
            </li>
          ))}
        </ol>
        <div className="rc-feed" aria-live="polite">
          <p className="micro">Race feed</p>
          <ul>
            {hud.feed.length ? (
              hud.feed.map((f) => (
                <li key={f.key} className={`is-${f.tone}`}>
                  {f.text}
                </li>
              ))
            ) : (
              <li className="is-info">Calls come through your earbuds in the real thing.</li>
            )}
          </ul>
        </div>
      </aside>
    </section>
  );
}

/* ───────────── HUD snapshot ───────────── */

function row(r: Runner, race: Race) {
  const lead = race.standings()[0];
  const tags: string[] = [];
  if (race.has(r, "freeze")) tags.push("frozen");
  if (r.fx.some((f) => f.k === "speed" && f.mul < 1)) tags.push("slowed");
  if (r.fx.some((f) => f.k === "detour")) tags.push("detour");
  if (race.has(r, "shield")) tags.push("shield");
  if (race.has(r, "mirror")) tags.push("mirror");
  if (race.has(r, "fog")) tags.push("fog");
  if (race.has(r, "pacer")) tags.push("pacer");
  if (race.has(r, "high")) tags.push("runner's high");
  if (race.has(r, "kick")) tags.push("kick");
  if (r.fx.some((f) => f.k === "speed" && f.mul > 1)) tags.push("boost");
  const gap =
    r.finish !== null ? clock(r.finish, true) : r === lead ? "Lead" : `−${Math.max(0, lead.x - r.x).toFixed(0)} m`;
  return { name: r.name, team: r.team, you: r.you, gap: race.has(r, "fog") && !r.you ? "—" : gap, armed: !!r.item && !r.you, tags };
}

function snapshot(race: Race): Hud {
  const you = race.you;
  const incoming = race.hits.filter((h) => h.to === you.i).sort((a, b) => a.at - b.at)[0];
  const trap = race.traps.find((tr) => tr.team !== you.team && tr.x > you.x && tr.x - you.x < 14);
  let warn: Hud["warn"] = null;
  if (incoming) {
    const from = race.runners[incoming.from];
    const name = ability(incoming.kind).name;
    const p = Math.max(0, Math.min(1, (incoming.at - race.t) / Math.max(0.1, incoming.at - incoming.launched)));
    warn = incoming.dodge
      ? { text: `${name} from ${from.name}`, sub: "Surge now to dodge it", urgent: true, p }
      : { text: `${name} from ${from.name}`, sub: "Shield, Mirror, Fog or Air Horn stop it", urgent: false, p };
  } else if (trap) {
    warn = { text: "Pothole ahead", sub: "Surge as you cross it", urgent: true, p: (trap.x - you.x) / 14 };
  }
  return {
    place: race.placeOf(you),
    t: you.finish ?? race.t,
    x: you.x,
    item: you.item,
    charges: you.charges,
    stamina: you.stamina,
    nextBox: (() => {
      const n = BOX_ROWS.find((b) => b > you.x);
      return n === undefined ? null : Math.round(n - you.x);
    })(),
    warn,
    rows: race.standings().map((r) => row(r, race)),
    pts: race.teamPoints(),
    feed: race.feed.slice(0, 5).map((f, i) => ({ ...f, key: `${f.t.toFixed(3)}-${i}-${f.text}` })),
  };
}

/* ───────────── the picture ───────────── */

const ICONS: Partial<Record<string, Path2D>> = {};
function iconPath(id: AbilityId) {
  return (ICONS[id] ??= new Path2D(ICON_PATHS[id]));
}

/**
 * Side-on road, six lanes, camera on you. The world is drawn in metres
 * and scaled to the canvas, so it reads the same on a phone and a wide
 * screen. Everything that changes a runner shows on the runner.
 */
class View {
  private skyline: { x: number; w: number; h: number }[] = [];

  constructor() {
    let x = 0;
    while (x < 1200) {
      const w = 14 + Math.random() * 30;
      this.skyline.push({ x, w, h: 0.05 + Math.random() * 0.12 });
      x += w + 2 + Math.random() * 8;
    }
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, race: Race, phase: Phase, now: number) {
    const you = race.you;
    const viewM = W / dpr < 640 ? 34 : 56;
    const ppm = W / viewM;
    const cam = you.x - viewM * 0.36;
    const X = (m: number) => (m - cam) * ppm;
    const top = H * 0.4;
    const bot = H * 0.88;
    const Lh = (bot - top) / 6;
    const laneY = (l: number) => top + (l + 0.5) * Lh;
    const t = race.t;

    // sky and skyline
    const sky = ctx.createLinearGradient(0, 0, 0, top);
    sky.addColorStop(0, "#060609");
    sky.addColorStop(1, "#13121a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0c0c11";
    const par = cam * ppm * 0.08;
    for (const b of this.skyline) {
      const bx = ((b.x * dpr * 1.4 - par) % (1200 * dpr * 1.4) + 1200 * dpr * 1.4) % (1200 * dpr * 1.4) - 60 * dpr;
      if (bx > W) continue;
      ctx.fillRect(bx, top - b.h * H, b.w * dpr * 1.4, b.h * H);
    }

    // road
    const road = ctx.createLinearGradient(0, top, 0, bot);
    road.addColorStop(0, "#18171d");
    road.addColorStop(1, "#111015");
    ctx.fillStyle = road;
    ctx.fillRect(0, top, W, bot - top);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, top - 2 * dpr, W, 2 * dpr);
    ctx.fillRect(0, bot, W, 2 * dpr);
    // lane lines, dashed, moving with the road
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.setLineDash([2.2 * ppm, 2.2 * ppm]);
    ctx.lineDashOffset = (cam * ppm) % (4.4 * ppm);
    for (let l = 1; l < 6; l++) {
      ctx.beginPath();
      ctx.moveTo(0, top + l * Lh);
      ctx.lineTo(W, top + l * Lh);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // distance marks
    ctx.font = `600 ${11 * dpr}px ui-monospace, "SF Mono", Menlo, monospace`;
    for (let m = Math.floor(cam / 10) * 10; m < cam + viewM + 10; m += 10) {
      const x = X(m);
      ctx.fillStyle = m % 50 === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(x, bot + 3 * dpr, Math.max(1, dpr), (m % 50 === 0 ? 8 : 4) * dpr);
      if (m % 100 === 0 && m > 0 && m < RACE_M) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText(`${m} m`, x + 4 * dpr, bot + 14 * dpr);
      }
    }
    // start and finish
    for (const [m, label] of [
      [0, "START"],
      [RACE_M, "FINISH"],
    ] as [number, string][]) {
      const x = X(m);
      if (x < -40 * dpr || x > W + 40 * dpr) continue;
      const sq = Lh / 4;
      for (let r = 0; r < 24; r++) {
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = (r + c) % 2 ? "rgba(255,255,255,0.75)" : "rgba(20,20,24,0.9)";
          ctx.fillRect(x + c * sq * 0.6, top + r * sq, sq * 0.6, sq);
        }
      }
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(label, x + 2 * dpr, top - 8 * dpr);
    }

    // item box rows
    for (const row of BOX_ROWS) {
      const x = X(row);
      if (x < -Lh || x > W + Lh) continue;
      for (let l = 0; l < 6; l++) {
        const y = laneY(l) + Math.sin(now * 3 + l) * Lh * 0.06;
        const s = Lh * 0.46;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(now * 1.6 + l * 0.7) * 0.25);
        const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
        g.addColorStop(0, "rgba(255,92,26,0.9)");
        g.addColorStop(0.5, "rgba(224,33,138,0.85)");
        g.addColorStop(1, "rgba(138,124,255,0.9)");
        ctx.shadowColor = "rgba(255,92,26,0.6)";
        ctx.shadowBlur = 14 * dpr;
        ctx.fillStyle = g;
        roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.18);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        ctx.font = `700 ${s * 0.7}px "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", 0, s * 0.04);
        ctx.restore();
      }
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // potholes: a hazard across the road
    for (const tr of race.traps) {
      const x = X(tr.x);
      if (x < -60 || x > W + 60) continue;
      ctx.fillStyle = "rgba(4,4,6,0.85)";
      for (let l = 0; l < 6; l++) {
        ctx.beginPath();
        ctx.ellipse(x, laneY(l) + Lh * 0.25, Lh * 0.42, Lh * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = TEAM_COL[tr.team];
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 8);
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // hits in flight
    for (const h of race.hits) {
      const a = race.runners[h.from];
      const b = race.runners[h.to];
      const p = Math.max(0, Math.min(1, (t - h.launched) / Math.max(0.1, h.at - h.launched)));
      const x = X(a.x + (b.x - a.x) * p);
      const y = laneY(a.lane) + (laneY(b.lane) - laneY(a.lane)) * p - Lh * 0.5;
      if (x < -50 || x > W + 50) continue;
      const col =
        h.kind === "cramp"
          ? "176,102,255"
          : h.kind === "headwind" || h.kind === "hill"
            ? "150,210,255"
            : h.kind === "bonk" || h.kind === "crowd"
              ? "255,90,90"
              : h.kind === "pickpocket"
                ? "120,255,180"
                : "255,200,90";
      const glow = ctx.createRadialGradient(x, y, 0, x, y, Lh * 0.7);
      glow.addColorStop(0, `rgba(${col},0.95)`);
      glow.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, Lh * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(x - Lh * 0.22, y - Lh * 0.22);
      ctx.scale((Lh * 0.44) / 24, (Lh * 0.44) / 24);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(iconPath(h.kind));
      ctx.restore();
    }

    // runners, back lanes first
    const order = [...race.runners].sort((a, b) => a.lane - b.lane);
    for (const r of order) {
      const x = X(r.x);
      const y = laneY(r.lane) + Lh * 0.38;
      if (x < -Lh * 2) {
        this.edge(ctx, 0, laneY(r.lane), r, you, dpr, -1);
        continue;
      }
      if (x > W + Lh * 2) {
        this.edge(ctx, W, laneY(r.lane), r, you, dpr, 1);
        continue;
      }
      this.runner(ctx, x, y, Lh * 0.92, r, race, now, dpr);
    }

    // a ring at each moment that just happened
    for (const p of race.pops) {
      const age = t - p.t;
      if (age > 2.4 || age < 0) continue;
      const r = race.runners[p.runner];
      const x = X(r.x);
      const y = laneY(r.lane);
      const f = age / 2.4;
      ctx.strokeStyle =
        p.kind === "hit" || p.kind === "lost"
          ? "rgba(255,90,90,1)"
          : p.kind === "dodge" || p.kind === "regroup"
            ? "rgba(140,255,190,1)"
            : p.kind === "block"
              ? "rgba(180,230,255,1)"
              : "rgba(255,190,90,1)";
      ctx.globalAlpha = 1 - f;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(x, y - Lh * 0.1, Lh * (0.4 + f * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // the whole race on one line
    const mx0 = W * 0.3;
    const mx1 = W * 0.7;
    const my = 22 * dpr;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(mx0, my - 1 * dpr, mx1 - mx0, 2 * dpr);
    for (const row of BOX_ROWS) {
      ctx.fillStyle = "rgba(255,92,26,0.6)";
      ctx.fillRect(mx0 + (row / RACE_M) * (mx1 - mx0) - dpr, my - 4 * dpr, 2 * dpr, 8 * dpr);
    }
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(mx1, my - 6 * dpr, 2 * dpr, 12 * dpr);
    for (const r of race.runners) {
      const px = mx0 + Math.min(1, r.x / RACE_M) * (mx1 - mx0);
      ctx.fillStyle = TEAM_COL[r.team];
      ctx.beginPath();
      ctx.arc(px, my, (r.you ? 5 : 3.5) * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (r.you) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }
    }

    if (phase === "intro") {
      ctx.fillStyle = "rgba(6,6,9,0.55)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** an arrow at the screen edge for runners out of view */
  private edge(ctx: CanvasRenderingContext2D, x: number, y: number, r: Runner, you: Runner, dpr: number, dir: number) {
    const gap = Math.round(Math.abs(r.x - you.x));
    const label = `${r.name} ${dir > 0 ? "+" : "−"}${gap} m`;
    ctx.font = `600 ${10 * dpr}px ui-monospace, "SF Mono", Menlo, monospace`;
    const w = ctx.measureText(label).width + 22 * dpr;
    const bx = dir > 0 ? x - w - 6 * dpr : x + 6 * dpr;
    ctx.fillStyle = "rgba(8,8,12,0.8)";
    roundRect(ctx, bx, y - 10 * dpr, w, 20 * dpr, 10 * dpr);
    ctx.fill();
    ctx.fillStyle = TEAM_COL[r.team];
    ctx.beginPath();
    const ax = dir > 0 ? bx + w - 9 * dpr : bx + 9 * dpr;
    ctx.moveTo(ax + dir * 4 * dpr, y);
    ctx.lineTo(ax - dir * 3 * dpr, y - 5 * dpr);
    ctx.lineTo(ax - dir * 3 * dpr, y + 5 * dpr);
    ctx.fill();
    ctx.fillStyle = "rgba(239,234,225,0.9)";
    ctx.fillText(label, bx + (dir > 0 ? 8 : 16) * dpr, y + 3.5 * dpr);
  }

  /** a side-on runner, legs cycling with distance covered */
  private runner(ctx: CanvasRenderingContext2D, x: number, footY: number, h: number, r: Runner, race: Race, now: number, dpr: number) {
    const frozen = race.has(r, "freeze");
    const fog = race.has(r, "fog");
    const slowed = r.fx.some((f) => f.k === "speed" && f.mul < 1) || r.fx.some((f) => f.k === "detour");
    const high = race.has(r, "high");
    const boosted = r.fx.some((f) => f.k === "speed" && f.mul > 1) || race.has(r, "pacer") || high;
    const surging = ((r.surging && r.stamina > 0.02) || race.has(r, "kick")) && r.finish === null;

    // Runner's High: a gold glow nothing gets through
    if (high) {
      const g = ctx.createRadialGradient(x, footY - h * 0.5, 0, x, footY - h * 0.5, h * 0.9);
      g.addColorStop(0, `rgba(255,214,90,${0.35 + 0.15 * Math.sin(now * 12)})`);
      g.addColorStop(1, "rgba(255,214,90,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, footY - h * 0.5, h * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    const col = TEAM_COL[r.team];
    const ph = (r.x / 1.7) * Math.PI;
    const hip = { x, y: footY - h * 0.5 };
    const sh = { x: x + h * 0.06, y: footY - h * 0.82 };
    const head = { x: x + h * 0.1, y: footY - h * 0.95 };

    // speed lines behind: surge in orange, boosts in teal
    if ((surging || boosted) && !frozen) {
      ctx.strokeStyle = boosted ? "rgba(90,240,220,0.7)" : "rgba(255,140,60,0.7)";
      ctx.lineWidth = Math.max(1, h * 0.03);
      for (let k = 0; k < 4; k++) {
        const yy = footY - h * (0.3 + k * 0.17);
        const len = h * (0.5 + 0.3 * Math.sin(now * 20 + k * 2));
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now * 14 + k);
        ctx.beginPath();
        ctx.moveTo(x - h * 0.35, yy);
        ctx.lineTo(x - h * 0.35 - len, yy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // headwind: gusts blowing into the runner
    if (slowed && !frozen) {
      ctx.strokeStyle = "rgba(160,200,255,0.65)";
      ctx.lineWidth = Math.max(1, h * 0.025);
      for (let k = 0; k < 3; k++) {
        const off = ((now * 3 + k * 0.33) % 1) * h * 0.9;
        const yy = footY - h * (0.45 + k * 0.18);
        ctx.beginPath();
        ctx.moveTo(x + h * 1.1 - off, yy);
        ctx.quadraticCurveTo(x + h * 0.8 - off, yy - h * 0.08, x + h * 0.55 - off, yy);
        ctx.stroke();
      }
    }

    ctx.save();
    if (fog) ctx.globalAlpha = 0.3;
    const lw = Math.max(1.5, h * 0.09);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const limb = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    };
    const leg = (p: number, color: string) => {
      const sw = Math.sin(p);
      const knee = { x: hip.x + sw * h * 0.18, y: hip.y + h * 0.22 };
      const lift = Math.max(0, Math.cos(p)) * h * 0.12;
      const foot = { x: knee.x + sw * h * 0.1 - h * 0.06, y: footY - lift };
      limb(hip, knee, foot, color);
    };
    const arm = (p: number, color: string) => {
      const sw = Math.sin(p);
      const el = { x: sh.x - sw * h * 0.14, y: sh.y + h * 0.16 };
      const hand = { x: el.x + h * 0.12, y: el.y - h * 0.04 - sw * h * 0.05 };
      limb(sh, el, hand, color);
    };
    const run = frozen ? 0 : ph;
    leg(run + Math.PI, "#26252d");
    arm(run, "#26252d");
    // torso in the team colour
    ctx.strokeStyle = col;
    ctx.lineWidth = lw * 1.6;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(sh.x, sh.y);
    ctx.stroke();
    leg(run, "#3a3944");
    arm(run + Math.PI, "#3a3944");
    ctx.fillStyle = "#3a3944";
    ctx.beginPath();
    ctx.arc(head.x, head.y, h * 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // frozen in place
    if (frozen) {
      ctx.fillStyle = "rgba(150,220,255,0.18)";
      ctx.strokeStyle = "rgba(190,240,255,0.85)";
      ctx.lineWidth = Math.max(1, dpr * 1.2);
      roundRect(ctx, x - h * 0.32, footY - h * 1.08, h * 0.7, h * 1.1, h * 0.06);
      ctx.fill();
      ctx.stroke();
    }
    if (race.has(r, "shield")) {
      ctx.strokeStyle = "rgba(170,230,255,0.85)";
      ctx.fillStyle = "rgba(170,230,255,0.08)";
      ctx.lineWidth = Math.max(1, dpr * 1.5);
      ctx.beginPath();
      ctx.arc(x + h * 0.05, footY - h * 0.52, h * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (race.has(r, "mirror")) {
      ctx.save();
      ctx.translate(x + h * 0.05, footY - h * 0.52);
      ctx.rotate(now * 1.5);
      ctx.strokeStyle = "rgba(230,230,240,0.85)";
      ctx.lineWidth = Math.max(1, dpr * 1.5);
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const px = Math.cos(a) * h * 0.66;
        const py = Math.sin(a) * h * 0.66;
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
    // rally and pace line: a team-coloured pulse at the feet
    const lined = r.fx.some((f) => f.k === "line");
    if (r.fx.some((f) => f.k === "speed" && f.tag === "rally") || lined) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now * 6);
      ctx.lineWidth = Math.max(1, dpr * 2);
      ctx.beginPath();
      ctx.ellipse(x, footY, h * 0.45, h * 0.1, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // label: name, and a ? for anyone holding an item
    ctx.font = `600 ${Math.max(9, 10.5 * dpr)}px ui-monospace, "SF Mono", Menlo, monospace`;
    const label = r.you ? "YOU" : r.name.toUpperCase();
    const lwid = ctx.measureText(label).width;
    const ly = footY - h * 1.18;
    ctx.fillStyle = r.you ? "#fff" : "rgba(239,234,225,0.75)";
    ctx.fillText(label, x - lwid / 2 + h * 0.05, ly);
    if (r.you) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x + h * 0.05 - 5 * dpr, ly + 4 * dpr);
      ctx.lineTo(x + h * 0.05 + 5 * dpr, ly + 4 * dpr);
      ctx.lineTo(x + h * 0.05, ly + 9 * dpr);
      ctx.fill();
    } else if (r.item && !fog) {
      const s = 12 * dpr;
      ctx.fillStyle = "rgba(255,92,26,0.9)";
      roundRect(ctx, x + lwid / 2 + h * 0.05 + 4 * dpr, ly - s + 2 * dpr, s, s, 3 * dpr);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${9 * dpr}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText("?", x + lwid / 2 + h * 0.05 + 7.5 * dpr, ly);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
