import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Uptime probe. Also the fastest way to tell whether a deployment is
 * actually live and which commit it's running, without loading the
 * whole page.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      time: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      env: process.env.VERCEL_ENV ?? "development",
      contactDelivery: Boolean(process.env.RESEND_API_KEY) ? "configured" : "log-only",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
