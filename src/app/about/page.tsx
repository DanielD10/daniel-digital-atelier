import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Daniel Duran. Designer and engineer, same hands. San Antonio and Austin.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <>
      <Masthead />
      <main className="page" id="main">
        <Link className="back" href="/">
          Home
        </Link>

        <h1>Behind the work</h1>

        <div className="creed">
          <p className="creed-lead">I design it. I build it. Same hands.</p>

          <p>
            Studios split that between two people who never meet. You pay for
            the translation.
          </p>

          <p>I skip it.</p>

          <p>Most sites are assembled. Mine are built.</p>

          <p className="creed-beat">Ten years in. The work starts now.</p>

          <p>
            The planet on the home page is live NASA imagery. Nobody asked for
            it.
          </p>

          <p className="creed-place">
            {site.locations}
            <br />
            Local roots. Global vision.
          </p>
        </div>

        <Link className="cta creed-cta" href="/contact">
          Start a project <span aria-hidden="true">&#8594;</span>
        </Link>
      </main>
    </>
  );
}
