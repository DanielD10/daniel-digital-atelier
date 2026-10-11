import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import LabRoom from "@/components/LabRoom";

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
          The room, as it is right now. Sit down at the machine — it works.
        </p>

        <LabRoom />

        <p className="micro lab-note">
          The light tracks your actual clock and the season, the clock on the
          wall tells the real time, and the cat is watching your cursor.
          Change the hour yourself if you&rsquo;d rather see it another way.
        </p>
      </main>
    </>
  );
}
