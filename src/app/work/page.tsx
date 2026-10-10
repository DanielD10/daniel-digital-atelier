import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import { projects } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Selected projects and concept work by Daniel Duran — product design, creative engineering and interactive brand experiences.",
  alternates: { canonical: "/work" },
};

export default function WorkIndex() {
  return (
    <>
      <Masthead />
      <main className="page" id="main">
        <Link className="back" href="/">
          Home
        </Link>

        <h1>Selected work</h1>
        <p className="lede">
          Four projects. Each labelled for what it is — concept work says
          concept, client work says client.
        </p>

        <div className="rowset">
          {projects.map((project, i) => (
            <Link className="row" key={project.slug} href={`/work/${project.slug}`}>
              {/* The art is the hover reveal: invisible at rest, washing in
                  from the right so the row lights up rather than lifts. */}
              <span className={`row-art ${project.artClass}`} aria-hidden="true" />

              <span className="row-idx">{String(i + 1).padStart(2, "0")}</span>

              <div className="row-body">
                <h2 className="row-name">
                  {project.name}
                  {project.nameTail ? <b>{project.nameTail}</b> : null}
                </h2>
                <p className="row-kind">{project.kind}</p>
                <p className="row-summary">{project.summary}</p>
                <p className="row-tags">{project.tags.join(" / ")}</p>
              </div>

              <span className="row-go" aria-hidden="true">
                &#8594;
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
