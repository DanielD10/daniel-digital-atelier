import Link from "next/link";
import { projects } from "@/lib/projects";

/**
 * The pinned horizontal run. SiteMotion pins .cases and translates
 * .case-track sideways as the page scrolls down.
 *
 * Below 760px the pin is skipped and this becomes an ordinary
 * horizontal swipe strip — pinning on a phone fights the browser's
 * own scroll and feels broken.
 */
export default function CaseTrack() {
  return (
    <section className="cases" aria-label="Case studies">
      <div className="case-track">
        <div className="case-intro case-panel">
          {/* A bronze wash sits behind this panel only, so the run
              opens on something lit rather than another dark card. */}
          <span className="case-intro-glow" aria-hidden="true" />

          <div className="case-intro-inner">
            <p className="micro case-intro-label">03 — Selected work</p>
            <h2 className="case-intro-type">
              Four
              <br />
              projects.
            </h2>
            <p className="case-intro-body">
              Each labelled for what it is. Concept work says concept,
              client work says client.
            </p>
            <p className="case-intro-cue">
              Keep scrolling <span aria-hidden="true">&#8594;</span> it moves
              sideways from here
            </p>
          </div>
        </div>

        {projects.map((project, i) => (
          <article className={`case-panel ${project.slug}`} key={project.slug}>
            <div className={`case-art ${project.artClass}`} aria-hidden="true" />
            <div className="case-body">
              <span className="case-idx">
                {String(i + 1).padStart(2, "0")} /{" "}
                {String(projects.length).padStart(2, "0")}
              </span>
              <h3 className="case-name">
                {project.name}
                {project.nameTail ? <b>{project.nameTail}</b> : null}
              </h3>
              <p className="case-kind">{project.kind}</p>
              <p className="case-summary">{project.summary}</p>
              <p className="case-tags">{project.tags.join(" / ")}</p>
              <Link className="case-link" href={`/work/${project.slug}`}>
                Open case study <span aria-hidden="true">&#8594;</span>
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
