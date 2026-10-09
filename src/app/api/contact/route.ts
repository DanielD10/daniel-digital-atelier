import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import {
  validateContact,
  sanitizeHeaderValue,
  escapeHtml,
} from "@/lib/contact-schema";
import { site } from "@/lib/site";

/**
 * POST /api/contact
 *
 * Validates, rate-limits, and delivers an enquiry.
 *
 * Delivery uses Resend's REST API over plain fetch — no SDK, so
 * there's no extra dependency that can break a build. If
 * RESEND_API_KEY is absent the route still validates and returns
 * 200, logging the message to the Vercel function log instead. That
 * keeps the form testable before email is wired up, and means a
 * missing env var never shows a visitor an error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendError = { message?: string };

export async function POST(request: Request) {
  // 1 — Rate limit before doing any work.
  const key = clientKey(request.headers);
  const limit = rateLimit(`contact:${key}`);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many messages. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      },
    );
  }

  // 2 — Parse. A malformed body is a 400, not a 500.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // 3 — Validate with the same rules the client used.
  const { ok, errors, value } = validateContact(payload);
  if (!ok) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", errors },
      { status: 400 },
    );
  }

  // 4 — Honeypot. Return 200 so the bot thinks it worked and
  //     doesn't retry with a different strategy.
  if (value.company) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL ?? site.email;
  const from = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !from) {
    console.info("[contact] delivery not configured — message logged only", {
      name: value.name,
      email: value.email,
      length: value.message.length,
    });
    return NextResponse.json({ ok: true, delivered: false }, { status: 200 });
  }

  // 5 — Deliver.
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Portfolio <${from}>`,
        to: [to],
        // reply_to means hitting Reply in your inbox goes to them,
        // not to your own sending address.
        reply_to: sanitizeHeaderValue(value.email),
        subject: `New enquiry — ${sanitizeHeaderValue(value.name)}`,
        html: `
          <div style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6">
            <p><strong>From:</strong> ${escapeHtml(value.name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(value.email)}</p>
            <hr style="border:0;border-top:1px solid #ddd;margin:16px 0" />
            <p style="white-space:pre-wrap">${escapeHtml(value.message)}</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as ResendError;
      // Log the real reason; show the visitor something actionable.
      console.error("[contact] resend rejected", response.status, detail.message);
      return NextResponse.json(
        { error: `That didn't send. Email me directly at ${to}.` },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, delivered: true }, { status: 200 });
  } catch (error) {
    console.error("[contact] delivery threw", error);
    return NextResponse.json(
      { error: `That didn't send. Email me directly at ${to}.` },
      { status: 502 },
    );
  }
}

/** Anything other than POST gets a clear 405 rather than a 404. */
export async function GET() {
  return NextResponse.json(
    { error: "Use POST to submit the contact form." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
