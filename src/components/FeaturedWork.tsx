import Link from "next/link";
import { projects } from "@/lib/projects";

export default function FeaturedWork() {
  return (
    <section className="work" aria-label="Featured work">
      {projects.map((project, i) => (
        <Link key={project.slug} className="tile" href={`/work/${project.slug}`}>
          <span className={`art ${project.artClass}`} />
          <div className="tile-body">
            <span className="tile-idx">
              {String(i + 1).padStart(2, "0")} /{" "}
              {String(projects.length).padStart(2, "0")}
            </span>
            <h2 className="tile-name">
              {project.name}
              {project.nameTail ? <b>{project.nameTail}</b> : null}
            </h2>
            <p className="tile-kind">{project.kind}</p>
            <p className="tile-tags">{project.tags.join(" / ")}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}
