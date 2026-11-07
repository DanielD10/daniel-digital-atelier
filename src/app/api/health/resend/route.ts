import { NextResponse } from "next/server";

/**
 * GET /api/health/resend
 *
 * Temporary. Asks Resend a question the contact form cannot: is this
 * credential accepted at all?
 *
 * Sending has been failing with 401 "API key is invalid" using a key
 * that demonstrably exists on the account and arrives at the function
 * complete and untruncated. Every explanation left — wrong account,
 * wrong key format, a key that is real but not usable as a bearer
 * token — looks identical from inside the contact route, which only
 * ever talks to /emails. This hits /domains instead, a read-only
 * endpoint, so the answer is about authentication alone with nothing
 * else in the way.
 *
 * It reveals the key's first seven characters and its length, never
 * the key. Delete this route once the cause is known.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.RESEND_TOKEN ?? process.env.RESEND_API_KEY;
  const source = process.env.RESEND_TOKEN ? "RESEND_TOKEN" : "RESEND_API_KEY";

  if (!key) {
    return NextResponse.json({ ok: false, problem: "no key in the environment" });
  }

  const base = {
    keySource: source,
    keyPrefix: key.slice(0, 7),
    keyLength: key.length,
    // A key pasted with a stray space or newline looks fine in a
    // dashboard and fails every request. Worth ruling out explicitly.
    hasWhitespace: /\s/.test(key),
    startsCorrectly: key.startsWith("re_"),
    from: process.env.CONTACT_FROM_EMAIL ?? null,
  };

  /* Send, rather than read.
     The first version of this asked /domains and got back "This API
     key is restricted to only send emails" — which is the key working
     exactly as scoped, and a useless question to have asked. The only
     test that settles it is the one the contact form actually makes:
     a real send, same from, same key. */
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Portfolio <${process.env.CONTACT_FROM_EMAIL}>`,
        to: [process.env.CONTACT_TO_EMAIL],
        subject: "Contact form — delivery confirmed",
        text: "If this arrived, the contact form works. Sent by the health probe using the same key, sender and endpoint the form uses. This route can now be deleted.",
      }),
    });
    const body = await response.text();

    return NextResponse.json({
      ...base,
      resendStatus: response.status,
      verdict:
        response.status === 200
          ? "SENDS — the contact form works"
          : `send refused (${response.status})`,
      // Truncated: enough to read the error, not enough to dump data.
      resendBody: body.slice(0, 300),
    });
  } catch (error) {
    return NextResponse.json({
      ...base,
      problem: "could not reach Resend at all",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
