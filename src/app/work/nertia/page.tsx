import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import NertiaAR from "@/components/nertia/NertiaAR";
import { finishes } from "@/lib/nertia";
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
          unlocks that garment&rsquo;s own AR effect. This is the working
          prototype. Tap a unit to read its chip, or switch to your camera
          and wear it.
        </p>

        <NertiaAR />

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
            <p className="micro nx-h">02 — One finish, one effect</p>
            <h2>The certificate is also a license.</h2>
            <p>
              Each finish owns one signature effect. Owning unit 087 means
              owning its flames. Sell the shirt and the flames go with it.
              That&rsquo;s a token doing an actual job, without asking anyone
              to care about a wallet.
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
                  <span>{f.effectName}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: "24px" }}>
              <b>Footwear, as a concept.</b> Shoes break the one-finish rule
              on purpose. The chip sits in the heel tab, with a printed QR on
              the tongue as a backup, and every pair gets the same effect:
              each footstrike lands as a shockwave and the shoes leave light
              on the road. Footwear is a different manufacturing problem from
              apparel, so it&rsquo;s labelled concept and kept out of Drop
              001.
            </p>
          </section>

          <section>
            <p className="micro nx-h">03 — How the prototype works</p>
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
            <p className="micro nx-h">04 — What ships next</p>
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
            Next.js · TypeScript · Canvas 2D · MediaPipe Pose · Web NFC
            (planned)
          </p>
        </div>
      </main>
    </>
  );
}
