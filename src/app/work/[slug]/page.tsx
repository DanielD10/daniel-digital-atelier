import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Masthead from "@/components/Masthead";
import { projects, getProject } from "@/lib/projects";

/**
 * In Next.js 15+ `params` is a Promise and must be awaited. Reading
 * it synchronously used to warn; in 16 it does not work at all.
 */
type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) return { title: "Not found" };

  const fullName = `${project.name}${project.nameTail ?? ""}`;

  return {
    title: fullName,
    description: project.summary,
    alternates: { canonical: `/work/${project.slug}` },
    openGraph: {
      title: `${fullName} — ${project.kind}`,
      description: project.summary,
      url: `/work/${project.slug}`,
    },
  };
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) notFound();

  return (
    <>
      <Masthead />
      <main className="page" id="main">
        <Link className="back" href="/work">
          ← All work
        </Link>

        <p className="micro" style={{ marginBottom: "18px" }}>
          {project.tags.join(" / ")}
        </p>

        <h1>
          {project.name}
          {project.nameTail ? (
            <span style={{ fontFamily: "var(--f-micro)", fontSize: "0.55em" }}>
              {project.nameTail}
            </span>
          ) : null}
        </h1>

        <p className="lede">{project.summary}</p>

        <div
          className={project.artClass}
          style={{
            height: "clamp(240px, 46vh, 520px)",
            marginBottom: "56px",
            border: "1px solid rgba(74,69,62,.4)",
          }}
          aria-hidden="true"
        />

        <div className="prose">
          <h2 style={{ marginBottom: "16px" }}>The case study goes here</h2>
          <p>
            Replace this block with the real write-up: the brief, the constraint
            that shaped the design, what you built, and what it changed. Screens
            belong at <code>/images/projects/{project.slug}.webp</code> — drop the
            file in and swap the placeholder panel above for a
            <code> next/image</code> component.
          </p>
          <p>
            Keep it honest. Concept work reads as strong work when it is labelled
            as concept work and the thinking is visible.
          </p>
        </div>
      </main>
    </>
  );
}
