"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ELEMENTS,
  HOME_LABEL,
  RARITIES,
  cardById,
  cards,
  rarity,
  setNumber,
  type Home,
} from "@/lib/nertia-cards";
import { onPulled, pulledCards } from "@/lib/nertia-collection";
import { EffectIcon } from "./NertiaCard";

const FILTERS: (Home | "all")[] = ["all", "top", "bottom", "feet", "head", "body"];

/**
 * The Drop 001 set: every effect a unit can hold, by where it's worn,
 * with pull odds. Cards this visitor has pulled light up; any card can
 * be tried on the stage.
 */
export default function NertiaSet() {
  const [filter, setFilter] = useState<Home | "all">("all");
  const [pulled, setPulled] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPulled(pulledCards());
    return onPulled(() => setPulled(pulledCards()));
  }, []);

  const list = useMemo(() => cards.filter((c) => filter === "all" || c.home === filter), [filter]);
  const got = cards.filter((c) => pulled.has(c.id)).length;

  const preview = (id: string) => window.dispatchEvent(new CustomEvent("nertia:preview", { detail: id }));

  return (
    <section className="nx-set" aria-labelledby="nx-set-title">
      <header className="nx-set-head">
        <div>
          <p className="micro">The set · Drop 001</p>
          <h2 id="nx-set-title">{cards.length} effects. One per unit.</h2>
        </div>
        <div className="nx-set-side">
          <p className="nx-set-lede">
            Every unit is sealed with one effect from this set, rolled from its serial when it&rsquo;s made. Ultra
            and Secret pulls come with a body glow on top. The finish sets the type: a garment pulls its own
            type three times as often.
          </p>
          <p className="nx-set-count">
            <b>{got}</b> of {cards.length} pulled
            <span className="nx-meter" aria-hidden="true">
              <span style={{ width: `${(got / cards.length) * 100}%` }} />
            </span>
          </p>
        </div>
      </header>

      <div className="nx-set-bar">
        <div className="nx-chips" role="group" aria-label="Where it's worn">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : HOME_LABEL[f]}
              <span>{f === "all" ? cards.length : cards.filter((c) => c.home === f).length}</span>
            </button>
          ))}
        </div>
        <ul className="nx-odds" aria-label="Pull odds">
          {RARITIES.map((r) => (
            <li key={r.id} style={{ ["--rc" as string]: r.color }}>
              <i aria-hidden="true" />
              {r.label} <b>{Math.round(r.odds * 100)}%</b>
            </li>
          ))}
        </ul>
      </div>

      <ul className="nx-set-grid">
        {list.map((c) => {
          const r = rarity(c.rarity);
          const own = pulled.has(c.id);
          const bonus = c.bonus ? cardById(c.bonus) : undefined;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`nx-mini is-${c.rarity}${own ? " is-own" : ""}`}
                style={{ "--rc": r.color, "--ec": ELEMENTS[c.element].color } as CSSProperties}
                onClick={() => preview(c.id)}
                aria-label={`${c.name}, ${r.label}, ${ELEMENTS[c.element].label} type${own ? ", pulled" : ""}. Try it on the stage.`}
              >
                <span className="nx-mini-art">
                  <EffectIcon engine={c.engine} />
                  {own ? <span className="nx-mini-own">Pulled</span> : null}
                </span>
                <span className="nx-mini-name">{c.name}</span>
                <span className="nx-mini-meta">
                  <i aria-hidden="true" />
                  {ELEMENTS[c.element].label}
                  {bonus ? ` · + ${bonus.name}` : ""}
                </span>
                <span className="nx-mini-foot">
                  <span>{"★".repeat(r.stars)}</span>
                  <span>{setNumber(c)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="nx-set-note">
        Tap any card to try it on the stage. The Cooling Headband carries the Runner HUD on every unit instead of a
        pull, with a theme the owner picks.
      </p>
    </section>
  );
}
