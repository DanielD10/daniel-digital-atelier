import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import AtelierRoom3D from "@/components/AtelierRoom3D";

/**
 * Imported directly rather than through next/dynamic: this page is
 * a Server Component, and Next 16 does not allow `ssr: false`
 * from one. It costs nothing — the room builds itself inside an
 * effect, so the server renders the empty stage and the scene
 * appears on mount either way.
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
          <AtelierRoom3D />
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
