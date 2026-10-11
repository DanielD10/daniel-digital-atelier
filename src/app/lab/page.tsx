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
      <main className="page" id="main">
        <Link className="back" href="/">
          Home
        </Link>

        <h1>The lab</h1>

        <p className="lede">The room, as it is right now. Have a look around.</p>

        <AtelierRoom3D />

        <p className="micro lab-note">
          The light follows your clock, the plants follow the season and the
          corner follows the calendar. Point at anything. Click the monitor to
          sit down at it, or the television to switch it on.
        </p>
      </main>
    </>
  );
}
