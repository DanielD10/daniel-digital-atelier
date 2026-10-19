export type Project = {
  slug: string;
  name: string;
  /** Optional lowercase tail rendered in sans, e.g. SOUNDthis */
  nameTail?: string;
  kind: string;
  /** Honest labelling — concept work is labelled as concept work. */
  tags: string[];
  /** Tailwind-free class name defined in globals.css. Swap for a real image later. */
  artClass: string;
  /** Set once you have a real screenshot at /images/projects/<file>. */
  image?: string;
  summary: string;
};

export const projects: Project[] = [
  {
    slug: "luxe",
    name: "LUXE",
    kind: "Travel platform · AI",
    tags: ["Live site", "Next.js", "AI"],
    artClass: "art-luxe",
    image: "/images/projects/luxe.webp",
    summary:
      "A booking experience for places worth the flight. Built around imagery first, search second.",
  },
  {
    slug: "nexus",
    name: "NEXUS",
    kind: "Data intelligence",
    tags: ["Concept", "Data experience", "Engineering"],
    artClass: "art-nexus",
    summary:
      "A dashboard that reads like an instrument panel instead of a spreadsheet.",
  },
  {
    slug: "nertia",
    name: "NERTIA",
    kind: "Running brand · AR",
    tags: ["Own venture", "In development", "AR prototype"],
    artClass: "art-nertia",
    summary:
      "Numbered running wear. A chip in every hem holds a sealed AR effect, and every run can be a race.",
  },
  {
    slug: "altura",
    name: "ALTURA",
    kind: "Automotive concept",
    tags: ["Concept", "Brand experience", "Interactive"],
    artClass: "art-altura",
    summary:
      "A marque launch told as a single scroll. Light, surface and silence.",
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}
