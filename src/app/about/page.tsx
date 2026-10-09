import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Daniel Duran — full-stack developer and designer working between San Antonio and Austin. Art direction, engineering, and interfaces that earn their keep.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <>
      <Masthead />
      <main className="page" id="main">
        <Link className="back" href="/">
          ← Home
        </Link>

        <h1>Behind the work</h1>

        <p className="lede">
          I build the thing and I design the thing. That combination is the whole
          point — nothing gets lost in a handoff that never happens.
        </p>

        <div className="prose">
          <p>
            Replace this with your own words. A few things worth covering: how
            you got here, what you actually do for clients, and why someone
            should hire you over a studio.
          </p>
          <p>
            Keep it short. People decide in the first paragraph. The work above
            is doing most of the persuading already.
          </p>
          <p>
            Based in {site.locations}. Reach me at{" "}
            <a
              href={`mailto:${site.email}`}
              style={{ borderBottom: "1px solid var(--bone-faint)" }}
            >
              {site.email}
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}
