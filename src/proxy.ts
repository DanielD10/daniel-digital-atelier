import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` and the exported
 * function from `middleware` to `proxy`. The runtime is Node.js and
 * is not configurable. If you follow an older tutorial that says
 * `export function middleware`, it will silently do nothing.
 *
 * Static security headers live in next.config.ts instead — they
 * don't need JS on every request. This file handles the per-request
 * work only.
 */

/** Paths probed constantly by scanners. Answered 404 without rendering. */
const BLOCKED = [
  "/wp-admin",
  "/wp-login.php",
  "/xmlrpc.php",
  "/.env",
  "/.git",
  "/config.json",
  "/phpmyadmin",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (BLOCKED.some((p) => pathname.toLowerCase().startsWith(p))) {
    return new NextResponse(null, { status: 404 });
  }

  // Redirect www → apex so there's one canonical host for SEO.
  // Only fires in production; previews and localhost pass through.
  const host = request.headers.get("host") ?? "";
  if (process.env.NODE_ENV === "production" && host.startsWith("www.")) {
    const url = request.nextUrl.clone();
    url.host = host.slice(4);
    return NextResponse.redirect(url, 308);
  }

  // Tag every request so a Vercel log line can be matched to a report.
  const requestId = crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  /**
   * Skip static assets and image optimization — running JS for every
   * font and image is wasted compute.
   */
  matcher: [
    "/((?!_next|images|audio|icon|opengraph-image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
