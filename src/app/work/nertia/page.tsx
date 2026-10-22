/* eslint-disable @next/next/no-img-element -- one static hero, already sized WebP */
import type { Metadata } from "next";
import Link from "next/link";
import NertiaNext from "@/components/nertia/NertiaNext";
import { finishes } from "@/lib/nertia";
import { cards } from "@/lib/nertia-cards";
import { ABILITIES } from "@/lib/nertia-race";
import { catalog } from "@/lib/nertia-shop";
import { getProject } from "@/lib/projects";

/**
 * NERTIA's overview: what it is, where each part stands, and the case
 * notes. The prototype, the race and the shop each have their own page
 * under the section bar (see layout.tsx).
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

const units = catalog.reduce((n, p) => n + (p.run ?? 0), 0);

const PILLARS = [
  {
    href: "/work/nertia/shop",
    kicker: "01 · The garment",
    status: "Presale",
    title: "Built to a standard, sold in numbered drops.",
    line: `Drop 001, the Liquid Series: ${catalog.length} pieces in ${Object.keys(finishes).length} iridescent finishes, ${units} numbered units. Tested to 50 washes, or we repair or replace it.`,
    cta: "Shop Drop 001",
  },
  {
    href: "/work/nertia/ar",
    kicker: "02 · The effect",
    status: "Working prototype",
    title: "A chip in every hem, an effect sealed inside.",
    line: `The first tap opens the unit's certificate and reveals its AR effect, one of ${cards.length}, from Common to Secret. Miles level it up.`,
    cta: "Open a unit",
  },
  {
    href: "/work/nertia/race",
    kicker: "03 · The race",
    status: "Playable demo",
    title: "Kart rules for real runs.",
    line: `Item boxes every 400 m, ${ABILITIES.length} abilities, and you dodge with your legs. Built for run clubs, with real times left untouched.`,
    cta: "Play a race",
  },
];

type Stage = "Done" | "Working" | "Demo" | "Next" | "Planned";

const ROADMAP: { stage: Stage; title: string; line: string }[] = [
  { stage: "Done", title: "Drop 001 design", line: "Product sheets for every piece, finish and fit." },
  { stage: "Working", title: "Chip and certificate", line: "Tap flow, wash log and owner record. The chip read is simulated in the browser." },
  { stage: "Working", title: "AR effects", line: `${cards.length} effects, three levels, seeded pulls and a live camera mode.` },
  { stage: "Demo", title: "NERTIA Race", line: `A playable club race with all ${ABILITIES.length} abilities and AI rivals.` },
  { stage: "Next", title: "Presale", line: "Numbers assigned at presale. Signed NFC tags so a copied chip fails." },
  { stage: "Planned", title: "Lens Studio port", line: "Phones today and Snap Specs glasses from the same build." },
  { stage: "Planned", title: "Race app", line: "GPS, earbuds and watch controls, club leagues, miles from Strava or Apple Health." },
];

export default function NertiaOverview() {
  return (
    <>
      <div className="nxo-top">
        <header className="nxo-head">
          <p className="micro">{project.tags.join(" · ")}</p>
          <h1>NERTIA</h1>
          <p className="nxo-lede">
            Numbered luxury running wear, designed in San Antonio. Every piece carries a chip, every chip holds an
            AR effect, and every run can be a race.
          </p>
          <div className="nxo-ctas">
            <Link href="/work/nertia/ar" className="nx-btn is-primary">
              Open a unit <span aria-hidden="true">&#8594;</span>
            </Link>
            <Link href="/work/nertia/race" className="nx-btn">
              Play a race
            </Link>
          </div>
        </header>
        <figure className="nxo-hero">
          <img
            src="/images/nertia/lineup-models.webp"
            alt="Drop 001 lineup: runners in iridescent NERTIA singlets and shorts across the seven finishes."
            width={976}
            height={670}
            /* Same reason as the LUXE hero: the front page prefetches
               this route and was preloading this with it. */
            loading="lazy"
            decoding="async"
          />
          <figcaption className="micro">Drop 001 · The Liquid Series</figcaption>
        </figure>
      </div>

      <dl className="nxo-stats">
        <div>
          <dt>Numbered units</dt>
          <dd>{units}</dd>
        </div>
        <div>
          <dt>Finishes</dt>
          <dd>{Object.keys(finishes).length}</dd>
        </div>
        <div>
          <dt>AR effects</dt>
          <dd>{cards.length}</dd>
        </div>
        <div>
          <dt>Race abilities</dt>
          <dd>{ABILITIES.length}</dd>
        </div>
        <div>
          <dt>Wash guarantee</dt>
          <dd>50</dd>
        </div>
      </dl>

      <ul className="nxo-pillars">
        {PILLARS.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className="nxo-pillar">
              <span className="nxo-pk">
                <span className="micro">{p.kicker}</span>
                <span className="nxo-status">{p.status}</span>
              </span>
              <span className="nxo-pt">{p.title}</span>
              <span className="nxo-pl">{p.line}</span>
              <span className="nxo-cta">
                {p.cta} <span aria-hidden="true">&#8594;</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="nxo-road" aria-labelledby="nxo-road-title">
        <header className="rca-head">
          <div>
            <p className="micro">Where it stands</p>
            <h2 id="nxo-road-title">Status.</h2>
          </div>
          <p className="rca-lede">What&rsquo;s built and working in this prototype, and what comes next.</p>
        </header>
        <ol className="nxo-steps">
          {ROADMAP.map((r) => (
            <li key={r.title} className={`is-${r.stage.toLowerCase()}`}>
              <span className="nxo-stage">{r.stage}</span>
              <span className="nxo-st">{r.title}</span>
              <span className="nxo-sl">{r.line}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="nxp-notes nxo-notes">
        <section>
          <p className="micro nx-h">The idea</p>
          <h2>The number is the product.</h2>
          <p>
            NERTIA is my running brand in development. The position is quality over quantity: luxury running wear
            built to a published standard and sold in numbered drops. Every unit has an NFC chip in the hem. Tap it
            and you get that unit&rsquo;s certificate: proof it&rsquo;s real, a wash log held against the 50-wash
            promise, and an owner record that moves with the garment when it&rsquo;s resold.
          </p>
        </section>
        <section>
          <p className="micro nx-h">The license</p>
          <h2>The certificate is also a license.</h2>
          <p>
            Each unit holds one AR effect, sealed until the first tap, like opening a pack of cards. The effect goes
            with the garment when it&rsquo;s sold, so a rare pull is worth more. That&rsquo;s a token doing an actual
            job, without asking anyone to care about a wallet.
          </p>
        </section>
        <section>
          <p className="micro nx-h">The race</p>
          <h2>A reason to wear it out.</h2>
          <p>
            A runner can&rsquo;t see their own effect mid-run. The race gives them a reason to: items take the look of
            the unit&rsquo;s effect, and run clubs get a way to race together at mixed paces. Same power for everyone,
            so the gear sells a look, never a win.
          </p>
        </section>
        <p className="micro nx-stack">Next.js · TypeScript · Canvas 2D · WebGL shaders · MediaPipe Pose · Web NFC (planned)</p>
      </div>

      <NertiaNext from="/work/nertia" />
    </>
  );
}
