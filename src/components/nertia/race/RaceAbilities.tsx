"use client";

import { useState } from "react";
import { ABILITIES, ABILITY_KINDS, type AbilityKind } from "@/lib/nertia-race";
import RaceIcon from "./RaceIcon";

const BUCKETS = ["Front", "Middle", "Back"] as const;

/** each ability's chance from a box, by where you are in the race */
const share = ABILITIES.map((a) =>
  a.odds.map((w, b) => w / ABILITIES.reduce((s, x) => s + x.odds[b], 0)),
);

/**
 * Every ability, filterable by kind: what it does, when to use it, how
 * to beat it, and who gets it out of the boxes.
 */
export default function RaceAbilities() {
  const [kind, setKind] = useState<AbilityKind | "all">("all");
  const list = ABILITIES.map((a, i) => ({ a, odds: share[i] })).filter(({ a }) => kind === "all" || a.kind === kind);

  return (
    <section className="rca" aria-labelledby="rca-title">
      <header className="rca-head">
        <div>
          <p className="micro">Abilities</p>
          <h2 id="rca-title">{ABILITIES.length} abilities. Every one has a job.</h2>
        </div>
        <p className="rca-lede">
          Boxes hand out abilities by where you are in the race. The back of the pack gets the comeback items, the
          front gets defense. Everything an attack does can be answered.
        </p>
      </header>

      <div className="nx-chips rca-filter" role="group" aria-label="Kind">
        <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
          All <span>{ABILITIES.length}</span>
        </button>
        {ABILITY_KINDS.map((k) => (
          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label} <span>{ABILITIES.filter((a) => a.kind === k.id).length}</span>
          </button>
        ))}
      </div>

      <ul className="rca-grid">
        {list.map(({ a, odds }) => (
          <li key={a.id} className={`rca-card is-${a.kind}`}>
            <div className="rca-top">
              <RaceIcon id={a.id} className="rca-icon" />
              <div>
                <h3>{a.name}</h3>
                <p className="rca-kind">
                  {ABILITY_KINDS.find((k) => k.id === a.kind)!.label} · {a.worth}
                </p>
              </div>
            </div>
            <p className="rca-effect">{a.effect}</p>
            <dl className="rca-rows">
              <div>
                <dt>Use it</dt>
                <dd>{a.use}</dd>
              </div>
              {a.counter ? (
                <div>
                  <dt>Beat it</dt>
                  <dd>{a.counter}</dd>
                </div>
              ) : null}
            </dl>
            <div className="rca-odds" aria-label={`Box odds: ${BUCKETS.map((b, i) => `${b.toLowerCase()} ${Math.round(odds[i] * 100)}%`).join(", ")}`}>
              {BUCKETS.map((b, i) => (
                <span key={b}>
                  <i>
                    <b style={{ transform: `scaleY(${Math.min(1, odds[i] / 0.14)})` }} />
                  </i>
                  {b}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
