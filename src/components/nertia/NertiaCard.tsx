"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { finishes, type EffectId, type Unit } from "@/lib/nertia";
import { ELEMENTS, HOME_LABEL, cardById, rarity, setNumber, type Card } from "@/lib/nertia-cards";

/* ───────────────────── icons ───────────────────── */

/** one line icon per engine, for the card art and the set grid */
const ICONS: Record<EffectId, string> = {
  flames: "M12 3c1 3 4 4.6 4 8.6a4 4 0 0 1-8 0c0-2 1-3.2 2-4.2 0 2 .8 3 2 3.2 0-3-1.2-5 0-7.6zM12 20.6a2 2 0 0 1-2-2c0-1.2 1-1.8 2-3 1 1.2 2 1.8 2 3a2 2 0 0 1-2 2z",
  stars: "M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8zM19 3.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z",
  lightning: "M13 2L5 13h6l-1 9 8-11h-6z",
  thunder: "M13 2L7 11h5l-1.4 6 5.4-8h-5zM3 20h18M6 17.5l-2 2.5M18 17.5l2 2.5",
  mist: "M3 15c3-2 6 2 9 0s6-2 9 0M4 19c2.6-1.6 5.4 1.6 8 0s5.4-1.6 8 0M8 11c1.4-1 2.8 1 4.2 0",
  bubbles: "M9 14a4 4 0 1 0 0 .01zM16.5 8a3 3 0 1 0 0 .01zM17.5 17a2 2 0 1 0 0 .01zM7.6 12.6a1.6 1.6 0 0 1 1.6-1.4",
  streaks: "M3 8h14M6 12h15M3 16h12M18 8h3M17 16h2",
  strike: "M3 19h18M6.5 19a5.5 2.2 0 0 1 11 0M12 4v6M7.5 6.5l2.2 3M16.5 6.5l-2.2 3",
  frost: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M12 6l-2-2M12 6l2-2M12 18l-2 2M12 18l2 2",
  snow: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 4.5l3 1.8 3-1.8M9 19.5l3-1.8 3 1.8",
  laurel: "M8 21c-4.5-4-5-11-.5-16M16 21c4.5-4 5-11 .5-16M6 9l-2.5-.8M5.2 13l-2.6.4M6.4 17l-2.2 1.2M18 9l2.5-.8M18.8 13l2.6.4M17.6 17l2.2 1.2",
  steam: "M8 20c-2-3 2-5 0-8s2-5 0-8M12.5 20c-2-3 2-5 0-8s2-5 0-8M17 20c-2-3 2-5 0-8",
  embers: "M7 19h4M14 19h4M12 4c.8 2.2 3 3.4 3 6.2a3 3 0 0 1-6 0c0-1.4.7-2.3 1.4-3 0 1.4.6 2.2 1.6 2.4 0-2.2-.8-3.6 0-5.6z",
  hud: "M3 6h18v12H3zM6 10h6M6 13.5h9M15 9.5h3",
  ghost: "M6 20v-6a3 3 0 0 1 6 0v6M9 8.5a1.8 1.8 0 1 0 0 .01M12 20v-6a3 3 0 0 1 6 0v6M15 8.5a1.8 1.8 0 1 0 0 .01",
  wings: "M12 12C9 6 5 4 2 5c1 4 4 7 10 7zM12 12c3-6 7-8 10-7-1 4-4 7-10 7zM7 9l5 3M17 9l-5 3",
  corona: "M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  leaves: "M5 19C5 10 11 5 19 5c0 8-5 14-14 14zM5 19l9-9",
  aura: "M12 6.5a2 2 0 1 0 0 .01M9 21v-7l-1.5-4h9L15 14v7M4.5 20C3 12 6 5 12 3c6 2 9 9 7.5 17",
  ribbons: "M3 8c4-4 6 4 10 0s6-4 8 0M3 14c4-4 6 4 10 0s6-4 8 0M3 20c4-4 6 4 10 0",
  comet: "M16 5a3 3 0 1 0 0 6 3 3 0 1 0 0-6M13.6 10.4L4 20M14.8 12l-5.6 5.6M12 9.2L6.4 14.8",
  aurora: "M5 20V10c0-2 2-3 2-5M10 20V8c0-2 2-3 2-4.5M15 20v-9c0-2 2-3 2-5M20 20v-6",
  sparkle: "M10 3l1.6 5.4L17 10l-5.4 1.6L10 17l-1.6-5.4L3 10l5.4-1.6zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z",
  confetti: "M4 5l2.5 1.5L5 9zM11 3h3v2h-3zM18 6l2 2-2 1zM6 14l3-1 .5 2.5zM14 11l2.5.5-.5 2.5zM10 19l2-2 1 2.5zM18 16l3 1-1.5 2.5z",
  butterflies: "M12 8v10M12 10.5C9.5 4.5 4.2 5 5 9s4.4 3.8 7 3M12 10.5c2.5-6 7.8-5.5 7-1.5s-4.4 3.8-7 3M12 13c-3 0-6 2-5 4s4 1 5-2M12 13c3 0 6 2 5 4s-4 1-5-2",
  slipstream: "M3 8c6 0 9-3 18-3M3 12h18M3 16c6 0 9 3 18 3M14 12h4",
  glitch: "M4 5h9v3H4zM9 10.5h11v3H9zM6 16h7v3H6zM16 16h3v3h-3z",
  ripple: "M12 3c2 3 3 4.6 3 6a3 3 0 0 1-6 0c0-1.4 1-3 3-6zM4 17.5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5-3.6-2.5-8-2.5-8 1.1-8 2.5M8 17.5c0 .7 1.8 1.2 4 1.2s4-.5 4-1.2",
  bloom: "M12 9.5a1.8 1.8 0 1 0 0 .01M12 6a2.2 2.2 0 1 1 0-.01M15.4 8.6a2.2 2.2 0 1 1 0-.01M14 12.6a2.2 2.2 0 1 1 0-.01M10 12.6a2.2 2.2 0 1 1 0-.01M8.6 8.6a2.2 2.2 0 1 1 0-.01M12 14v7M12 18c-2-2-4-1.5-5 0M12 17c1.5-1.5 3.5-1.2 4.5 0",
  grid: "M3 20l3-8h12l3 8zM9.6 12l-1.2 8M14.4 12l1.2 8M4.4 16h15.2",
  cloud: "M7 14a4 4 0 0 1 .6-8 5 5 0 0 1 9.4 1.6A3.3 3.3 0 0 1 17 14zM9 17l-1 3M13 17l-1 3M17 17l-1 3",
  orbit: "M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6M2.5 15.5c1.5 2.8 9 1.5 14.2-2.4S23 5.3 21.5 2.5M20 4a1.5 1.5 0 1 0 0 .01",
  halo: "M12 14a4.5 4.5 0 1 0 0 .01M5 6c0 1.4 3.1 2.5 7 2.5S19 7.4 19 6s-3.1-2.5-7-2.5S5 4.6 5 6",
  crown: "M4 18h16M4 18L3 8l5 4 4-7 4 7 5-4-1 10M12 14.5a1 1 0 1 0 0 .01",
};

export function EffectIcon({ engine, className }: { engine: EffectId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={ICONS[engine] ?? ICONS.sparkle} />
    </svg>
  );
}

/* ───────────────────── the card ───────────────────── */

const stars = (n: number) => "★".repeat(n);

/**
 * A Drop 001 effect card: the effect's art over the finish, its type,
 * rarity and set number. Holo and up carry a foil layer that follows
 * the pointer.
 */
export function TradingCard({ card, unit, size = "lg" }: { card: Card; unit?: Unit; size?: "lg" | "sm" }) {
  const r = rarity(card.rarity);
  const el = ELEMENTS[card.element];
  const fin = unit ? finishes[unit.finish] : null;
  const bonus = card.bonus ? cardById(card.bonus) : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const style = {
    "--rc": r.color,
    "--ec": el.color,
    "--sw": fin ? `linear-gradient(135deg, ${fin.ramp.join(", ")})` : `linear-gradient(135deg, #1b1a22, ${el.color}55, #0d0c11)`,
  } as CSSProperties;

  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    const el2 = ref.current;
    if (!el2 || size !== "lg") return;
    const b = el2.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width;
    const y = (e.clientY - b.top) / b.height;
    el2.style.setProperty("--mx", String(x));
    el2.style.setProperty("--my", String(y));
    el2.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    el2.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
  };
  const reset = () => {
    const el2 = ref.current;
    if (!el2) return;
    el2.style.removeProperty("--rx");
    el2.style.removeProperty("--ry");
  };

  return (
    <div ref={ref} className={`nx-tcg is-${card.rarity} is-${size}`} style={style} onPointerMove={tilt} onPointerLeave={reset}>
      <div className="nx-tcg-top">
        <span className="nx-tcg-name">{card.name}</span>
        <span className="nx-tcg-type">
          <i aria-hidden="true" />
          {el.label}
        </span>
      </div>
      <div className="nx-tcg-art">
        <EffectIcon engine={card.engine} className="nx-tcg-icon" />
        <span className="nx-tcg-foil" aria-hidden="true" />
      </div>
      {size === "lg" ? (
        <>
          <p className="nx-tcg-meta">
            {card.fixed ? "Standard on every headband" : HOME_LABEL[card.home]}
            {unit ? ` · ${unit.product}${fin ? ` · ${fin.name}` : ""}` : ""}
          </p>
          <p className="nx-tcg-line">{card.line}</p>
          {bonus ? (
            <p className="nx-tcg-bonus">
              <b>+ {bonus.name}</b> comes with it
            </p>
          ) : null}
        </>
      ) : null}
      <div className="nx-tcg-foot">
        <span>{size === "lg" ? "NERTIA · Drop 001" : "D001"}</span>
        <span className="nx-tcg-rar">
          {stars(r.stars)} {size === "lg" ? r.label : ""}
        </span>
        <span>{card.fixed ? "—" : setNumber(card)}</span>
      </div>
    </div>
  );
}

/* ───────────────────── opening a pack ───────────────────── */

type Phase = "pack" | "tear" | "flip" | "card";

/**
 * The reveal: the sealed pouch shakes, tears open, and the card inside
 * rises and flips, with a burst in its rarity color behind it. Tap to
 * skip ahead. Reduced motion goes straight to the card.
 */
export function PackReveal({ unit, card, onDone }: { unit: Unit; card: Card; onDone: () => void }) {
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [phase, setPhase] = useState<Phase>(reduce ? "card" : "pack");
  const fin = finishes[unit.finish];
  const r = rarity(card.rarity);
  const timers = useRef<number[]>([]);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reduce) return;
    const at = (ms: number, p: Phase) => timers.current.push(window.setTimeout(() => setPhase(p), ms));
    at(900, "tear");
    at(1400, "flip");
    at(2300, "card");
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, [reduce]);

  useEffect(() => {
    if (phase === "card") btn.current?.focus({ preventScroll: true });
  }, [phase]);

  const skip = () => {
    if (phase === "card") return;
    timers.current.forEach((t) => window.clearTimeout(t));
    setPhase("card");
  };

  const no = String(unit.unit).padStart(String(unit.of).length, "0");
  return (
    <div
      className={`nx-reveal is-${phase} is-${card.rarity}`}
      style={{ "--rc": r.color, "--sw": `linear-gradient(135deg, ${fin.ramp.join(", ")})` } as CSSProperties}
      onClick={skip}
      role="dialog"
      aria-label={`Opening ${unit.product}, unit ${no}`}
    >
      <div className="nx-reveal-burst" aria-hidden="true" />
      <div className="nx-pack" aria-hidden={phase === "card"}>
        <span className="nx-pack-strip" />
        <span className="nx-pack-mark">NERTIA</span>
        <span className="nx-pack-plus">+</span>
        <span className="nx-pack-name">{unit.product}</span>
        <span className="nx-pack-fin">{fin.name}</span>
        <span className="nx-pack-no">
          No. {no} / {unit.of}
          {unit.demoSerial ? " · demo serial" : ""}
        </span>
        <span className="nx-pack-seal">Sealed · tap the chip to open</span>
      </div>
      <div className="nx-reveal-card">
        <div className="nx-flip">
          <div className="nx-flip-back" aria-hidden="true">
            <span>NERTIA</span>
            <i>+</i>
          </div>
          <div className="nx-flip-front">
            <TradingCard card={card} unit={unit} />
          </div>
        </div>
      </div>
      {phase === "card" ? (
        <div className="nx-reveal-cta">
          <p className="nx-reveal-label" aria-live="polite">
            {r.label} pull · {r.odds >= 0.1 ? `${Math.round(r.odds * 100)}% of units` : `1 in ${Math.round(1 / r.odds)} units`}
          </p>
          <button
            ref={btn}
            type="button"
            className="nx-btn is-primary"
            onClick={(e) => {
              e.stopPropagation();
              onDone();
            }}
          >
            Wear it <span aria-hidden="true">&#8594;</span>
          </button>
        </div>
      ) : (
        <p className="nx-reveal-skip">Tap to skip</p>
      )}
    </div>
  );
}
