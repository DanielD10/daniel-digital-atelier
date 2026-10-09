/**
 * Hand-rolled validation. No Zod — one less dependency to break a
 * build, and the shape here is small enough that a schema library
 * would be ceremony. Shared by the API route and the client form so
 * the rules can't drift apart.
 */

export type ContactInput = {
  name: string;
  email: string;
  message: string;
  /** Honeypot. Real humans never fill this; bots usually do. */
  company?: string;
};

export type FieldErrors = Partial<Record<"name" | "email" | "message", string>>;

/**
 * Deliberately not a regex. Email regexes are either wrong or
 * unreadable, and the only real test is whether a reply arrives.
 * This rejects the obvious garbage and lets everything else through.
 */
function looksLikeEmail(value: string): boolean {
  if (value.includes(" ") || value.includes("\t")) return false;

  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;

  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  if (dot < 1) return false;

  const tld = domain.slice(dot + 1);
  return tld.length >= 2;
}

export const LIMITS = {
  name: { min: 2, max: 80 },
  email: { max: 160 },
  message: { min: 10, max: 4000 },
} as const;

export function validateContact(raw: unknown): {
  ok: boolean;
  errors: FieldErrors;
  value: ContactInput;
} {
  const input = (raw ?? {}) as Record<string, unknown>;

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const company = typeof input.company === "string" ? input.company.trim() : "";

  const errors: FieldErrors = {};

  if (name.length < LIMITS.name.min) {
    errors.name = "Enter your name.";
  } else if (name.length > LIMITS.name.max) {
    errors.name = `Keep this under ${LIMITS.name.max} characters.`;
  }

  if (!looksLikeEmail(email)) {
    errors.email = "Enter an email address I can reply to.";
  } else if (email.length > LIMITS.email.max) {
    errors.email = "That email address is too long.";
  }

  if (message.length < LIMITS.message.min) {
    errors.message = "Tell me a little more — at least a sentence.";
  } else if (message.length > LIMITS.message.max) {
    errors.message = `Keep this under ${LIMITS.message.max} characters.`;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name, email, message, company },
  };
}

/**
 * Strips the line breaks an attacker would use to inject extra mail
 * headers (Bcc, Reply-To) into the outgoing message.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.split("\n").join(" ").split("\r").join(" ").slice(0, 200);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
