import { NextResponse } from "next/server";
import { digestHtml, digestSubject, digestText } from "@/lib/nexus/digest";
import { dueDigests, markSent } from "@/lib/nexus/store";
import { site } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The sender. Woken by cron once a day; sends whatever is due.
 *
 * Daily rather than weekly or monthly, because the cadence belongs to
 * each subscriber rather than to the schedule — a run simply asks the
 * database what has come due since it last looked. That also means a
 * missed run catches up by itself rather than skipping a month.
 */
export async function GET(req: Request) {
  // Vercel signs its cron calls; anything else must present the secret.
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const fromVercelCron = req.headers.get("x-vercel-cron") !== null;
  if (!fromVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const secret = process.env.NEXUS_DIGEST_SECRET;
  if (!secret) {
    console.error("[nexus] digest secret missing");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const apiKey = process.env.RESEND_TOKEN ?? process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json({ error: "No sender configured." }, { status: 503 });
  }

  const due = await dueDigests(secret);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://danielduranatelier.com";

  let sent = 0;
  const failed: string[] = [];

  for (const w of due) {
    const input = {
      datasetName: w.datasetName,
      findings: w.findings,
      quality: w.quality,
      rowCount: w.rowCount,
      runAt: w.runAt,
      lastSentAt: w.lastSentAt,
      cadence: w.cadence,
      panelUrl: `${base}/work/nexus`,
      unsubscribeUrl: `${base}/work/nexus?stop=${encodeURIComponent(w.datasetName)}`,
    };

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${site.name} <${from}>`,
          to: [w.email],
          subject: digestSubject(input),
          html: digestHtml(input),
          text: digestText(input),
        }),
        cache: "no-store",
      });

      if (!res.ok) {
        failed.push(`${w.watchId}:${res.status}`);
        continue;
      }
      // Only move the schedule on once it has actually gone out,
      // so a delivery failure retries tomorrow rather than being lost.
      await markSent(secret, w.watchId);
      sent++;
    } catch (err) {
      console.error("[nexus] digest send threw", err);
      failed.push(`${w.watchId}:threw`);
    }
  }

  return NextResponse.json({ due: due.length, sent, failed });
}
