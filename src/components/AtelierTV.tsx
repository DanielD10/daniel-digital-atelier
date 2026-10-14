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
 * What gets written to storage.
 *
 * `pinned` is the whole point. Without it a set remembers the
 * first thing it ever showed — including a default that has
 * since been changed — and there is no way to push a new one to
 * anybody who has already loaded the page once. Only a
 * deliberate tune pins; otherwise the set follows whatever the
 * current default is.
 */
type Stored = { kind: "video" | "list"; id: string; pinned?: boolean };

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

/**
 * An in-app browser: Instagram, Facebook, TikTok, Threads.
 *
 * These are WKWebViews with the host app's user agent bolted on,
 * and YouTube treats them differently from a real browser —
 * partitioned storage, no sign-in, and for a good share of
 * videos a flat "An error occurred (Playback ID: …)" instead of
 * a picture. Nothing on this side fixes that; the only honest
 * answer is to notice and offer the way out.
 */
function inAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\b(Instagram|FBAN|FBAV|FB_IAB|Threads|TikTok|Line\/|Snapchat)\b/i.test(
    navigator.userAgent,
  );
}

function watchUrl(t: NonNullable<Tuned>): string {
  return t.kind === "list"
    ? `https://www.youtube.com/playlist?list=${t.id}`
    : `https://www.youtube.com/watch?v=${t.id}`;
}

function embedUrl(t: NonNullable<Tuned>, dial: Array<{ name: string; id: string }>): string {
  /* nocookie, because a television in someone's portfolio has no
     business setting tracking cookies on their visitors — except
     inside an in-app browser, where the nocookie domain is one
     more partitioned origin for the webview to refuse and the
     normal one is measurably more likely to play. */
  const base = inAppBrowser()
    ? "https://www.youtube.com/embed"
    : "https://www.youtube-nocookie.com/embed";
  /* enablejsapi, so the player posts its state back and a
     playback failure can be caught rather than left as a grey
     rectangle. origin is required alongside it. */
  const origin =
    typeof window !== "undefined" ? `&origin=${encodeURIComponent(window.location.origin)}` : "";
  /* Autoplay only where it can actually happen.
   *
   * A phone will not start a video with sound without a gesture
   * on the player itself, and a gesture somewhere else on the
   * page does not carry. Asking anyway buys nothing and leaves
   * the player sitting in a denied-autoplay state; without it
   * the player simply shows its poster and its own play button,
   * which is the thing a phone is waiting to be tapped. */
  const touch =
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;
  const auto = touch ? "" : "autoplay=1&";
  const common = `${auto}rel=0&modestbranding=1&playsinline=1&enablejsapi=1${origin}`;
  if (t.kind === "list") return `${base}/videoseries?list=${t.id}&${common}`;

  /* Handing the player the whole dial as `playlist` gives its own
     next/previous buttons something to move between, on top of
     the ones in the cabinet below. */
  const rest = dial.filter((x) => x.id !== t.id).map((x) => x.id);
  const queue = rest.length ? `&playlist=${rest.join(",")}` : "";
  return `${base}/${t.id}?${common}${queue}`;
}

export type TVApi = {
  /** Walk the dial. No-op when there is only one station. */
  step: (dir: 1 | -1) => void;
  /** Back to the tuning panel. */
  retune: () => void;
  /** Jump by a number of seconds, positive or negative. */
  seek: (delta: number) => void;
  /** Back to the beginning. */
  restart: () => void;
  /** Play if paused, pause if playing. */
  toggle: () => void;
  tuned: boolean;
  /** True once the player has reported a position, which is
   *  when seeking is meaningful and not before. */
  canSeek: boolean;
  playing: boolean;
  /** How many presets there are, so the room knows whether to
   *  draw the skip buttons at all. */
  dial: number;
};

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
  /* Null until the player says something. "error" once YouTube
     reports one, "ok" once it reports anything else. */
  const [signal, setSignal] = useState<null | "error" | "ok">(null);
  const [webview, setWebview] = useState(false);
  /* What the player has told us about itself. YouTube's state
     codes: 1 is playing, 2 is paused. */
  const [playing, setPlaying] = useState(true);
  const [canSeek, setCanSeek] = useState(false);
  const atRef = useRef(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => setWebview(inAppBrowser()), []);

  /**
   * Talk to the player.
   *
   * With `enablejsapi` the embed accepts commands as posted JSON
   * — the same channel the official iframe API uses underneath,
   * without the 60kB of script it loads to do it. Everything the
   * transport does goes through here.
   */
  const cmd = (func: string, args: unknown[] = []) => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    } catch {
      /* the frame is cross-origin and may be mid-navigation */
    }
  };

  /* Listen to the player.
   *
   * With enablejsapi the embed posts JSON back on every state
   * change, including `onError`. Without this the failure is
   * invisible to us: the iframe loads fine, YouTube paints its
   * own apology inside it, and as far as the page is concerned
   * the television is working. */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname.replace(/^www\./, ""))) {
        return;
      }
      let data: unknown = e.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const d = data as {
        event?: string;
        info?: { currentTime?: number; playerState?: number };
      } | null;
      const ev = d?.event;
      if (ev === "onError") setSignal("error");
      else if (ev === "onReady" || ev === "onStateChange" || ev === "infoDelivery") {
        setSignal((prev) => (prev === "error" ? prev : "ok"));
      }
      /* Position and state arrive on `infoDelivery`, which the
         player only sends once it has been asked to listen —
         see the effect below. Until the first one lands there
         is no sensible answer to "seek thirty seconds from
         where?", so the seek buttons stay disabled. */
      const info = d?.info;
      if (info && typeof info.currentTime === "number") {
        atRef.current = info.currentTime;
        setCanSeek(true);
      }
      if (info && typeof info.playerState === "number") {
        setPlaying(info.playerState === 1);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* Ask the player to report. It says nothing until told to,
     and it may not be ready the instant the iframe mounts, so
     this keeps asking for a few seconds and then stops. */
  useEffect(() => {
    if (!tuned) return;
    setCanSeek(false);
    atRef.current = 0;
    let n = 0;
    const ping = () => {
      const win = frameRef.current?.contentWindow;
      try {
        win?.postMessage(
          JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
          "*",
        );
      } catch {
        /* ignore */
      }
    };
    ping();
    const id = window.setInterval(() => {
      ping();
      if (++n > 12) window.clearInterval(id);
    }, 700);
    return () => window.clearInterval(id);
  }, [tuned?.kind, tuned?.id]);

  // A fresh channel deserves a fresh verdict.
  useEffect(() => setSignal(null), [tuned?.id]);

  useEffect(() => {
    let saved: Stored | null = null;
    try {
      const raw = window.localStorage.getItem(storeKey);
      if (raw) saved = JSON.parse(raw) as Stored;
    } catch {
      /* no storage — the set still works for this sitting */
    }
    /* Only a channel somebody chose survives a change of
       default. A set with no presets and nothing pinned waits
       to be tuned rather than guessing something to play. */
    const fallback: Tuned = stations.length ? { kind: "video", id: stations[0].id } : null;
    setTuned(saved?.pinned ? { kind: saved.kind, id: saved.id } : fallback);
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
      window.localStorage.setItem(storeKey, JSON.stringify({ ...t, pinned: true } satisfies Stored));
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
      window.localStorage.setItem(storeKey, JSON.stringify({ ...next, pinned: true } satisfies Stored));
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
  const cmdRef = useRef(cmd);
  cmdRef.current = cmd;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const isTuned = Boolean(tuned);
  const dial = stations.length;

  /* Republished whenever something the room draws from it
     changes — whether there is a picture, whether seeking is
     possible yet, and whether it is playing — because those
     decide which buttons the room shows and how they look. The
     handlers themselves stay stable behind refs. */
  useEffect(() => {
    apiRef.current?.({
      step: (d) => stepRef.current(d),
      retune: () => retuneRef.current(),
      seek: (delta) => {
        const to = Math.max(0, atRef.current + delta);
        atRef.current = to;
        cmdRef.current("seekTo", [to, true]);
      },
      restart: () => {
        atRef.current = 0;
        cmdRef.current("seekTo", [0, true]);
        cmdRef.current("playVideo");
      },
      toggle: () => {
        const next = !playingRef.current;
        setPlaying(next);
        cmdRef.current(next ? "playVideo" : "pauseVideo");
      },
      tuned: isTuned,
      canSeek,
      playing,
      dial,
    });
    return () => apiRef.current?.(null);
  }, [isTuned, canSeek, playing, dial]);

  if (tuned) {
    const out = watchUrl(tuned);
    return (
      <div className="tv-set">
        <iframe
          ref={frameRef}
          key={`${tuned.kind}-${tuned.id}`}
          src={embedUrl(tuned, stations)}
          title="Television"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
          allowFullScreen
        />
        {/* The escape hatch.
            YouTube refuses plenty of videos inside an embed —
            age-restricted ones everywhere, and a much wider set
            inside an app's built-in browser. When the player
            reports a failure, say so in plain words and hand
            over a link that opens on YouTube proper, where it
            will play. */}
        {signal === "error" ? (
          <div className="tv-fail">
            <p>This one will not play inside an embed.</p>
            <a href={out} target="_blank" rel="noopener noreferrer">
              Watch it on YouTube
            </a>
            <button type="button" onClick={() => setSignal(null)}>
              Try again
            </button>
          </div>
        ) : null}
        {signal !== "error" && webview ? (
          <a className="tv-escape" href={out} target="_blank" rel="noopener noreferrer">
            Open on YouTube
          </a>
        ) : null}
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
