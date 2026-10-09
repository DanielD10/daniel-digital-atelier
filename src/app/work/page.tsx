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
          ← Home
        </Link>

        <h1>Selected work</h1>
        <p className="lede">
          Four projects. Each one labelled for what it actually is — concept work
          is concept work, client work says so.
        </p>

        <div style={{ display: "grid", gap: "4px" }}>
          {projects.map((project, i) => (
            <Link
              key={project.slug}
              href={`/work/${project.slug}`}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "28px",
                alignItems: "baseline",
                padding: "28px 0",
                borderTop: "1px solid rgba(74,69,62,.45)",
              }}
            >
              <span className="micro">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h2 style={{ marginBottom: "8px" }}>
                  {project.name}
                  {project.nameTail ? (
                    <span style={{ fontFamily: "var(--f-micro)", fontSize: "0.7em" }}>
                      {project.nameTail}
                    </span>
                  ) : null}
                </h2>
                <p className="tile-kind">{project.kind}</p>
                <p className="prose" style={{ margin: "10px 0 0", maxWidth: "52ch" }}>
                  {project.summary}
                </p>
                <p className="tile-tags" style={{ marginTop: "14px" }}>
                  {project.tags.join(" / ")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
