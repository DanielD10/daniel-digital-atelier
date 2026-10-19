/* eslint-disable @next/next/no-img-element -- one static hero, already sized WebP */
import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import { getProject } from "@/lib/projects";

/**
 * LUXE's case page. The app itself is a single static page at
 * public/luxe/index.html (served at /luxe), embedded below so the
 * case and the demo sit together. Its AI goes through /api/luxe/ai.
 */

const project = getProject("luxe")!;

export const metadata: Metadata = {
  title: "LUXE",
  description: project.summary,
  alternates: { canonical: "/work/luxe" },
  openGraph: {
    title: `LUXE — ${project.kind}`,
    description: project.summary,
    url: "/work/luxe",
  },
};

const FINDINGS = [
  {
    stat: "5 of 10",
    line: "“Only X rooms left” claims on Booking.com that Which? found inaccurate in spot checks.",
    href: "https://www.which.co.uk/news/2019/09/booking-com-still-misleading-holidaymakers-with-1-room-left-claims/",
    src: "Which?",
  },
  {
    stat: "5%",
    line: "of travelers could pick all three real destination photos over AI fakes in a June 2026 survey.",
    href: "https://www.scrippsnews.com/life/travel/only-5-of-travelers-can-spot-fake-travel-photos",
    src: "Talker Research",
  },
  {
    stat: "74%",
    line: "of affluent travelers are tired of itineraries that feel designed by an algorithm.",
    href: "https://www.ttgmedia.com/luxury/high-net-worth-travellers-top-frustrations-when-booking-accommodations-revealed-53363",
    src: "Preferred Hotels / Harris Poll",
  },
  {
    stat: "1 in 3",
    line: "online travelers in a Frommer’s study never got a reply to an emailed question.",
    href: "https://www.travolution.com/news/major-survey-identifies-consumer-woes-with-travel-websites/",
    src: "Frommer’s / eDigitalResearch",
  },
  {
    stat: "30",
    line: "apps on The Points Guy’s list of the best travel apps, across seven categories. LUXE is built to be one.",
    href: "https://thepointsguy.com/travel/best-travel-apps",
    src: "The Points Guy",
  },
  {
    stat: "77%",
    line: "of travelers are likely to book more than one part of a trip on the same platform.",
    href: "https://www.businesswire.com/news/home/20260602270896/en/Demand",
    src: "Expedia Group / Harris Poll, 2026",
  },
];

type Stage = "Done" | "Working" | "Next" | "Planned";

const ROADMAP: { stage: Stage; title: string; line: string }[] = [
  { stage: "Done", title: "Research", line: "Lawsuits, regulator reports, reviews and surveys on what travel and advisor sites get wrong." },
  { stage: "Done", title: "The app", line: "Discover, Saved, Plan and Live trip, with all-in pricing, room-level booking and an itinerary that checks itself." },
  { stage: "Working", title: "AI", line: "Ask LUXE, tailored trip matching, photo match, AI-built days, packing lists and a concierge desk." },
  { stage: "Next", title: "Real photography", line: "Replace the generated landscapes with dated, unretouched photos, as the app promises." },
  { stage: "Next", title: "Shared boards", line: "Move saves and votes from the browser to a database so a group really plans together." },
  { stage: "Planned", title: "Live inventory", line: "Real rates and availability through a hotel and flight API, held in the traveler’s name." },
];

export default function LuxeCase() {
  return (
    <>
      <Masthead />
      <main className="page nx-page lx-page" id="main">
        <Link className="back" href="/work">
          ← All work
        </Link>

        <div className="nxo-top">
          <header className="nxo-head">
            <p className="micro">{project.tags.join(" · ")}</p>
            <h1>LUXE</h1>
            <p className="nxo-lede">
              Places worth the flight. A luxury travel app built from the best of thirty travel apps, plus what
              they all miss. Imagery first, search second.
            </p>
            <div className="nxo-ctas">
              <a href="/luxe" className="nx-btn is-primary">
                Open the app <span aria-hidden="true">&#8594;</span>
              </a>
              <a href="#demo" className="nx-btn">
                Try it here
              </a>
            </div>
          </header>
          <figure className="nxo-hero">
            <img
              src="/images/projects/luxe.webp"
              alt="LUXE's opening screen: a volcano over a salt lake at dusk in the Atacama Desert."
              width={1600}
              height={740}
            />
            <figcaption className="micro">Discover · Atacama, Chile</figcaption>
          </figure>
        </div>

        <dl className="nxo-stats">
          <div>
            <dt>Places</dt>
            <dd>6</dd>
          </div>
          <div>
            <dt>Kept from other apps</dt>
            <dd>10</dd>
          </div>
          <div>
            <dt>Gaps filled</dt>
            <dd>13</dd>
          </div>
          <div>
            <dt>AI features</dt>
            <dd>5</dd>
          </div>
          <div>
            <dt>LUXE fee</dt>
            <dd>$0</dd>
          </div>
        </dl>

        <section className="lx-demo" id="demo" aria-labelledby="lx-demo-title">
          <header className="rca-head">
            <div>
              <p className="micro">The prototype</p>
              <h2 id="lx-demo-title">Try it.</h2>
            </div>
            <p className="rca-lede">
              Pick a month, save a place, open Plan and swap a day to watch the itinerary check itself. Live trip
              shows what happens when a flight slips. Everything you do stays in your browser.
            </p>
          </header>
          <div className="lx-frame">
            <iframe src="/luxe" title="LUXE, the working prototype" loading="lazy" />
          </div>
          <p className="micro lx-frame-note">
            Better on a big screen ·{" "}
            <a href="/luxe" className="lx-link">
              Open it full screen
            </a>
          </p>
        </section>

        <section className="lx-findings" aria-labelledby="lx-findings-title">
          <header className="rca-head">
            <div>
              <p className="micro">The research</p>
              <h2 id="lx-findings-title">What travel sites get wrong.</h2>
            </div>
            <p className="rca-lede">
              Before designing anything I read the lawsuits, regulator reports, Trustpilot threads and surveys.
              Every complaint that kept coming up became a rule in the app.
            </p>
          </header>
          <ul>
            {FINDINGS.map((f) => (
              <li key={f.stat}>
                <span className="lx-stat">{f.stat}</span>
                <span className="lx-line">{f.line}</span>
                <a className="lx-src micro" href={f.href} target="_blank" rel="noopener noreferrer">
                  {f.src} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="nxo-road" aria-labelledby="lx-road-title">
          <header className="rca-head">
            <div>
              <p className="micro">Where it stands</p>
              <h2 id="lx-road-title">Status.</h2>
            </div>
            <p className="rca-lede">
              A concept with a working prototype. Places, prices, fares, reviews and people are sample content.
            </p>
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
            <p className="micro nx-h">The brief</p>
            <h2>The last tab you open.</h2>
            <p>
              Luxury travelers jump between booking sites, advisor networks and a dozen utility apps. The booking
              sites push fake scarcity and hide fees. The advisor networks hide prices behind a person. LUXE is the
              place you finish: you find a place by looking at it, see one honest all-in price, and have a named
              person once you&rsquo;re there.
            </p>
          </section>
          <section>
            <p className="micro nx-h">What I built</p>
            <h2>Kept the best, filled the gaps.</h2>
            <p>
              It keeps what already works: flexible months from Airbnb, price-by-month from Google Flights, holds
              from Hopper, advisor perks from Virtuoso and Amex FHR. Then it adds what none of them do:
              door-to-door time on every photo, one bill for the whole trip, booking the exact room, and an
              itinerary that flags altitude and back-to-back dawn starts.
            </p>
          </section>
          <section>
            <p className="micro nx-h">The AI</p>
            <h2>It asks better questions.</h2>
            <p>
              Describe a trip in a sentence and LUXE asks the three questions that matter, then ranks every place.
              Ask LUXE can filter, open and save while it talks. AI-built days are checked by the same rules as
              yours. Inside the Claude app it runs on the visitor&rsquo;s own Claude; here it goes through a small
              server route.
            </p>
          </section>
          <p className="micro nx-stack">
            HTML · CSS · JavaScript · Canvas 2D · Claude · Next.js route handler · Vercel
          </p>
        </div>

        <Link href="/work" className="nxx">
          <span className="micro">More work</span>
          <span className="nxx-title">
            All projects <span aria-hidden="true">&#8594;</span>
          </span>
          <span className="nxx-line">NEXUS, NERTIA and ALTURA.</span>
        </Link>
      </main>
    </>
  );
}
