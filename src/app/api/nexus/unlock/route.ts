import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { escapeHtml, sanitizeHeaderValue } from "@/lib/contact-schema";
import { recordEnquiry, markDelivery } from "@/lib/enquiry-store";
import { site } from "@/lib/site";
import { getSession, grantAccess } from "@/lib/nexus/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unlock the model-backed features by saying who you are.
 *
 * This is the lead, so it is written through the same path as the
 * contact form: into the enquiries table first, then emailed. A Resend
 * outage costs a notification, never the lead itself — the row is
 * already down. That ordering was learned the hard way on the contact
 * form, where seven enquiries survived a full day of broken delivery.
 *
 * Access is granted whether or not the email lands. Holding someone's
 * unlock hostage to a third party's uptime would punish them for an
 * outage that is not theirs.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Body {
  name?: unknown;
  email?: unknown;
  note?: unknown;
  dataset?: unknown;
}

export async function POST(req: Request) {
  const limit = rateLimit(`nexus-unlock:${clientKey(req.headers)}`, 5);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const dataset = typeof body.dataset === "string" ? body.dataset.trim().slice(0, 160) : "";

  if (name.length < 2) {
    return NextResponse.json({ error: "A name, so I know who I'm talking to." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }

  const session = await getSession();
  const granted = await grantAccess(session, { email, name, note });

  if (!granted) {
    return NextResponse.json(
      { error: "Couldn't save that just now. Try again in a moment." },
      { status: 503 },
    );
  }

  // The lead, into the same store the contact form writes to.
  const id = crypto.randomUUID();
  const message =
    `Unlocked NEXUS.\n\n` +
    (dataset ? `Working on: ${dataset}\n` : "") +
    (note ? `\nThey said:\n${note}\n` : "") +
    `\nSession ${session}`;

  const stored = await recordEnquiry({
    id,
    name,
    email,
    message,
    userAgent: req.headers.get("user-agent"),
  });

  void notify({ id, name, email, note, dataset, stored });

  return NextResponse.json({ ok: true, tier: "identified", name });
}

/**
 * Tell Daniel, after the lead is already safe.
 *
 * Fire-and-forget on purpose: the visitor is waiting on an unlock, not
 * on an SMTP round trip, and the row is written either way.
 */
async function notify(lead: {
  id: string;
  name: string;
  email: string;
  note: string;
  dataset: string;
  stored: boolean;
}) {
  const apiKey = process.env.RESEND_TOKEN ?? process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !to || !from) return;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${site.name} <${from}>`,
        to: [to],
        reply_to: sanitizeHeaderValue(lead.email),
        subject: `NEXUS lead — ${sanitizeHeaderValue(lead.name)}`,
        html: `
          <div style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6">
            <p><strong>${escapeHtml(lead.name)}</strong> unlocked NEXUS.</p>
            <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
            ${lead.dataset ? `<p><strong>Their data:</strong> ${escapeHtml(lead.dataset)}</p>` : ""}
            ${
              lead.note
                ? `<hr style="border:0;border-top:1px solid #ddd;margin:16px 0" /><p style="white-space:pre-wrap">${escapeHtml(lead.note)}</p>`
                : ""
            }
            <p style="color:#777;font-size:13px">They came through the panel, so they've already seen it work on their own file.</p>
          </div>
        `,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { message?: string };
      console.error("[nexus] lead email rejected", res.status, detail.message, {
        id: lead.id,
        stored: lead.stored,
      });
      await markDelivery(lead.id, { delivered: false, error: detail.message ?? `resend ${res.status}` });
      return;
    }
    const sent = (await res.json().catch(() => ({}))) as { id?: string };
    await markDelivery(lead.id, { delivered: true, resendId: sent.id });
  } catch (err) {
    console.error("[nexus] lead email threw", err);
  }
}
