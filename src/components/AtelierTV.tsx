"use client";

import { useEffect, useState } from "react";

/**
 * The television.
 *
 * YouTube is the one large site that wants to be embedded — its
 * player is built for it and sends no frame-blocking header — so
 * unlike the rest of the web this genuinely plays inside the
 * room.
 *
 * No video ID is hard-coded. Live stream IDs rotate, and a
 * hard-coded one that has since gone private is a dead grey
 * rectangle sitting in the corner of someone's portfolio. So the
 * set tunes: paste a link, it plays, and it remembers. Fill
 * CHANNELS in once you have links you want permanently on the
 * dial.
 */

const STORE = "atelier.tv";

/** Presets for the dial. Add { name, url } entries here. */
const CHANNELS: Array<{ name: string; url: string }> = [];

type Tuned = { kind: "video" | "list"; id: string } | null;

/**
 * Pull an id out of whatever got pasted.
 *
 * Accepts the share link, the watch URL, a playlist URL, an embed
 * URL, or a bare id — because people paste all of those and being
 * fussy about it is just a worse television.
 */
export function parseYouTube(raw: string): Tuned {
  const s = raw.trim();
  if (!s) return null;

  const list = s.match(/[?&]list=([A-Za-z0-9_-]{12,})/);
  if (list) return { kind: "list", id: list[1] };

  const watch = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watch) return { kind: "video", id: watch[1] };

  const short = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (short) return { kind: "video", id: short[1] };

  const embed = s.match(/\/embed\/([A-Za-z0-9_-]{11})/);
  if (embed) return { kind: "video", id: embed[1] };

  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return { kind: "video", id: s };

  return null;
}

function embedUrl(t: NonNullable<Tuned>): string {
  // nocookie, because a television in someone's portfolio has no
  // business setting tracking cookies on their visitors.
  const base = "https://www.youtube-nocookie.com/embed";
  const common = "autoplay=1&rel=0&modestbranding=1&playsinline=1";
  return t.kind === "list"
    ? `${base}/videoseries?list=${t.id}&${common}`
    : `${base}/${t.id}?${common}`;
}

export default function AtelierTV() {
  const [tuned, setTuned] = useState<Tuned>(null);
  const [entry, setEntry] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE);
      if (saved) setTuned(JSON.parse(saved) as Tuned);
    } catch {
      /* no storage — the set still works for this sitting */
    }
  }, []);

  const tune = (raw: string) => {
    const next = parseYouTube(raw);
    if (!next) {
      setBad(true);
      return;
    }
    setBad(false);
    setTuned(next);
    try {
      window.localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  if (tuned) {
    return (
      <div className="tv-set">
        <iframe
          key={`${tuned.kind}-${tuned.id}`}
          src={embedUrl(tuned)}
          title="Television"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
          allowFullScreen
        />
        <button
          type="button"
          className="tv-eject"
          onClick={() => {
            setTuned(null);
            try {
              window.localStorage.removeItem(STORE);
            } catch {
              /* ignore */
            }
          }}
        >
          Change channel
        </button>
      </div>
    );
  }

  return (
    <div className="tv-tune">
      <p className="tv-static" aria-hidden="true" />
      <div className="tv-panel">
        <p className="tv-kicker">No signal</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            tune(entry);
          }}
        >
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="Paste a YouTube link"
            spellCheck={false}
            aria-label="YouTube link"
          />
          <button type="submit">Tune</button>
        </form>
        {bad ? <p className="tv-bad">That is not a YouTube link.</p> : null}
        {CHANNELS.length ? (
          <ul className="tv-dial">
            {CHANNELS.map((c) => (
              <li key={c.url}>
                <button type="button" onClick={() => tune(c.url)}>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
