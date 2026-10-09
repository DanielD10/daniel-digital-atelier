import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";

export const metadata: Metadata = {
  title: "Lab",
  description:
    "Creative coding, AI experiments and unfinished things — the sketchbook behind the portfolio.",
  alternates: { canonical: "/lab" },
};

export default function Lab() {
  return (
    <>
      <Masthead />
      <main className="page" id="main">
        <Link className="back" href="/">
          ← Home
        </Link>

        <h1>The lab</h1>

        <p className="lede">
          Experiments, half-finished ideas, and the things that turn into
          projects later.
        </p>

        <div className="prose">
          <p>
            Nothing here yet. This is the right home for the WebGL and generative
            pieces once they exist — they belong in a sketchbook, not bolted onto
            the homepage where they cost every visitor a slower load.
          </p>
        </div>
      </main>
    </>
  );
}
