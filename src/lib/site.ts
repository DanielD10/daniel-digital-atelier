/**
 * Single source of truth for site-level constants.
 * Change the domain here once and metadata, sitemap, robots and
 * the OG image all follow.
 */

export const site = {
  name: "Daniel Duran",
  shortName: "D/D",
  title: "Daniel Duran — Digital Designer & Creative Engineer",
  description:
    "The digital atelier of Daniel Duran — art direction, software engineering, AI-assisted design and interactive experiences. San Antonio / Austin, TX.",
  tagline: "Art meets engineering.",
  locations: "San Antonio / Austin, TX",
  email: "danielduran1024@gmail.com",
} as const;

/**
 * Resolves the canonical origin in every environment.
 *
 * Order matters:
 *   1. NEXT_PUBLIC_SITE_URL — set this in Vercel for production.
 *   2. VERCEL_URL — auto-populated on preview deployments.
 *   3. localhost — dev fallback.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return explicit.endsWith("/") ? explicit.slice(0, -1) : explicit;
  }

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
