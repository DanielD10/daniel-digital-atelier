"use client";

import { useEffect, useState } from "react";

/**
 * What is on the television.
 *
 * YouTube's embed player is one of the few large things on the web
 * that is *meant* to be put inside another page, which is why the
 * set can show real video when the browser app cannot show real
 * Google. The player is theirs, served from their domain, with
 * their controls and their counts — this is embedding, not
 * copying.
 *
 * No station is hardcoded. Live-stream IDs rotate, and a baked-in
 * ID that has since gone dark is a dead screen on somebody's
 * portfolio. So the set remembers whatever was last tuned in, and
 * the presets below are filled in with links that have been
 * checked rather than guessed.
 */

type Station = { name: string; id: string };

/** Verified links go here. Empty until they have been checked. */
const STATIONS: Station[] = [];

const STORE = "atelier.tv";

/**
 * Pulls the video id out of whatever form the link arrives in —
 * watch URLs, youtu.be, /live/, /embed/, or a bare id.
 */
export function videoId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;

  let u: URL;
  try {
    u = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = u.pathname.match(/\/(?:embed|live|shorts|v)\/([\w-]{11})/);
    if (m) return m[1];
  }
  return null;
}

export default function TvScreen({ on }: { on: boolean }) {
  const [id, setId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE);
      if (saved && /^[\w-]{11}$/.test(saved)) setId(saved);
    } catch {
      /* no storage — the set still works for this visit */
    }
  }, []);

  const tune = (raw: string) => {
    const next = videoId(raw);
    if (!next) {
      setBad(true);
      return;
    }
    setBad(false);
    setId(next);
    try {
      window.localStorage.setItem(STORE, next);
    } catch {
      /* ignore */
    }
  };

  if (!on) return <div className="tv-off" />;

  if (id) {
    return (
      <div className="tv-live">
        <iframe
          key={id}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          title="Television"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <button
          type="button"
          className="tv-change"
          onClick={() => {
            setId(null);
            setDraft("");
          }}
        >
          Change channel
        </button>
      </div>
    );
  }

  return (
    <div className="tv-tune">
      <p className="tv-kicker">No signal</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          tune(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setBad(false);
          }}
          placeholder="Paste a YouTube link"
          aria-label="YouTube link"
          spellCheck={false}
        />
        <button type="submit">Tune in</button>
      </form>
      {bad ? <p className="tv-bad">That is not a YouTube link.</p> : null}
      {STATIONS.length ? (
        <ul className="tv-presets">
          {STATIONS.map((st) => (
            <li key={st.id}>
              <button type="button" onClick={() => tune(st.id)}>
                {st.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
