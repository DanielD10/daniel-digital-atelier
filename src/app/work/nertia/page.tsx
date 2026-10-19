import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import NertiaAR from "@/components/nertia/NertiaAR";
import NertiaLookbook from "@/components/nertia/NertiaLookbook";
import NertiaSet from "@/components/nertia/NertiaSet";
import NertiaShop from "@/components/nertia/NertiaShop";
import { finishes } from "@/lib/nertia";
import { ELEMENTS, FINISH_TYPE, RARITIES, cards } from "@/lib/nertia-cards";
import { getProject } from "@/lib/projects";

/**
 * NERTIA has its own route instead of the generic [slug] case page:
 * the case study *is* the prototype. A static segment wins over the
 * dynamic one, and [slug]'s generateStaticParams skips this slug.
 */

const project = getProject("nertia")!;

export const metadata: Metadata = {
  title: "NERTIA",
  description: project.summary,
  alternates: { canonical: "/work/nertia" },
  openGraph: {
    title: `NERTIA — ${project.kind}`,
    description: project.summary,
    url: "/work/nertia",
  },
};

export default function NertiaPage() {
  return (
    <>
      <Masthead />
      <main className="page nx-page" id="main">
        <Link className="back" href="/work">
          ← All work
        </Link>

        <p className="micro" style={{ marginBottom: "18px" }}>
          {project.tags.join(" / ")}
        </p>

        <h1>NERTIA</h1>

        <p className="lede">
          A running line where every garment carries a chip, and every chip
          holds one AR effect, sealed until the first tap. This is the
          working prototype. Open a sealed unit, read an opened one, or
          switch to your camera and wear it.
        </p>

        <NertiaAR />

        <NertiaSet />

        <NertiaShop />

        <NertiaLookbook />

        <div className="nx-write prose">
          <section>
            <p className="micro nx-h">01 — The idea</p>
            <h2>The number is the product.</h2>
            <p>
              NERTIA is my running brand in development, designed in San
              Antonio. The position is quality over quantity: luxury running
              wear built to a published standard, sold in numbered drops.
              Drop 001, the Liquid Series, runs five iridescent finishes
              across singlets, tees, shorts and a pouch.
            </p>
            <p>
              Every unit has an NFC chip sewn into the hem. Tap it with a
              phone and you get that unit&rsquo;s certificate: proof
              it&rsquo;s real, a wash log held against the 50-wash promise,
              and an owner record that moves with the garment when it&rsquo;s
              resold.
            </p>
          </section>

          <section>
            <p className="micro nx-h">02 — Every unit is a pull</p>
            <h2>The certificate is also a license.</h2>
            <p>
              Every unit holds one effect from the Drop 001 set, rolled from
              its serial when it&rsquo;s made and sealed until the chip is
              first read. Opening a unit works like opening a pack of cards.
              Unit 087 always holds the same effect, so a rare pull makes that
              shirt worth more at resale, and the effect goes with it when
              it&rsquo;s sold. That&rsquo;s a token doing an actual job,
              without asking anyone to care about a wallet.
            </p>
            <p>
              The set has {cards.length} effects across tops, bottoms, shoes,
              hats and body glows, in six rarities with published odds:{" "}
              {RARITIES.map((r) => `${r.label} ${Math.round(r.odds * 100)}%`).join(", ")}. Ultra and Secret
              pulls come with a body glow on top. The finish sets the type,
              and a garment pulls its own type three times as often:
            </p>
            <ul className="nx-list">
              {Object.values(finishes).map((f) => (
                <li key={f.id}>
                  <span
                    className="nx-dot"
                    style={{ background: `linear-gradient(135deg, ${f.ramp.join(", ")})` }}
                    aria-hidden="true"
                  />
                  <b>{f.name}</b>
                  <span>{ELEMENTS[FINISH_TYPE[f.id]].label} type</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: "24px" }}>
              <b>The one exception.</b> The Cooling Headband carries the Runner
              HUD on every unit, because it&rsquo;s a tool, not a collectible:
              pace, heart rate, distance and splits floating beside you, in a
              theme the owner picks. Beyond the drop, labelled concept: Motion
              and Trail Runner shoes (chip in the heel tab, QR on the tongue as
              backup), a visor and a beanie.
            </p>
          </section>

          <section>
            <p className="micro nx-h">03 — Run together, level up</p>
            <h2>Effects that reward running.</h2>
            <p>
              <b>Linked runners.</b> When two NERTIA units run close
              together, they connect: a live arc between the two chests, in
              both runners&rsquo; colors. Turn on Run together to see it. On
              camera it links any two people in frame. It gives an owner a
              reason to bring someone along, and it&rsquo;s the moment for the
              launch event.
            </p>
            <p>
              <b>Mileage levels.</b> Every effect has three levels, earned
              with the miles logged against the unit: Level I out of the bag,
              Level II at 100 miles, Level III, the full effect, at 300. Each
              level switches layers on, not just volume: flames get embers and
              smoke at II and light up the runner at III; lightning only
              crackles at I, throws bolts at II and lights the street at III;
              the HUD adds readouts. A common at Level III can outshine a rare
              fresh out of the bag, so the effect rewards running, not just
              luck. Preview each level on the certificate.
            </p>
          </section>

          <section>
            <p className="micro nx-h">04 — How the prototype works</p>
            <h2>One engine, two cameras.</h2>
            <p>
              <b>Demo runner.</b> Drawn procedurally in canvas every frame:
              the gait, the iridescent fabric, the road. No video files, so
              it loads instantly and runs on a phone.
            </p>
            <p>
              <b>Your camera.</b> Google&rsquo;s MediaPipe pose model runs in
              the browser on WebAssembly, on the GPU where it can. It finds
              shoulders, hips and knees every frame, and the effect emits
              from that outline. No frame leaves the device. Flip to the rear
              camera and film someone running past.
            </p>
            <p>
              <b>One physics rule.</b> Particles are born carrying the
              wearer&rsquo;s velocity and relax toward still air. In the demo
              the camera tracks the runner, so the air slides back past them.
              On a phone the camera is still, so the air is still. Same
              engine either way, which is why fire trails behind a runner and
              stars hang where you were.
            </p>
            <p>
              The chip tap is simulated here. On a real unit the phone&rsquo;s
              NFC reader opens the certificate URL, and the effect unlocks
              from there.
            </p>
          </section>

          <section>
            <p className="micro nx-h">05 — What ships next</p>
            <h2>Phones first, glasses when they&rsquo;re ready.</h2>
            <p>
              Production effects move to Snap&rsquo;s Lens Studio, which runs
              on phones today and on Snap&rsquo;s Specs AR glasses from the
              same build. Meta and Oakley&rsquo;s glasses capture footage
              rather than display AR, so they&rsquo;re a filming tool for now.
              This web version stays as the zero-install path: the
              certificate page, and the effect, from a single tap.
            </p>
          </section>

          <p className="micro nx-stack">
            Next.js · TypeScript · Canvas 2D · WebGL shaders · MediaPipe Pose
            · Web NFC (planned)
          </p>
        </div>
      </main>
    </>
  );
}
