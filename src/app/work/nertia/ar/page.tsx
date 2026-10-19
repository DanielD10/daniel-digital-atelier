import type { Metadata } from "next";
import NertiaAR from "@/components/nertia/NertiaAR";
import NertiaNext from "@/components/nertia/NertiaNext";
import NertiaSet from "@/components/nertia/NertiaSet";
import { LEVELS } from "@/lib/nertia";
import { cards } from "@/lib/nertia-cards";

export const metadata: Metadata = {
  title: "NERTIA AR",
  description: `The NERTIA AR prototype: every unit holds one of ${cards.length} effects, sealed until its chip is first read.`,
  alternates: { canonical: "/work/nertia/ar" },
};

export default function NertiaArPage() {
  return (
    <>
      <header className="nxp-head">
        <p className="micro">AR prototype · Working</p>
        <h1>Every unit holds an effect.</h1>
        <p className="nxp-lede">
          Open a sealed unit and see what it holds, read one that&rsquo;s already open, or switch to your camera
          and wear it. Everything here runs live in the browser.
        </p>
      </header>

      <NertiaAR />

      <NertiaSet />

      <div className="nxp-notes">
        <section>
          <p className="micro nx-h">How it works</p>
          <h2>One engine, two cameras.</h2>
          <p>
            <b>Demo runner.</b> Drawn in canvas every frame: the gait, the iridescent fabric, the road. No video
            files, so it loads instantly and runs on a phone.
          </p>
          <p>
            <b>Your camera.</b> Google&rsquo;s MediaPipe pose model runs on the device and finds shoulders, hips,
            knees and feet every frame. The effect comes off that outline. No frame leaves the phone.
          </p>
          <p>
            <b>One physics rule.</b> Particles are born carrying the wearer&rsquo;s speed and settle into still
            air. That&rsquo;s why fire trails behind a runner and stars hang where you were. Fire, fog and auras go
            through WebGL shaders on top.
          </p>
        </section>
        <section>
          <p className="micro nx-h">Levels</p>
          <h2>Miles turn the effect up.</h2>
          <p>
            Three levels, earned with the miles logged against the unit:{" "}
            {LEVELS.map((l) => `Level ${l.roman} at ${l.min} mi`).join(", ")}. Each level adds layers, not just
            volume. Flames get embers and smoke at II and light up the runner at III. Lightning only crackles at I
            and throws bolts at II. A common at Level III can outshine a rare fresh out of the bag.
          </p>
          <p>
            <b>Run together.</b> Two units running close together link with a live arc between their chests, in
            both runners&rsquo; colors. Turn it on with Run together on the stage.
          </p>
        </section>
        <section>
          <p className="micro nx-h">Production</p>
          <h2>Phones first, glasses later.</h2>
          <p>
            Production effects move to Snap&rsquo;s Lens Studio, which runs on phones today and on Snap&rsquo;s
            Specs glasses from the same build. The chip tap is simulated here. On a real unit the phone&rsquo;s NFC
            reader opens the certificate, and the effect unlocks from there.
          </p>
        </section>
      </div>

      <NertiaNext from="/work/nertia/ar" />
    </>
  );
}
