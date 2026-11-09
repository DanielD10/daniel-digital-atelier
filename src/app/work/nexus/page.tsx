import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import NexusConsole from "@/components/nexus/NexusConsole";
import { getProject } from "@/lib/projects";
import { resolveDemo } from "@/lib/nexus/resolve";
import { getAccess, peekSession } from "@/lib/nexus/store";
import "./nexus.css";

/**
 * NEXUS.
 *
 * The case study and the working thing are the same page. A dashboard
 * that claims to be different is worth nothing as a screenshot, so the
 * argument is made above and then demonstrated immediately below it,
 * on a sample dataset the reader can replace with their own.
 *
 * The demo is analysed here, on the server, at render time — the first
 * paint is a populated instrument rather than a spinner.
 */

const project = getProject("nexus")!;

export const metadata: Metadata = {
  title: "NEXUS",
  description:
    "A data intelligence panel that interrogates a table instead of waiting to be asked, and opens the rows behind every claim it makes.",
  alternates: { canonical: "/work/nexus" },
  openGraph: {
    title: `NEXUS — ${project.kind}`,
    description: project.summary,
    url: "/work/nexus",
  },
};

/*
 * Rendered per request, because the gate's state is per visitor:
 * baking the unlocked panel into a cached page would show the wrong
 * thing to everyone after the first person. Reading the session cookie
 * below is what opts this route in — an explicit `force-dynamic` on top
 * of that conflicts with prerendering and 500s every request. The demo
 * analysis is cached in module scope, so the per-request cost is the
 * cookie read and nothing else.
 */
export default async function NexusPage() {
  const demo = resolveDemo();
  const session = await peekSession();
  const access = session ? await getAccess(session) : null;

  return (
    <div className="nex">
      <Masthead />
      <main id="main">
        <section className="nex-hero">
          <Link className="back" href="/work">← All work</Link>
          <p className="nex-eyebrow">02 — Data intelligence</p>
          <h1 className="nex-title">NEXUS</h1>
          <p className="nex-standfirst">
            Every analytics tool makes you ask the question. <strong>This one asks them
            all first</strong>, ranks what it finds by how much it should change your
            mind, and opens the rows behind every claim.
          </p>
        </section>

        <section className="nex-thesis">
          <div className="nex-thesis-item">
            <h3>Why nobody ships this</h3>
            <p>
              A dashboard that volunteers conclusions can be wrong, and a vendor whose
              dashboard is wrong once loses the account. A chart that just sits there is
              never wrong. So the category stays passive, and the recent wave of AI
              features bolted text-to-SQL onto the same grid — which still only helps if
              you already know what to ask.
            </p>
          </div>
          <div className="nex-thesis-item">
            <h3>The way out</h3>
            <p>
              The fix for &ldquo;it might be wrong&rdquo; isn&apos;t staying quiet, it&apos;s showing the
              work. Every claim here traces to the exact rows that produced it in one
              click. Once a reader can check you, being assertive stops being a risk —
              that&apos;s what separates an instrument panel from a spreadsheet.
            </p>
          </div>
          <div className="nex-thesis-item">
            <h3>Statistics find it, the model says it</h3>
            <p>
              Change-point detection, rank correlation, two-proportion tests and robust
              outlier fences do the finding — deterministic, reproducible, auditable.
              Claude only phrases the result and turns typed questions into a validated
              query plan. It never sees a row and never produces a number.
            </p>
          </div>
          <div className="nex-thesis-item">
            <h3>Built to be checked</h3>
            <p>
              Ranking is the product. Impact is effect size weighted by how much of the
              table a finding covers and how confident the test is, which keeps a wild
              swing across twenty rows below a moderate one across half the data. Noise
              is filtered out rather than padded in.
            </p>
          </div>
        </section>

        <NexusConsole
          initial={{
            id: demo.id,
            name: demo.name,
            analysis: demo.analysis,
            stored: false,
          }}
          tier={access?.tier ?? "anonymous"}
        />
      </main>
    </div>
  );
}
