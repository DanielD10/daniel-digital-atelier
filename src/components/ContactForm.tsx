"use client";

import { useState, type FormEvent } from "react";
import { validateContact, LIMITS, type FieldErrors } from "@/lib/contact-schema";

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent" }
  | { state: "error"; message: string };

export default function ContactForm() {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [errors, setErrors] = useState<FieldErrors>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    // Validate on the client using the same rules the server uses,
    // so the common case never costs a round trip.
    const check = validateContact(data);
    if (!check.ok) {
      setErrors(check.errors);
      setStatus({ state: "idle" });
      return;
    }

    setErrors({});
    setStatus({ state: "sending" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(check.value),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        errors?: FieldErrors;
      };

      if (response.status === 429) {
        setStatus({
          state: "error",
          message: "Too many messages in a short window. Try again in a minute.",
        });
        return;
      }

      if (!response.ok) {
        if (body.errors) setErrors(body.errors);
        setStatus({
          state: "error",
          message: body.error ?? "That didn't send. Try again, or email me directly.",
        });
        return;
      }

      form.reset();
      setStatus({ state: "sent" });
    } catch {
      setStatus({
        state: "error",
        message: "No connection to the server. Check your network and try again.",
      });
    }
  }

  const sending = status.state === "sending";

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="field" data-invalid={Boolean(errors.name)}>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          maxLength={LIMITS.name.max}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          required
        />
        {errors.name ? (
          <span className="field-error" id="name-error">
            {errors.name}
          </span>
        ) : null}
      </div>

      <div className="field" data-invalid={Boolean(errors.email)}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={LIMITS.email.max}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          required
        />
        {errors.email ? (
          <span className="field-error" id="email-error">
            {errors.email}
          </span>
        ) : null}
      </div>

      <div className="field" data-invalid={Boolean(errors.message)}>
        <label htmlFor="message">What are you building?</label>
        <textarea
          id="message"
          name="message"
          maxLength={LIMITS.message.max}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "message-error" : undefined}
          required
        />
        {errors.message ? (
          <span className="field-error" id="message-error">
            {errors.message}
          </span>
        ) : null}
      </div>

      {/* Honeypot. Hidden from people, irresistible to bots. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button className="submit" type="submit" disabled={sending}>
        {sending ? "Sending…" : "Send message"}
      </button>

      <p className="form-status" role="status" aria-live="polite">
        {status.state === "sent" ? (
          <span data-tone="ok">Message sent. I&rsquo;ll get back to you within a day or two.</span>
        ) : null}
        {status.state === "error" ? <span data-tone="error">{status.message}</span> : null}
      </p>
    </form>
  );
}
