"use client";

import { useState } from "react";
import { BEYOND } from "@/lib/nexus/entitlements";

/**
 * The gate, and the pitch behind it.
 *
 * Two components that do the commercial work of this page. Neither is
 * allowed to feel like a paywall dropped in front of a demo: the panel
 * is fully usable without either of them, and what they ask for is an
 * introduction rather than a payment.
 */

export function UnlockPanel({
  reason,
  datasetName,
  onUnlocked,
}: {
  reason: string;
  datasetName: string;
  onUnlocked: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/nexus/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, note, dataset: datasetName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That didn't go through.");
        return;
      }
      onUnlocked(json.name ?? name);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="nex-lock">
        <p className="nex-lock-why">{reason}</p>
        <button type="button" className="nex-btn" onClick={() => setOpen(true)}>
          Unlock the brief and Ask
        </button>
        <p className="nex-lock-foot">
          One name and an email. No account, no password, nothing to cancel.
        </p>
      </div>
    );
  }

  return (
    <form className="nex-lock is-open" onSubmit={submit}>
      <p className="nex-lock-why">{reason}</p>
      <div className="nex-lock-fields">
        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            autoComplete="name"
          />
        </label>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
      </div>
      <label className="nex-lock-note">
        <span>What are you working on? (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>
      {error && <p className="nex-error" role="alert">{error}</p>}
      <div className="nex-lock-acts">
        <button type="submit" className="nex-btn" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <button type="button" className="nex-btn nex-btn--ghost" onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
      <p className="nex-lock-foot">
        This goes straight to Daniel, and nowhere else. No list, no sequence.
      </p>
    </form>
  );
}

/**
 * What sits past the ceiling.
 *
 * Shown where a limit bites, which is the most attentive moment this
 * page gets: someone has just watched the thing work on their own data
 * and run out of room. So it describes what changes rather than what is
 * forbidden.
 */
export function Beyond({ note }: { note?: string }) {
  return (
    <aside className="nex-beyond">
      <h3>{BEYOND.heading}</h3>
      {note && <p className="nex-beyond-note">{note}</p>}
      <p>{BEYOND.body}</p>
      <ul>
        {BEYOND.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <a className="nex-btn" href="/contact">
        {BEYOND.cta} →
      </a>
    </aside>
  );
}
