import type { Metadata } from "next";
import Link from "next/link";
import NertiaNext from "@/components/nertia/NertiaNext";
import NertiaSet from "@/components/nertia/NertiaSet";
import { LEVELS, finishes } from "@/lib/nertia";
import { ELEMENTS, FINISH_TYPE, RARITIES, cards } from "@/lib/nertia-cards";

export const metadata: Metadata = {
  title: "NERTIA Effects",
  description: `The NERTIA Drop 001 effect set: ${cards.length} AR effects in six rarities, one sealed in every unit.`,
  alternates: { canonical: "/work/nertia/effects" },
};

export default function NertiaEffectsPage() {
  return (
    <>
      <header className="nxp-head">
        <p className="micro">Effects · The Drop 001 set</p>
        <h1>{cards.length} effects. One per unit.</h1>
        <p className="nxp-lede">
          Every unit is sealed with one of these, rolled from its serial when it&rsquo;s made. Tap any card to try it on
          the <Link href="/work/nertia/ar">AR stage</Link>.
        </p>
      </header>

      <NertiaSet head={false} arHref="/work/nertia/ar" />

      <div className="nxp-notes">
        <section>
          <p className="micro nx-h">Rarity</p>
          <h2>Published odds, like a pack of cards.</h2>
          <p>
            {RARITIES.map((r) => `${r.label} ${Math.round(r.odds * 100)}%`).join(", ")}. Ultra and Secret pulls come
            with a body glow on top. Secret cards are numbered past the set, the way trading cards do it. The same
            serial always holds the same effect, so a rare pull makes that unit worth more at resale, and the effect
            goes with it when it&rsquo;s sold.
          </p>
        </section>
        <section>
          <p className="micro nx-h">Type</p>
          <h2>The finish sets the type.</h2>
          <p>A garment pulls effects of its own type three times as often as any other.</p>
          <ul className="nx-list">
            {Object.values(finishes).map((f) => (
              <li key={f.id}>
                <span className="nx-dot" style={{ background: `linear-gradient(135deg, ${f.ramp.join(", ")})` }} aria-hidden="true" />
                <b>{f.name}</b>
                <span>{ELEMENTS[FINISH_TYPE[f.id]].label}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <p className="micro nx-h">Levels</p>
          <h2>Miles turn it up.</h2>
          <p>
            {LEVELS.map((l) => `Level ${l.roman} at ${l.min} mi`).join(", ")}. Each level switches layers on, so a
            common at Level III can outshine a rare fresh out of the bag. The Cooling Headband is the one piece that
            doesn&rsquo;t pull: it carries the Runner HUD on every unit, in a theme the owner picks.
          </p>
        </section>
      </div>

      <NertiaNext from="/work/nertia/effects" />
    </>
  );
}
