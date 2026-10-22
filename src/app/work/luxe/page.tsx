/* eslint-disable @next/next/no-img-element -- one static hero, already sized WebP */
import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import { getProject } from "@/lib/projects";
import { LUXE_URL } from "@/lib/links";

/**
 * LUXE's case page. The site itself is its own Next.js app in the
 * DanielD10/luxe repo; this page links out to it.
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
  { stage: "Done", title: "The site", line: "54 destinations with real photos, real hotels, best months, door-to-door time and entry rules for a US passport." },
  { stage: "Done", title: "AI", line: "Ask LUXE, trip matching from a sentence or a photo, questions about any place, and itinerary drafts." },
  { stage: "Done", title: "Price check", line: "The live public rate for a named hotel and dates, next to what the advisor perks are worth." },
  { stage: "Next", title: "Launch", line: "Domain, host-agency partnership and trip-request email." },
  { stage: "Planned", title: "Shared boards", line: "Move saved places from the browser to accounts so a group can plan together." },
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
              Places worth the flight. A luxury travel site built from the best of thirty travel apps, plus what
              they all miss. Imagery first, search second.
            </p>
            <div className="nxo-ctas">
              <a href={LUXE_URL} className="nx-btn is-primary" target="_blank" rel="noopener">
                Visit the site <span aria-hidden="true">&#8594;</span>
              </a>
              <a href="#research" className="nx-btn">
                The research
              </a>
            </div>
          </header>
          <figure className="nxo-hero">
            <img
              src="/images/projects/luxe.webp"
              alt="LUXE's home page: an aerial photo of overwater villas in the Maldives under the headline Places worth the flight."
              width={1600}
              height={1099}
              /* Lazy because of where this image gets fetched from.
                 The home page prefetches this route, and React
                 preloads the heroes it finds in the payload — so every
                 visitor to the front page downloaded 112kb of Maldives
                 they never saw, and Chrome logged it as a preload that
                 went unused. Lazy keeps it out of that prefetch. It
                 sits in the viewport on this page, so it is discovered
                 and fetched immediately on arrival either way. */
              loading="lazy"
              decoding="async"
            />
            <figcaption className="micro">Home · the live site</figcaption>
          </figure>
        </div>

        <dl className="nxo-stats">
          <div>
            <dt>Destinations</dt>
            <dd>54</dd>
          </div>
          <div>
            <dt>Real photos</dt>
            <dd>128</dd>
          </div>
          <div>
            <dt>Home airports</dt>
            <dd>12</dd>
          </div>
          <div>
            <dt>AI features</dt>
            <dd>4</dd>
          </div>
          <div>
            <dt>Booking fee</dt>
            <dd>$0</dd>
          </div>
        </dl>


        <section className="lx-findings" id="research" aria-labelledby="lx-findings-title">
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
              Live. Real places, real hotels and real photos, each credited to its photographer. Prices are typical
              ranges until a live rate is checked.
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
              place you finish: you find a place by looking at it, see when to go and what it really costs, and hand
              the booking to a person.
            </p>
          </section>
          <section>
            <p className="micro nx-h">What I built</p>
            <h2>Kept the best, filled the gaps.</h2>
            <p>
              It keeps what already works: flexible months from Airbnb and advisor perks from Virtuoso and Amex
              FHR. Then it adds what none of them do: door-to-door time from your own airport on every place, the
              best months at a glance, entry rules for a US passport, and a live check of the public rate for a
              named hotel next to what the perks are worth.
            </p>
          </section>
          <section>
            <p className="micro nx-h">The AI</p>
            <h2>It asks better questions.</h2>
            <p>
              Describe a trip in a sentence, or drop in a photo of the kind of place you want, and LUXE asks up to
              three questions, then ranks every destination. Ask LUXE answers with places you can open, and the
              plan form drafts an itinerary. Every task runs on the server with fixed instructions and a rate limit;
              the browser never sends a prompt.
            </p>
          </section>
          <p className="micro nx-stack">
            Next.js 16 · React 19 · TypeScript · Gemini or Claude · SerpApi · Resend · Unsplash · Vercel
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
