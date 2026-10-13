import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import LabRoom from "@/components/LabRoom";

/**
 * The room comes in through LabRoom, which is a client boundary
 * holding a `next/dynamic` import with `ssr: false`. Importing
 * AtelierRoom3D straight into this Server Component looked
 * equivalent — the scene builds in an effect either way — but it
 * is not: the whole three.js chunk then belongs to this route's
 * client bundle and has to arrive and parse before hydration
 * finishes. Behind the dynamic boundary the page shell paints
 * and becomes interactive first, and the engine follows.
 */

export const metadata: Metadata = {
  title: "Lab",
  description:
    "The studio itself, in three dimensions — a corner room that tracks the real time of day, the season and the calendar. Wake the machine on the desk.",
  alternates: { canonical: "/lab" },
};

export default function Lab() {
  return (
    <>
      <Masthead />
      {/* The room is the page, not an illustration on it. The
          heading sits over the top of the frame — where the
          ceiling void is anyway — rather than pushing a
          full-height stage below the fold. */}
      <main className="lab-full" id="main">
        <div className="lab-room">
          <LabRoom />
          <div className="lab-intro">
            <Link className="back" href="/">
              Home
            </Link>
            <h1>The lab</h1>
            <p className="lede">The room, as it is right now. Have a look around.</p>
          </div>
        </div>

        <p className="micro lab-note">
          The light follows your clock, the plants follow the season and the
          corner follows the calendar. Point at anything. Click the monitor to
          sit down at it, the television to switch it on, or the shelf to find
          something to read.
        </p>
      </main>
    </>
  );
}
