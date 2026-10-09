import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Daniel Duran designs and engineers the same work — no handoff, nothing lost in translation. San Antonio and Austin.",
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

        <p className="lede">
          I design it and I engineer it. That&rsquo;s the entire argument.
        </p>

        <div className="prose prose-wide">
          <p>
            At a studio those are two different people who have never sat in
            the same room, and what you&rsquo;re paying for is the meeting
            where one explains the idea to the other. Something always dies in
            that translation. Usually the reason it was good.
          </p>

          <p>
            Nothing gets lost in a handoff that never happens. When the thing
            I drew turns out to be wrong at 2am on a Tuesday, I don&rsquo;t
            file a ticket. I change it.
          </p>

          <p>
            Most sites are assembled. Components dropped in a grid, a stock
            photo on top, shipped, forgotten by the end of the week. They work,
            and nobody remembers them. I&rsquo;m not interested in building
            those. I want the kind someone describes to a friend later and gets
            the details wrong, because what they actually remember is how it
            felt. That&rsquo;s the whole trade — the engineering is what makes
            you feel something, and the feeling is what makes people buy.
          </p>

          <p className="prose-beat">
            Ten years learning the craft. The work starts now.
          </p>

          <p>
            The planet on the home page isn&rsquo;t a stock graphic. It&rsquo;s
            live NASA imagery, lit by whichever half of the world is actually
            dark at the moment you loaded it. Nobody asked for that. That is
            the point — it&rsquo;s the standard, and it&rsquo;s the same
            standard your project gets.
          </p>

          <p>
            Based between {site.locations}. Local roots, global vision.
          </p>

          <p>
            If you&rsquo;re building something that deserves better than a
            template,{" "}
            <Link className="prose-link" href="/contact">
              start here
            </Link>
            . Or reach me directly at{" "}
            <a className="prose-link" href={`mailto:${site.email}`}>
              {site.email}
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}
