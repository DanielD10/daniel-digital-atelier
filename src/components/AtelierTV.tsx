"use client";

import { useEffect, useRef, useState } from "react";

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

const DEFAULT_STORE = "atelier.tv";

/**
 * What the set is tuned to when nobody has touched it.
 *
 * Daniel's link carried a `list=RD…` id, which is a YouTube Mix —
 * those are generated per viewer and YouTube will not serve them
 * to an embed, so passing it through would have produced an error
 * screen rather than a channel. The video id from the same link
 * plays fine, so that is the default.
 *
 * STATIONS is the dial. Add ids to it and the skip buttons walk
 * them; the player's own controls handle scrubbing within a
 * track.
 */
const STATIONS: Array<{ name: string; id: string }> = [
  { name: "Star67", id: "8RFbYtOet4g" },
];

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

function embedUrl(t: NonNullable<Tuned>, dial: Array<{ name: string; id: string }>): string {
  // nocookie, because a television in someone's portfolio has no
  // business setting tracking cookies on their visitors.
  const base = "https://www.youtube-nocookie.com/embed";
  const common = "autoplay=1&rel=0&modestbranding=1&playsinline=1";
  if (t.kind === "list") return `${base}/videoseries?list=${t.id}&${common}`;

  /* Handing the player the whole dial as `playlist` gives its own
     next/previous buttons something to move between, on top of
     the ones in the cabinet below. */
  const rest = dial.filter((x) => x.id !== t.id).map((x) => x.id);
  const queue = rest.length ? `&playlist=${rest.join(",")}` : "";
  return `${base}/${t.id}?${common}${queue}`;
}

export type TVApi = { step: (dir: 1 | -1) => void; retune: () => void; tuned: boolean };

/**
 * The set's controls do not live in the set.
 *
 * The picture is a CSS3D element so that it sits on the wall at
 * the right angle, and a CSS3D element at this scale paints
 * correctly but hit-tests somewhere else — buttons inside it
 * cannot be pressed. So the transport is handed up to the room,
 * which draws it as a flat chip over the stage.
 *
 * The same applies to YouTube's own controls, which are inside
 * the same element and equally unreachable. That is why the
 * player is started with autoplay rather than waiting to be
 * pressed.
 */
export default function AtelierTV({
  onApi,
  storeKey = DEFAULT_STORE,
  stations = STATIONS,
  hint = "Paste a YouTube link",
  kicker = "No signal",
}: {
  onApi?: (api: TVApi | null) => void;
  /** Each set remembers what it was last tuned to, separately. */
  storeKey?: string;
  /** Preset channels. The big set starts with none — it is for
   *  whatever long thing you want to put on. */
  stations?: Array<{ name: string; id: string }>;
  hint?: string;
  kicker?: string;
}) {
  const [tuned, setTuned] = useState<Tuned>(null);
  const [entry, setEntry] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    let saved: Tuned = null;
    try {
      const raw = window.localStorage.getItem(storeKey);
      if (raw) saved = JSON.parse(raw) as Tuned;
    } catch {
      /* no storage — the set still works for this sitting */
    }
    // A set with no presets waits to be tuned rather than
    // guessing something to play.
    setTuned(saved ?? (stations.length ? { kind: "video", id: stations[0].id } : null));
    // Only on mount: re-reading storage later would fight the
    // set's own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = (dir: 1 | -1) => {
    if (!stations.length) return;
    const here = tuned && tuned.kind === "video" ? stations.findIndex((x) => x.id === tuned.id) : -1;
    const next = stations[(Math.max(0, here) + dir + stations.length) % stations.length];
    const t: Tuned = { kind: "video", id: next.id };
    setTuned(t);
    try {
      window.localStorage.setItem(storeKey, JSON.stringify(t));
    } catch {
      /* ignore */
    }
  };

  const retune = () => {
    setTuned(null);
    try {
      window.localStorage.removeItem(storeKey);
    } catch {
      /* ignore */
    }
  };

  const tune = (raw: string) => {
    const next = parseYouTube(raw);
    if (!next) {
      setBad(true);
      return;
    }
    setBad(false);
    setTuned(next);
    try {
      window.localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  /* The room needs stable handlers, and it needs to know whether
     the set is showing a picture or the tuning panel. */
  const apiRef = useRef<((a: TVApi | null) => void) | undefined>(onApi);
  apiRef.current = onApi;
  const stepRef = useRef(step);
  stepRef.current = step;
  const retuneRef = useRef(retune);
  retuneRef.current = retune;
  const isTuned = Boolean(tuned);

  useEffect(() => {
    apiRef.current?.({
      step: (d) => stepRef.current(d),
      retune: () => retuneRef.current(),
      tuned: isTuned,
    });
    return () => apiRef.current?.(null);
  }, [isTuned]);

  if (tuned) {
    return (
      <div className="tv-set">
        <iframe
          key={`${tuned.kind}-${tuned.id}`}
          src={embedUrl(tuned, stations)}
          title="Television"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="tv-tune">
      <p className="tv-static" aria-hidden="true" />
      <div className="tv-panel">
        <p className="tv-kicker">{kicker}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            tune(entry);
          }}
        >
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder={hint}
            spellCheck={false}
            aria-label="YouTube link"
          />
          <button type="submit">Tune</button>
        </form>
        {bad ? <p className="tv-bad">That is not a YouTube link.</p> : null}
        {/* The one failure that looks like a bug and is not.
            YouTube refuses to play age-restricted videos in any
            embed, anywhere — it wants you signed in on its own
            site — so the player comes up with a notice instead
            of a picture and there is nothing this end can do
            about it. */}
        <p className="tv-foot">Age-restricted videos will not play in an embed.</p>
        {stations.length ? (
          <ul className="tv-dial">
            {stations.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => tune(c.id)}>
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
