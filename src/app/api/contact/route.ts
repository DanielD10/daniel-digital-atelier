import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import {
  validateContact,
  sanitizeHeaderValue,
  escapeHtml,
} from "@/lib/contact-schema";
import { recordEnquiry, markDelivery } from "@/lib/enquiry-store";
import { site } from "@/lib/site";

/**
 * POST /api/contact
 *
 * Validates, rate-limits, records, and delivers an enquiry.
 *
 * The order matters. The message is written to the enquiries table
 * before any email is attempted, so a Resend outage costs a
 * notification rather than a lead. Delivery uses Resend's REST API
 * over plain fetch — no SDK, nothing extra that can break a build.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendError = { message?: string };
type ResendOk = { id?: string };

/**
 * onboarding@resend.dev is Resend's shared test sender. It only ever
 * delivers to the account owner's own address, so it can carry the
 * notification to Daniel and can never carry a confirmation back to
 * the person who wrote in. Auto-reply therefore waits for a verified
 * domain rather than silently sending into a hole.
 */
function canReachStrangers(from: string): boolean {
  return !/@resend\.dev>?$/i.test(from.trim());
}

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
  //     doesn't retry with a different strategy. Nothing is stored:
  //     a honeypot hit is noise, not an enquiry.
  if (value.company) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL ?? site.email;
  const from = process.env.CONTACT_FROM_EMAIL;

  /* 5 — Write it down, before anything that can fail over a network
         to a third party. From here on the message exists whatever
         happens to the email. */
  const id = crypto.randomUUID();
  const stored = await recordEnquiry({
    id,
    name: value.name,
    email: value.email,
    message: value.message,
    userAgent: request.headers.get("user-agent"),
  });

  if (!apiKey || !from) {
    console.error("[contact] delivery not configured", { id, stored });
    // Stored or not, be straight with the visitor: nothing was sent.
    return NextResponse.json({ ok: true, delivered: false }, { status: 200 });
  }

  // 6 — Deliver.
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
      const reason = detail.message ?? `resend ${response.status}`;
      // Log the real reason; show the visitor something actionable.
      console.error("[contact] resend rejected", response.status, reason, { id, stored });
      await markDelivery(id, { delivered: false, error: reason });

      /* Stored means the enquiry is safe even though the email is
         not, so say so rather than sending them away. Unstored means
         this really would vanish, so push them at the mailto. */
      return stored
        ? NextResponse.json({ ok: true, delivered: false }, { status: 200 })
        : NextResponse.json(
            { error: `That didn't send. Email me directly at ${to}.` },
            { status: 502 },
          );
    }

    const sent = (await response.json().catch(() => ({}))) as ResendOk;
    await markDelivery(id, { delivered: true, resendId: sent.id });

    /* 7 — Tell them it landed. Only possible from a verified domain:
           the test sender cannot reach anyone but Daniel, so rather
           than post a confirmation into a hole, skip it and say why
           in the log. */
    if (canReachStrangers(from)) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${site.name} <${from}>`,
            to: [sanitizeHeaderValue(value.email)],
            reply_to: to,
            subject: "Thanks — I got your message",
            html: `
              <div style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6;color:#1a1a1a">
                <p>Hi ${escapeHtml(value.name.split(" ")[0] ?? value.name)},</p>
                <p>Thanks for writing. Your message reached me and I'll come back to you personally — usually within a day or two.</p>
                <p style="margin-top:20px">Nothing needed from you in the meantime. If it's urgent, just reply to this email and it comes straight to me.</p>
                <p style="margin-top:24px">— Daniel</p>
                <hr style="border:0;border-top:1px solid #e5e5e5;margin:22px 0" />
                <p style="font-size:13px;color:#666;margin:0 0 6px"><strong>What you sent:</strong></p>
                <p style="font-size:13px;color:#666;white-space:pre-wrap;margin:0">${escapeHtml(value.message)}</p>
              </div>
            `,
          }),
        });
      } catch (error) {
        // Their confirmation is a courtesy. Daniel already has the
        // enquiry, so this never fails the request.
        console.error("[contact] auto-reply failed", { id }, error);
      }
    } else {
      console.info("[contact] auto-reply skipped — test sender cannot reach third parties", {
        id,
        from,
      });
    }

    return NextResponse.json({ ok: true, delivered: true }, { status: 200 });
  } catch (error) {
    console.error("[contact] delivery threw", { id, stored }, error);
    await markDelivery(id, {
      delivered: false,
      error: error instanceof Error ? error.message : "unknown",
    });
    return stored
      ? NextResponse.json({ ok: true, delivered: false }, { status: 200 })
      : NextResponse.json(
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
