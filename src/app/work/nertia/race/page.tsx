import type { Metadata } from "next";
import Link from "next/link";
import NertiaNext from "@/components/nertia/NertiaNext";
import NertiaRace from "@/components/nertia/race/NertiaRace";
import RaceAbilities from "@/components/nertia/race/RaceAbilities";
import { ABILITIES, MODES, RULES } from "@/lib/nertia-race";

export const metadata: Metadata = {
  title: "NERTIA Race",
  description: `Kart-racing rules for real runs: item boxes every 400 m, ${ABILITIES.length} abilities, and you dodge with your legs. A playable club race.`,
  alternates: { canonical: "/work/nertia/race" },
};

const STEPS = [
  { n: "01", title: "Run", line: "Start a race with your club. Same time or your own schedule, any route, any city. GPS does the rest." },
  { n: "02", title: "Pick up", line: "Every 400 m you run through an item box. Your earbuds tell you what you got." },
  { n: "03", title: "Fire", line: "Double-tap an earbud or your watch to use it. No screen, ever." },
  { n: "04", title: "Dodge", line: "A warning comes through your earbuds. Surge hard enough and the attack misses." },
];

export default function NertiaRacePage() {
  return (
    <>
      <header className="nxp-head">
        <p className="micro">NERTIA Race · Playable demo</p>
        <h1>The run club race.</h1>
        <p className="nxp-lede">
          Kart-racing rules for real runs. Item boxes every 400 m, {ABILITIES.length} abilities, and you dodge with your
          legs. Your real times never change. Play a club race below: you and two teammates against three rivals.
        </p>
      </header>

      <NertiaRace />

      <ol className="rcs">
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="rcs-n">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.line}</p>
          </li>
        ))}
      </ol>

      <RaceAbilities />

      <section className="rcm" aria-labelledby="rcm-title">
        <header className="rca-head">
          <div>
            <p className="micro">Modes</p>
            <h2 id="rcm-title">Built for run clubs.</h2>
          </div>
          <p className="rca-lede">
            A slow runner can beat a fast one on a good day, which is the point. A club with mixed paces finally
            races together instead of strung out.
          </p>
        </header>
        <ul className="rcm-grid">
          {MODES.map((m) => (
            <li key={m.name}>
              <h3>{m.name}</h3>
              <p>{m.line}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rcm" aria-labelledby="rcr-title">
        <header className="rca-head">
          <div>
            <p className="micro">Fair play</p>
            <h2 id="rcr-title">Still a running game.</h2>
          </div>
          <p className="rca-lede">
            The items are there to make a race of it. The legs still decide most of them.
          </p>
        </header>
        <ul className="rcm-grid">
          {RULES.map((r) => (
            <li key={r.title}>
              <h3>{r.title}</h3>
              <p>{r.line}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rct" aria-labelledby="rct-title">
        <p className="micro">With NERTIA gear</p>
        <h2 id="rct-title">Your unit&rsquo;s effect is how your items look.</h2>
        <p>
          A Heat Shift unit&rsquo;s Tailwind trails flames. A unit holding Lightning Steps throws its Cramp as a bolt.
          Same power for everyone, so the gear sells a look, never a win. And it fixes the AR effect&rsquo;s one weak
          spot: now there&rsquo;s a reason to see it mid-run. <Link href="/work/nertia/effects">See the effects</Link>.
        </p>
      </section>

      <NertiaNext from="/work/nertia/race" />
    </>
  );
}
