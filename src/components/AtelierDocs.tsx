"use client";

import { useEffect, useState } from "react";

/**
 * Docs.
 *
 * The Google Docs editor cannot be embedded — by anyone, in any
 * site. docs.google.com answers with `X-Frame-Options: DENY`, so
 * the browser refuses the frame before a line of our code runs.
 * There is no key, no parameter and no proxy that changes that,
 * and a proxy that stripped the header would be stripping a
 * security control off somebody's private documents.
 *
 * What Google does allow is a document the author has published:
 * File → Share → Publish to web gives a /pub URL that is meant
 * to be framed. Read-only, which is the honest trade — it is a
 * published document, not a word processor.
 *
 * So this does both. Paste a published link and it opens in the
 * room. Or write here instead: the pad keeps what you type in
 * this browser, which is a real editor even if it is not
 * Google's.
 */

const STORE = "atelier.docs";
const PUB = /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/e\/[\w-]+\/pub/i;
const EDITOR = /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/(?!e\/)/i;

type Saved = { url: string; pad: string };

export default function AtelierDocs() {
  const [url, setUrl] = useState("");
  const [entry, setEntry] = useState("");
  const [pad, setPad] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        setUrl(s.url ?? "");
        setPad(s.pad ?? "");
      }
    } catch {
      /* no storage — it still works for this sitting */
    }
  }, []);

  const save = (next: Partial<Saved>) => {
    try {
      window.localStorage.setItem(
        STORE,
        JSON.stringify({ url, pad, ...next } satisfies Saved),
      );
    } catch {
      /* ignore */
    }
  };

  const openDoc = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    if (EDITOR.test(s)) {
      setNote(
        "That is an editor link. Google blocks those from being framed by any site. In the doc: File → Share → Publish to web, then paste the link it gives you.",
      );
      return;
    }
    if (!PUB.test(s)) {
      setNote("That is not a published Google Docs link.");
      return;
    }
    setNote(null);
    setUrl(s);
    save({ url: s });
  };

  if (url) {
    return (
      <div className="doc-open">
        <div className="doc-bar">
          <button
            type="button"
            onClick={() => {
              setUrl("");
              save({ url: "" });
            }}
          >
            ‹ Docs
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open in a tab
          </a>
        </div>
        <iframe
          src={url.includes("embedded=true") ? url : `${url}${url.includes("?") ? "&" : "?"}embedded=true`}
          title="Published document"
          sandbox="allow-scripts allow-popups"
        />
      </div>
    );
  }

  return (
    <div className="doc">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          openDoc(entry);
        }}
      >
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="Paste a published Google Docs link"
          aria-label="Published Google Docs link"
          spellCheck={false}
        />
        <button type="submit">Open</button>
      </form>
      {note ? <p className="doc-note">{note}</p> : null}
      <p className="doc-hint">
        Google refuses to be framed from the normal editor URL. Publish the doc
        first — File, Share, Publish to web — and the link it hands back opens
        here.
      </p>

      <label className="doc-pad-label" htmlFor="doc-pad">
        Or just write
      </label>
      <textarea
        id="doc-pad"
        className="doc-pad"
        value={pad}
        onChange={(e) => {
          setPad(e.target.value);
          save({ pad: e.target.value });
        }}
        placeholder="Kept in this browser."
        spellCheck={false}
      />
    </div>
  );
}
