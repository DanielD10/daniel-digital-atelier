import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { projects } from "@/lib/projects";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/work`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "yearly", priority: 0.7 },
    { url: `${base}/lab`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.8 },
  ];

  const projectPages: MetadataRoute.Sitemap = projects.map((p) => ({
    url: `${base}/work/${p.slug}`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  // NERTIA is a small site of its own
  const nertia: MetadataRoute.Sitemap = ["ar", "effects", "race", "shop"].map((sub) => ({
    url: `${base}/work/nertia/${sub}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // LUXE's working prototype, a static page in public/luxe
  const luxe: MetadataRoute.Sitemap = [
    { url: `${base}/luxe`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  return [...pages, ...projectPages, ...nertia, ...luxe];
}
