import Link from "next/link";
import Masthead from "@/components/Masthead";
import HeroVeil from "@/components/HeroVeil";
import FeaturedWork from "@/components/FeaturedWork";
import CaseTrack from "@/components/CaseTrack";
import BottomRail from "@/components/BottomRail";
import SiteMotion from "@/components/SiteMotion";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <>
      <Masthead />

      <main id="main">
        {/* ── Screen one. Matches the approved mockup exactly. ───── */}
        <section className="stage">
          <HeroVeil />
          <div className="meridian" aria-hidden="true" />

          <div className="hero-inner">
            <div className="hero">
              <div className="flank-l">
                <p className="micro" data-anim="fade">
                  Digital Atelier
                </p>
                <hr className="rule" data-anim="fade" />
                <p className="micro" data-anim="fade">
                  Design
                  <br />
                  Engineering
                  <br />
                  AI
                  <br />
                  Experiences
                </p>
              </div>

              <div className="core">
                {/* Each line sits in its own overflow-hidden mask so
                    the entrance reads as type rising off a baseline. */}
                <h1 className="wordmark">
                  <span className="line">
                    <span className="line-inner">Daniel</span>
                  </span>
                  <span className="line">
                    <span className="line-inner">
                      Duran<sup>TM</sup>
                    </span>
                  </span>
                </h1>

                <p className="discipline" data-anim="fade">
                  Digital Artist <em>/</em> Designer <em>/</em> Engineer
                </p>

                <hr className="rule rule-wide" data-anim="fade" />

                <p className="statement" data-anim="fade">
                  I make the internet feel less like software.
                  <br />
                  And more like an experience.
                </p>

                <div className="place" data-anim="fade">
                  <p className="micro">{site.locations}</p>
                  <p className="micro place-sub">
                    Local roots
                    <br />
                    Global vision
                  </p>
                </div>
              </div>

              <div className="flank-r">
                <p className="micro" data-anim="fade">
                  Art
                  <br />
                  Meets
                  <br />
                  Engineering
                </p>
                <hr className="rule rule-end" data-anim="fade" />
                <p className="micro flank-r-low" data-anim="fade">
                  Ideas
                  <br />
                  Interfaces
                  <br />
                  Brands
                  <br />
                  Experiences
                  <br />
                  That sell
                </p>
                <hr className="rule rule-end" data-anim="fade" />
              </div>
            </div>

            <div className="plate" aria-hidden="true" />

            <div className="cue" aria-hidden="true" data-anim="fade">
              <span className="ring">Scroll</span>
              <span className="tail" />
            </div>
          </div>

          <div className="strip-wrap">
            <div className="strip-head" data-anim="fade">
              <span className="micro">Featured Work</span>
              <span className="line-fill" />
              <span className="micro">All Projects (04)</span>
              <span className="dot" />
            </div>
            <FeaturedWork />
          </div>
        </section>

        {/* ── Manifesto ───────────────────────────────────────────── */}
        <section className="manifesto">
          <p className="micro manifesto-label" data-reveal>
            01 — The premise
          </p>
          <h2 className="manifesto-type">
            <span className="line">
              <span className="line-inner">Code</span>
            </span>
            <span className="line">
              <span className="line-inner">is a</span>
            </span>
            <span className="line">
              <span className="line-inner">medium.</span>
            </span>
          </h2>
          <p className="manifesto-body" data-reveal>
            Most sites are assembled. Components dropped into a grid, a
            stock photo on top, shipped. They work, and nobody remembers
            them. I build the other kind — where the engineering is what
            makes you feel something, and the feeling is what makes
            people buy.
          </p>
        </section>

        {/* ── The pinned horizontal case run ──────────────────────── */}
        <CaseTrack />

        {/* ── A decade in the making ──────────────────────────────── */}
        <section className="decade">
          <p className="micro" data-reveal>
            02 — A decade in the making
          </p>
          <div className="decade-row" data-reveal>
            <span className="decade-year">2016</span>
            <span className="decade-rule">
              <span />
            </span>
            <span className="decade-year">2026</span>
          </div>
          <p className="decade-body" data-reveal>
            Ten years of shipping: ops and compliance work that taught me
            what breaks at scale, a full-stack certificate that taught me
            how to build it properly, and a studio practice that taught me
            design is the part clients actually pay for.
          </p>
        </section>

        {/* ── Close ───────────────────────────────────────────────── */}
        <section className="closer">
          <h2 className="closer-type" data-reveal>
            Let&rsquo;s build
            <br />
            something
            <br />
            unforgettable.
          </h2>
          <div className="closer-actions" data-reveal>
            <Link className="cta" href="/contact">
              Start a project <span aria-hidden="true">&#8594;</span>
            </Link>
            <Link className="cta cta-ghost" href="/work">
              See the work
            </Link>
          </div>
          <p className="micro closer-foot" data-reveal>
            {site.locations} — {site.email}
          </p>
        </section>
      </main>

      <BottomRail />
      <SiteMotion />
    </>
  );
}
