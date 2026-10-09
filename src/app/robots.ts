import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  // Keep preview deployments out of search results. Only the
  // production environment invites crawlers.
  const isProduction = process.env.VERCEL_ENV === "production" || !process.env.VERCEL;

  return {
    rules: isProduction
      ? { userAgent: "*", allow: "/", disallow: ["/api/"] }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
