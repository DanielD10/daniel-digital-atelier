import type { NextConfig } from "next";
import { LUXE_URL } from "./src/lib/links";

/**
 * Security headers are set here rather than in proxy.ts because
 * next.config headers are applied at the edge without running JS
 * on every request. proxy.ts handles per-request work only.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // camera=(self): the NERTIA prototype (/work/nertia) opens the
    // camera on request. It can't be scoped to that one route — the
    // policy belongs to the document, and a client-side navigation
    // from any other page keeps the policy that page loaded with.
    // (self) still blocks every embedded third-party frame.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    formats: ["image/avif", "image/webp"],
  },

  /** LUXE is its own site now; old /luxe links go there. */
  async redirects() {
    return [
      { source: "/luxe", destination: LUXE_URL, permanent: false },
      { source: "/luxe/:path*", destination: LUXE_URL, permanent: false },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Audio and hero art are immutable once published — cache hard.
        source: "/audio/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
