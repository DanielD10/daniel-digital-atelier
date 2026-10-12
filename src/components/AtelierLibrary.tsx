"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "@/app/api/library/route";

/**
 * The shelf, opened.
 *
 * Type a title, get sent somewhere you can actually read it. The
 * honesty is the whole point: each result says what the link gets
 * you — read free, or borrow free with an Archive account — and
 * nothing that needs buying is listed at all.
 */

const VERDICT: Record<Book["access"], string> = {
  read: "Read free",
  borrow: "Borrow free",
  info: "Details",
};

export default function AtelierLibrary({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<Book[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [thin, setThin] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /* Monotonic, so a slow first search cannot land on top of a
     fast second one. */
  const runRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const search = useCallback(async (term: string) => {
    const text = term.trim();
    if (text.length < 2) return;
    const run = ++runRef.current;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/library?q=${encodeURIComponent(text)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { results: Book[]; degraded?: boolean };
      if (run !== runRef.current) return;
      setBooks(data.results);
      setThin(Boolean(data.degraded));
    } catch {
      if (run !== runRef.current) return;
      setErr("The catalogue did not answer. Try again in a moment.");
      setBooks(null);
    } finally {
      if (run === runRef.current) setBusy(false);
    }
  }, []);

  return (
    <div
      className="lib-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="The reading shelf"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div className="lib-panel" ref={panelRef}>
        <header className="lib-head">
          <div>
            <p className="lib-kicker">The shelf</p>
            <h2>Find something to read</h2>
          </div>
          <button type="button" className="lib-x" onClick={onClose} aria-label="Close the shelf">
            ✕
          </button>
        </header>

        <form
          className="lib-form"
          onSubmit={(e) => {
            e.preventDefault();
            void search(q);
          }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="A title, or an author"
            aria-label="Title or author"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || q.trim().length < 2}>
            {busy ? "Looking…" : "Search"}
          </button>
        </form>

        <p className="lib-note">
          Public domain from Project Gutenberg, everything else from the Internet Archive.
          Nothing here costs money.
        </p>

        <div className="lib-body">
          {err ? <p className="lib-empty">{err}</p> : null}
          {thin && !err ? (
            <p className="lib-empty">One of the two catalogues is down, so this is a short shelf.</p>
          ) : null}
          {books && books.length === 0 && !busy ? (
            <p className="lib-empty">Nothing free under that name. Try the author instead.</p>
          ) : null}
          {books && books.length > 0 ? (
            <ul className="lib-list">
              {books.map((b) => (
                <li key={b.id}>
                  <a href={b.url} target="_blank" rel="noopener noreferrer">
                    <span className="lib-cover" aria-hidden="true">
                      {b.cover ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={b.cover} alt="" loading="lazy" decoding="async" />
                      ) : null}
                    </span>
                    <span className="lib-meta">
                      <strong>{b.title}</strong>
                      <em>
                        {b.author}
                        {b.year ? ` · ${b.year}` : ""}
                      </em>
                    </span>
                    <span className={`lib-tag is-${b.access}`}>{VERDICT[b.access]}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
