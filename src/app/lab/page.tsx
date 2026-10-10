import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import AtelierRoom from "@/components/AtelierRoom";

export const metadata: Metadata = {
  title: "Lab",
  description:
    "The studio itself — a corner room that tracks the real time of day and season. Wake the iMac to see the work.",
  alternates: { canonical: "/lab" },
};

export default function Lab() {
  return (
    <>
      <Masthead />
      <main className="page" id="main">
        <Link className="back" href="/">
          Home
        </Link>

        <h1>The lab</h1>

        <p className="lede">
          The room, as it is right now. Wake the iMac.
        </p>

        <AtelierRoom />

        <p className="micro lab-note">
          The light tracks your actual clock and the season. Change either
          yourself if you&rsquo;d rather see it another way.
        </p>
      </main>
    </>
  );
}
