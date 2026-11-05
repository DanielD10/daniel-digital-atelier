/**
 * Durable record of every enquiry.
 *
 * Email is how an enquiry reaches Daniel; it is not where it lives.
 * Resend can reject a message, a mailbox can bounce, Gmail can file
 * it under Promotions and he can miss it for a week. None of that
 * should mean a stranger wrote to him and nobody ever knew.
 *
 * So the message is written down first and emailed second. If the
 * send fails the row is still there, flagged, waiting for a human.
 *
 * PostgREST over plain fetch, no SDK — the same call the contact
 * route already makes to Resend, and for the same reason: nothing
 * extra in the dependency tree that can break a build.
 *
 * The key here is the anon key, and it is deliberately not the
 * service role. Its entire reach is INSERT on this one table plus
 * three outcome columns: no select, no delete, no truncate. Leaked,
 * the worst it buys is a junk row.
 */

export type EnquiryRecord = {
  id: string;
  name: string;
  email: string;
  message: string;
  userAgent: string | null;
};

type Creds = { url: string; key: string };

function creds(): Creds | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    // Nothing comes back. There is no select privilege to return it
    // with, and the route already knows the id it generated.
    Prefer: "return=minimal",
  };
}

/**
 * Write the enquiry down. Returns false if it could not be stored —
 * the caller still tries to email, because a message that arrives
 * unrecorded beats a message that does neither.
 */
export async function recordEnquiry(entry: EnquiryRecord): Promise<boolean> {
  const c = creds();
  if (!c) {
    console.error("[contact] store not configured — enquiry is email-only", {
      id: entry.id,
    });
    return false;
  }

  try {
    const response = await fetch(`${c.url}/rest/v1/enquiries`, {
      method: "POST",
      headers: headers(c.key),
      body: JSON.stringify({
        id: entry.id,
        name: entry.name,
        email: entry.email,
        message: entry.message,
        user_agent: entry.userAgent,
        source: "portfolio",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[contact] store rejected the enquiry", response.status, detail);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[contact] store threw", error);
    return false;
  }
}

/**
 * Record how the send went, on a row that has not been marked yet.
 *
 * Best effort by design: the enquiry is already safe by the time
 * this runs, so a failure here costs a status flag, not a message.
 * It still logs, because a row stuck at null means the flag is
 * lying by omission rather than telling the truth.
 */
export async function markDelivery(
  id: string,
  outcome: { delivered: boolean; error?: string; resendId?: string },
): Promise<void> {
  const c = creds();
  if (!c) return;

  try {
    const response = await fetch(
      `${c.url}/rest/v1/enquiries?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: headers(c.key),
        body: JSON.stringify({
          delivered: outcome.delivered,
          delivery_error: outcome.error ?? null,
          resend_id: outcome.resendId ?? null,
        }),
      },
    );
    if (!response.ok) {
      console.error("[contact] could not mark delivery", id, response.status);
    }
  } catch (error) {
    console.error("[contact] marking delivery threw", id, error);
  }
}
