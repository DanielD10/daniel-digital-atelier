"use client";

import { useState } from "react";

/**
 * Subscribe this file to a recurring digest.
 *
 * Offered only once someone has analysed their own data, because the
 * ask only makes sense after they have seen it work — and because
 * subscribing to the sample would send them the same three findings
 * every month forever.
 */
export default function WatchForm({ dataset }: { dataset: string }) {
  const [email, setEmail] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("monthly");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/nexus/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, dataset, cadence }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That didn't go through.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Couldn't reach the server.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <section className="nex-watch is-done">
        <h2 className="nex-rail-title">Watching</h2>
        <p>
          You&apos;ll get a {cadence === "weekly" ? "weekly" : "monthly"} read on{" "}
          <strong>{dataset}</strong> at {email}. Upload the file again whenever it updates and
          the next digest covers what changed.
        </p>
      </section>
    );
  }

  return (
    <form className="nex-watch" onSubmit={submit}>
      <h2 className="nex-rail-title">Keep an eye on this</h2>
      <p className="nex-rail-sub">
        Get a short read on <strong>{dataset}</strong> by email, with what moved since
        last time. Upload the file again when it updates.
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        required
        autoComplete="email"
      />
      <div className="nex-watch-cadence" role="radiogroup" aria-label="How often">
        {(["monthly", "weekly"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cadence === c}
            className={cadence === c ? "is-on" : undefined}
            onClick={() => setCadence(c)}
          >
            {c}
          </button>
        ))}
      </div>
      {error && <p className="nex-error">{error}</p>}
      <button type="submit" className="nex-btn nex-btn--wide" disabled={state === "busy"}>
        {state === "busy" ? "Setting up…" : "Email me the changes"}
      </button>
    </form>
  );
}
