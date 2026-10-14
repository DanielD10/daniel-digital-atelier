"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
 * The retro set's dial. Star67, which is confirmed working on
 * Daniel's phone — so it is left exactly as it was.
 *
 * Worth recording why it nearly was not: its channel is
 * "Drake - Topic", an auto-generated licensed-music upload, and
 * on the strength of the big screen failing I had assumed that
 * class of upload would not play in a frame on a phone. It
 * plays. That assumption was wrong, and the fact that this set
 * works on the same phone, on the same network, through the
 * same component and the same URL builder as the one that
 * fails is the most useful evidence there is: the code path is
 * fine and the variable is the video.
 */
const STATIONS: Station[] = [
  { name: "Star67", id: "8RFbYtOet4g" },
];

/**
 * Films for the big screen.
 *
 * Two dials, not one list with a starting position.
 *
 * A desktop gets The Outsiders and nothing else. It is the film
 * that was asked for, it plays there, and with a single entry
 * there is no skip button to wander off it and no queue handed
 * to the player either — it cannot end up showing anything
 * else.
 *
 * A phone gets the rest, because The Outsiders is a YouTube
 * Movies catalogue title and that licence does not reach an
 * embedded player on mobile web. Nothing on this side changes
 * that, so rather than opening on an error card a phone opens
 * on the Halloween trailer and can skip through the others.
 *
 * Every id was checked against
 *   https://www.youtube.com/oembed?url=<watch url>&format=json
 * before being added. A 401 or 404 means it will not embed
 * anywhere; an author of "YouTube Movies", or anything ending
 * "- Topic", means it will not play on a phone.
 */
export const FILMS: Station[] = [
  // Checked: author "YouTube Movies" — hence desktop only.
  { name: "The Outsiders", id: "iOQisO0KAzM", where: "desktop" },

  // Checked: author "CineLife", a distributor.
  { name: "Halloween (1978) — trailer", id: "FXKnfIF9w5o", where: "mobile" },
  // Checked: author "Warner Bros. Entertainment" — the rights
  // holder's own upload, which is as safe as an embed gets.
  { name: "Nightmare on Elm Street — 4K trailer", id: "CBcVZcornjI", where: "mobile" },
  // Checked: author "Park Circus".
  { name: "Labyrinth — 4K trailer", id: "8bJy0GF2RZ0", where: "mobile" },
  // Full features, public domain, all checked.
  { name: "Carnival of Souls", id: "jW_DftBegZs", where: "mobile" },
  { name: "House on Haunted Hill", id: "IBFRRZ6TsPk", where: "mobile" },
  { name: "A Star Is Born", id: "4h2s1elEYMQ", where: "mobile" },
  { name: "Of Human Bondage", id: "hQQDMVOsR74", where: "mobile" },
  { name: "The Outlaw", id: "tGNCxaHzkXg", where: "mobile" },
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
type Stored = {
  kind: "video" | "list";
  id: string;
  pinned?: boolean;
  /**
   * Which kind of device pinned it.
   *
   * A pin is a deliberate choice and it should survive a change
   * of default — that is the whole reason it exists. But it must
   * not survive a change of *device*, and it did: pressing skip
   * once on a desktop wrote a pin that then overrode the default
   * forever, and a pin made on a phone did the same in reverse.
   * A phone and a desktop do not start in the same place here,
   * so a pin only counts if it was made on the same sort of
   * device that is now reading it.
   *
   * Older pins have no value here at all, which reads as a
   * mismatch and quietly drops them — so anyone already stuck
   * on one is unstuck by their next load rather than having to
   * know to clear it.
   */
  touch?: boolean;
  /**
   * How it got pinned.
   *
   * "dial" means it was chosen off this device's own list of
   * channels, so it is only valid while it is still on that
   * list — take a channel off the dial and the pin dies with
   * it. "paste" means somebody typed a link in, which belongs
   * to them and is kept whatever the dial says.
   *
   * Without this distinction the staleness check cannot work:
   * an attempt to keep pasted links by exempting anything "not
   * on the dial" exempts every stale dial pin too, which is
   * precisely how a desktop stayed stuck on a trailer meant
   * for phones. Older pins have no value here and are read as
   * "dial", which is the safe way round — the worst case is a
   * pasted link forgotten once.
   */
  via?: "dial" | "paste";
};

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

/**
 * One entry on a dial.
 *
 * `where` restricts it to one kind of device. The two sets are
 * genuinely different — a desktop shows one film and nothing
 * else, a phone shows the things that will actually play on a
 * phone — so this is a filter rather than a starting position.
 * An entry with no `where` appears on both.
 */
export type Station = {
  name: string;
  id: string;
  where?: "desktop" | "mobile";
};

/** A phone or a tablet: no hover, and a finger rather than a pointer. */
function isTouch(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(hover: none) and (pointer: coarse)").matches);
}

function watchUrl(t: NonNullable<Tuned>): string {
  return t.kind === "list"
    ? `https://www.youtube.com/playlist?list=${t.id}`
    : `https://www.youtube.com/watch?v=${t.id}`;
}

function embedUrl(t: NonNullable<Tuned>, dial: Station[]): string {
  const touch = isTouch();
  /* nocookie on a desktop, the ordinary domain on anything with
     a finger.
     The privacy win is real and worth keeping where it works,
     but youtube-nocookie.com is a different origin from
     youtube.com, and a phone blocks third-party storage by
     default — iOS does it to everyone, and an app's built-in
     browser partitions it further. The player gets far enough
     to show its poster from cache and then fails the moment
     the media request needs a session it cannot store, which
     looks exactly like "it loads, then errors when I press
     play". This used to switch only for in-app browsers, so
     plain mobile Safari and Chrome on iOS still got nocookie
     and still broke. */
  const base = touch || inAppBrowser()
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
  stations?: Array<Station>;
  hint?: string;
  kicker?: string;
}) {
  /* The entries this device is allowed to see. Everything
     below works from this rather than the full list, so skip
     cannot walk onto another device's channels and the player
     is never handed them as a queue either. */
  const dialList = useMemo(
    () =>
      stations.filter(
        (x) => !x.where || x.where === (isTouch() ? "mobile" : "desktop"),
      ),
    [stations],
  );

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

  useEffect(() => setWebview(inAppBrowser() || isTouch()), []);

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
    /* A phone starts on whichever entry is flagged for it, if
       there is one. Not a different dial — the same one, opened
       at a different page, so skip still walks the whole list
       and a desktop still starts where it always did. */
    const fallback: Tuned = dialList.length
      ? { kind: "video", id: dialList[0].id }
      : null;
    /* A pin only survives if it was made on this kind of device
       AND the thing it points at is still on this device's
       dial. Without the second half, a channel that has since
       been taken off the dial goes on playing forever for
       anyone who ever pressed skip onto it — which is exactly
       how a desktop ended up stuck on a trailer meant for
       phones. A pasted link is kept either way: it is not on
       the dial by definition. */
    const sameDevice = saved?.pinned === true && saved.touch === isTouch();
    const stillThere = saved ? dialList.some((x) => x.id === saved.id) : false;
    const mine = sameDevice && (saved?.via === "paste" || stillThere);
    setTuned(mine && saved ? { kind: saved.kind, id: saved.id } : fallback);
    // Only on mount: re-reading storage later would fight the
    // set's own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = (dir: 1 | -1) => {
    if (!dialList.length) return;
    const here = tuned && tuned.kind === "video" ? dialList.findIndex((x) => x.id === tuned.id) : -1;
    const next = dialList[(Math.max(0, here) + dir + dialList.length) % dialList.length];
    const t: Tuned = { kind: "video", id: next.id };
    setTuned(t);
    try {
      window.localStorage.setItem(
        storeKey,
        JSON.stringify({ ...t, pinned: true, touch: isTouch(), via: "dial" } satisfies Stored),
      );
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
      window.localStorage.setItem(
        storeKey,
        JSON.stringify({ ...next, pinned: true, touch: isTouch(), via: "paste" } satisfies Stored),
      );
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
  const dial = dialList.length;

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
          src={embedUrl(tuned, dialList)}
          title="Television"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
          allowFullScreen
        />
        {/* The escape hatch.
            Three kinds of video refuse to play in an embed and
            no parameter changes any of them: age-restricted
            ones, ones whose uploader turned embedding off, and
            anything from YouTube's own Movies catalogue, which
            needs an entitled signed-in session that a phone
            will not hand to a third-party frame. The last one
            is the confusing case, because it loads its poster
            and its title happily and only fails on play. So
            name it, rather than leaving a grey rectangle. */}
        {signal === "error" ? (
          <div className="tv-fail">
            <p>
              This one will not play in an embed. Films from YouTube&rsquo;s
              Movies shelf only play on YouTube itself.
            </p>
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
        {dialList.length ? (
          <ul className="tv-dial">
            {dialList.map((c) => (
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
