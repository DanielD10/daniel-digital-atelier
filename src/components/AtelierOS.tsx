"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { projects } from "@/lib/projects";
import { site } from "@/lib/site";
import {
  pauseAmbient,
  playAmbient,
  setAmbientVolume,
  useAmbient,
} from "@/lib/ambient";
import type { Phase, Season } from "@/lib/atelier-time";

/**
 * ATELIER OS — the machine on the desk.
 *
 * Not a slideshow dressed as a monitor. It boots, it has a menu bar
 * with a live clock, windows you drag and stack, a notepad that
 * still has your text next week, a player wired to the real site
 * audio, a mailer that posts to the real contact endpoint, and a
 * shell that actually parses what you type.
 *
 * Everything inside is laid out against a fixed 1000×595 desktop
 * and scaled to whatever the monitor is currently worth on screen.
 * One number, set by a ResizeObserver, and every position, drag
 * delta and font size downstream can be plain pixels.
 */

export const OS_W = 780;
export const OS_H = 464;

const MENU_H = 30;
const DOCK_H = 44;
/**
 * Windows are positioned against the desk, not the whole screen —
 * `.os-desk` is their offset parent, so a window's y of 0 is the
 * underside of the menu bar. Clamping against OS_H instead is how
 * you end up with a terminal whose prompt lives behind the dock.
 */
const DESK_H = OS_H - MENU_H - DOCK_H;

type AppId = "web" | "work" | "readme" | "notes" | "player" | "mail" | "term";

type AppDef = {
  id: AppId;
  name: string;
  /** Where it opens the first time, and how big it stays. */
  x: number;
  y: number;
  w: number;
  h: number;
};

/* Nothing opens over the icon column on the left (10–162), or the
   first thing a window does is make the desktop unreachable. */
const APPS: AppDef[] = [
  { id: "web", name: "Browser", x: 180, y: 30, w: 540, h: 344 },
  { id: "work", name: "Work", x: 204, y: 46, w: 352, h: 248 },
  { id: "readme", name: "Read me", x: 300, y: 86, w: 294, h: 212 },
  { id: "notes", name: "Notes", x: 382, y: 60, w: 274, h: 226 },
  { id: "player", name: "Player", x: 452, y: 230, w: 254, h: 142 },
  { id: "mail", name: "Mail", x: 262, y: 52, w: 312, h: 268 },
  { id: "term", name: "Terminal", x: 222, y: 110, w: 400, h: 246 },
];

const byId = (id: AppId) => APPS.find((a) => a.id === id) as AppDef;

type Win = { id: AppId; x: number; y: number; min: boolean };

/* ── Icons ─────────────────────────────────────────────────────
   Drawn rather than borrowed. Six marks, one stroke weight, so the
   desktop reads as one set instead of six downloads. */
function Icon({ id }: { id: AppId }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {id === "work" ? (
        <g {...common}>
          <path d="M3 7h7l2 2h9v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M3 11h18" />
        </g>
      ) : null}
      {id === "readme" ? (
        <g {...common}>
          <path d="M5 3h9l5 5v13H5z" />
          <path d="M14 3v5h5M8 13h8M8 17h5" />
        </g>
      ) : null}
      {id === "notes" ? (
        <g {...common}>
          <path d="M5 4h14v16H5z" />
          <path d="M8 9h8M8 13h8M8 17h4" />
        </g>
      ) : null}
      {id === "player" ? (
        <g {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 3.5v2M12 18.5v2" />
        </g>
      ) : null}
      {id === "mail" ? (
        <g {...common}>
          <path d="M3 6h18v12H3z" />
          <path d="m3 7 9 6 9-6" />
        </g>
      ) : null}
      {id === "term" ? (
        <g {...common}>
          <path d="M3 4h18v16H3z" />
          <path d="m7 9 3 3-3 3M13 15h4" />
        </g>
      ) : null}
      {id === "web" ? (
        <g {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.6 2.8 2.6 14 0 17M12 3.5c-2.6 2.8-2.6 14 0 17" />
        </g>
      ) : null}
    </svg>
  );
}

/* ── Boot ──────────────────────────────────────────────────────
   A second and a half. Long enough to feel like a machine coming
   up, short enough that nobody waits on it twice. */
const BOOT = [
  "ATELIER OS  v2.6 — creative core",
  "mounting /work ................ ok",
  "loading typefaces ............. ok",
  "calibrating colour ............ ok",
  "operator: daniel duran — san antonio, tx",
  "READY.",
];

function BootScreen({ onDone, instant }: { onDone: () => void; instant: boolean }) {
  const [line, setLine] = useState(instant ? BOOT.length : 0);

  useEffect(() => {
    if (instant) {
      onDone();
      return;
    }
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setLine(n);
      if (n >= BOOT.length) {
        window.clearInterval(id);
        window.setTimeout(onDone, 420);
      }
    }, 190);
    return () => window.clearInterval(id);
  }, [instant, onDone]);

  return (
    <div className="os-boot">
      {BOOT.slice(0, line).map((l, i) => (
        <p key={l}>
          {i === 0 ? null : <span className="os-boot-mark">&gt;</span>}
          {l}
        </p>
      ))}
      <span className="os-caret" aria-hidden="true" />
    </div>
  );
}

/* ── Browser ───────────────────────────────────────────────────
 * A working address bar, with one honest limit.
 *
 * Anything on this site loads in the pane, because the pane and
 * the site share an origin — the whole portfolio is browsable
 * from inside the desk machine, links and all.
 *
 * Anything else does not, and no amount of code changes that.
 * Google, GitHub and nearly every large site send a header
 * (`X-Frame-Options`, or `frame-ancestors` in their CSP) telling
 * browsers to refuse to render them inside another page. It is a
 * clickjacking defence and it is enforced by the browser, not by
 * us — a site cannot opt out of someone else's refusal. So for
 * the outside world the bar does what it should: resolves what
 * you typed into a real URL and opens it in a real tab. Typing a
 * phrase rather than an address searches for it.
 */
const HOME_LINKS = [
  { href: "/", name: "Home", note: "the atelier" },
  { href: "/work", name: "Work", note: "four projects" },
  { href: "/about", name: "About", note: "the argument" },
  { href: "/contact", name: "Contact", note: "say something" },
];

const OUTSIDE_LINKS = [
  { href: "https://www.google.com", name: "Google" },
  { href: "https://github.com", name: "GitHub" },
  { href: "https://www.linkedin.com", name: "LinkedIn" },
  { href: "https://developer.mozilla.org", name: "MDN" },
];

type View =
  | { kind: "home" }
  | { kind: "local"; path: string }
  | { kind: "away"; href: string; label: string };

/** Turns whatever was typed into somewhere to go. */
function resolve(raw: string): View {
  const q = raw.trim();
  if (!q) return { kind: "home" };

  if (q.startsWith("/")) return { kind: "local", path: q };

  const bare = q.replace(/^https?:\/\//i, "");
  const looksLikeHost = /^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(bare);

  if (/^https?:\/\//i.test(q)) {
    return { kind: "away", href: q, label: bare.split("/")[0] };
  }
  if (looksLikeHost) {
    return { kind: "away", href: `https://${bare}`, label: bare.split("/")[0] };
  }

  // Not an address. Treat it as what it is: a search.
  return {
    kind: "away",
    href: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    label: `search — ${q}`,
  };
}

function BrowserApp({ start }: { start?: string }) {
  const [bar, setBar] = useState(start ?? "");
  const [view, setView] = useState<View>(() => resolve(start ?? ""));
  // Bumped on reload so the iframe actually refetches rather than
  // sitting on whatever it already has.
  const [nonce, setNonce] = useState(0);

  const go = (raw: string) => {
    setView(resolve(raw));
    setNonce((n) => n + 1);
  };

  const home = () => {
    setBar("");
    setView({ kind: "home" });
  };

  return (
    <div className="os-web">
      <form
        className="os-web-bar"
        onSubmit={(e) => {
          e.preventDefault();
          go(bar);
        }}
      >
        <button type="button" className="os-web-ico" onClick={home} aria-label="Home">
          ⌂
        </button>
        <button
          type="button"
          className="os-web-ico"
          onClick={() => setNonce((n) => n + 1)}
          aria-label="Reload"
        >
          ↻
        </button>
        <input
          value={bar}
          onChange={(e) => setBar(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="Search, or type a web address"
          aria-label="Address bar"
        />
        <button type="submit" className="os-web-go">
          Go
        </button>
      </form>

      <div className="os-web-pane">
        {view.kind === "home" ? (
          <div className="os-web-home">
            <p className="os-kicker">This site</p>
            <ul className="os-web-grid">
              {HOME_LINKS.map((l) => (
                <li key={l.href}>
                  <button
                    type="button"
                    onClick={() => {
                      setBar(l.href);
                      go(l.href);
                    }}
                  >
                    <strong>{l.name}</strong>
                    <span>{l.note}</span>
                  </button>
                </li>
              ))}
            </ul>

            <p className="os-kicker">Out there</p>
            <ul className="os-web-out">
              {OUTSIDE_LINKS.map((l) => (
                <li key={l.href}>
                  <button
                    type="button"
                    onClick={() => {
                      setBar(l.href);
                      go(l.href);
                    }}
                  >
                    {l.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.kind === "local" ? (
          <iframe
            key={`${view.path}-${nonce}`}
            src={view.path}
            title="Browser pane"
            className="os-web-frame"
          />
        ) : null}

        {view.kind === "away" ? (
          <div className="os-web-away">
            <p className="os-kicker">Outside the atelier</p>
            <h4>{view.label}</h4>
            <p className="os-copy">
              Big sites tell browsers to refuse to render inside another page —
              a clickjacking defence, enforced by your browser rather than by
              this one. So it opens properly instead.
            </p>
            <a
              className="os-btn"
              href={view.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in a new tab ↗
            </a>
            <p className="os-url">{view.href}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Work ──────────────────────────────────────────────────── */
function WorkApp() {
  const [pick, setPick] = useState(0);
  const p = projects[pick];

  return (
    <div className="os-split">
      <ul className="os-list">
        {projects.map((item, i) => (
          <li key={item.slug}>
            <button
              type="button"
              className={i === pick ? "is-on" : undefined}
              onClick={() => setPick(i)}
            >
              <span className="os-list-n">{String(i + 1).padStart(2, "0")}</span>
              {item.name}
              {item.nameTail ? <i>{item.nameTail}</i> : null}
            </button>
          </li>
        ))}
      </ul>

      <div className="os-detail">
        <p className="os-kicker">{p.kind}</p>
        <h4>
          {p.name}
          {p.nameTail ? <i>{p.nameTail}</i> : null}
        </h4>
        <p className="os-copy">{p.summary}</p>
        <ul className="os-tags">
          {p.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <Link className="os-btn" href={`/work/${p.slug}`}>
          Open case ↗
        </Link>
      </div>
    </div>
  );
}

/* ── Read me ───────────────────────────────────────────────── */
function ReadmeApp() {
  return (
    <div className="os-doc">
      <h4>atelier / read me</h4>
      <p>
        This room is the studio. The light in it follows the real clock and the
        real season — open it at 2am in January and you get a different room
        to the one you get at noon in July.
      </p>
      <p>
        Everything on this machine works. The browser loads this site for real.
        The notepad keeps what you write. The player drives the same audio as
        the toggle in the header. The mailer posts to the same endpoint as the
        contact page. The shell parses what you type — try <code>help</code>.
      </p>
      <p className="os-sign">
        {site.name} — {site.locations}
      </p>
    </div>
  );
}

/* ── Notes ─────────────────────────────────────────────────── */
const NOTES_KEY = "atelier.notes";

function NotesApp() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  // localStorage throws outright in some privacy modes, so every
  // touch of it is guarded. A notepad is not worth a crashed page.
  useEffect(() => {
    try {
      setText(window.localStorage.getItem(NOTES_KEY) ?? "");
    } catch {
      /* no storage available — the pad still works for this session */
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(NOTES_KEY, text);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1400);
      } catch {
        /* ignore */
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [text]);

  return (
    <div className="os-notes">
      <textarea
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        placeholder="Leave something here. It will still be here next time."
        aria-label="Notepad"
      />
      <p className="os-status">
        <span>{text.length} chars</span>
        <span className={saved ? "os-saved is-on" : "os-saved"}>saved</span>
      </p>
    </div>
  );
}

/* ── Player ────────────────────────────────────────────────── */
function PlayerApp() {
  const { playing, available, volume } = useAmbient();

  return (
    <div className="os-player">
      <div className={playing ? "os-disc is-spinning" : "os-disc"} aria-hidden="true">
        <span />
      </div>

      <div className="os-player-body">
        <p className="os-kicker">Now playing</p>
        <h4>Atelier — ambient loop</h4>

        <div className="os-player-ctl">
          <button
            type="button"
            onClick={() => (playing ? pauseAmbient() : void playAmbient())}
            disabled={!available}
            aria-pressed={playing}
          >
            {playing ? "Pause" : "Play"}
          </button>

          <label className="os-vol">
            <span className="os-sr">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setAmbientVolume(Number(e.target.value) / 100)}
            />
          </label>
        </div>

        <div className={playing ? "os-eq is-on" : "os-eq"} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>

        {!available ? <p className="os-warn">Track unavailable.</p> : null}
      </div>
    </div>
  );
}

/* ── Mail ──────────────────────────────────────────────────── */
type SendState = "idle" | "sending" | "sent" | "failed";

function MailApp() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<SendState>("idle");
  const [note, setNote] = useState("");

  const field = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setNote("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        errors?: Record<string, string>;
        error?: string;
      };

      if (res.ok && data.ok) {
        setStatus("sent");
        setForm({ name: "", email: "", message: "" });
        return;
      }

      setStatus("failed");
      setNote(
        data.errors
          ? Object.values(data.errors)[0] ?? "Check the fields."
          : data.error ?? "Could not send just now.",
      );
    } catch {
      setStatus("failed");
      setNote("No connection.");
    }
  }

  if (status === "sent") {
    return (
      <div className="os-sent">
        <p className="os-kicker">Sent</p>
        <h4>It&rsquo;s away.</h4>
        <p className="os-copy">I read everything that lands here.</p>
        <button type="button" className="os-btn" onClick={() => setStatus("idle")}>
          Write another
        </button>
      </div>
    );
  }

  return (
    <form className="os-mail" onSubmit={send}>
      <label>
        <span>To</span>
        <input type="text" value={site.email} readOnly tabIndex={-1} />
      </label>
      <label>
        <span>From</span>
        <input
          type="text"
          required
          value={form.name}
          onChange={field("name")}
          placeholder="Your name"
        />
      </label>
      <label>
        <span>Reply to</span>
        <input
          type="email"
          required
          value={form.email}
          onChange={field("email")}
          placeholder="you@studio.com"
        />
      </label>
      <label className="os-mail-body">
        <span>Message</span>
        <textarea
          required
          value={form.message}
          onChange={field("message")}
          placeholder="What are you building?"
        />
      </label>

      <div className="os-mail-foot">
        <button type="submit" className="os-btn" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send"}
        </button>
        {note ? <p className="os-warn">{note}</p> : null}
      </div>
    </form>
  );
}

/* ── Terminal ──────────────────────────────────────────────── */
type TermProps = {
  onPhase: (next?: Phase) => void;
  onSeason: (next?: Season) => void;
  onClose: () => void;
  onBrowse: (target: string) => void;
  phase: Phase;
  season: Season;
};

const HELP = [
  "help              this",
  "ls                list the work",
  "open <slug>       open a case study",
  "www [url|query]   browser — a path, an address or a search",
  "cat <slug>        read the summary here",
  "theme [phase]     dawn | day | dusk | night",
  "season [name]     spring | summer | autumn | winter",
  "whoami            who is at the desk",
  "date              the room's clock",
  "neofetch          machine specs",
  "clear             wipe the scrollback",
  "exit              shut the terminal",
];

const PHASES: Phase[] = ["dawn", "day", "dusk", "night"];
const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

function TerminalApp({
  onPhase,
  onSeason,
  onClose,
  onBrowse,
  phase,
  season,
}: TermProps) {
  const [log, setLog] = useState<string[]>([
    "atelier shell — type `help`",
  ]);
  const [line, setLine] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const endRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  const run = useCallback(
    (raw: string) => {
      const input = raw.trim();
      const out: string[] = [`$ ${input}`];
      const [cmd, ...rest] = input.split(/\s+/);
      const arg = rest.join(" ").toLowerCase();

      switch (cmd.toLowerCase()) {
        case "":
          out.pop();
          break;

        case "help":
          out.push(...HELP);
          break;

        case "ls":
          out.push(
            ...projects.map(
              (p) =>
                `${p.slug.padEnd(12)} ${(p.name + (p.nameTail ?? "")).padEnd(12)} ${p.kind}`,
            ),
          );
          break;

        case "cat": {
          const hit = projects.find((p) => p.slug === arg);
          out.push(hit ? hit.summary : `cat: ${arg || "?"}: no such project`);
          break;
        }

        case "open": {
          const hit = projects.find((p) => p.slug === arg);
          if (hit) {
            out.push(`opening /work/${hit.slug} …`);
            window.setTimeout(() => router.push(`/work/${hit.slug}`), 420);
          } else {
            out.push(`open: ${arg || "?"}: no such project. try \`ls\` or \`www\``);
          }
          break;
        }

        case "www":
        case "browse": {
          const target = rest.join(" ");
          onBrowse(target);
          out.push(target ? `browser → ${target}` : "browser");
          break;
        }

        case "theme": {
          const next = PHASES.find((p) => p === arg);
          onPhase(next);
          out.push(`light → ${next ?? "next"}`);
          break;
        }

        case "season": {
          const next = SEASONS.find((s) => s === arg);
          onSeason(next);
          out.push(`season → ${next ?? "next"}`);
          break;
        }

        case "whoami":
          out.push(`${site.name.toLowerCase()} — ${site.tagline.toLowerCase()}`);
          break;

        case "date":
          out.push(new Date().toString());
          break;

        case "neofetch":
          out.push(
            "   ◆◆◆◆   atelier os 2.6",
            "  ◆    ◆  host ..... the lab",
            " ◆  ◆◆  ◆ light .... " + phase,
            " ◆  ◆◆  ◆ season ... " + season,
            "  ◆    ◆  stack .... next / three / gsap",
            "   ◆◆◆◆   uptime ... since you opened it",
          );
          break;

        case "echo":
          out.push(rest.join(" "));
          break;

        case "sudo":
          out.push("nice try.");
          break;

        case "clear":
          setLog([]);
          setLine("");
          return;

        case "exit":
          onClose();
          return;

        default:
          out.push(`${cmd}: command not found. try \`help\``);
      }

      setLog((l) => [...l, ...out].slice(-160));
      if (input) {
        setHistory((h) => [...h, input].slice(-40));
      }
      setCursor(-1);
      setLine("");
    },
    [onPhase, onSeason, onClose, onBrowse, phase, season, router],
  );

  return (
    <div
      className="os-term"
      onPointerDown={(e) => {
        // Clicking anywhere in the pane should put the caret back,
        // the way a real terminal behaves — but not if the person
        // is selecting text to copy.
        if (window.getSelection()?.toString()) return;
        (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus();
      }}
    >
      <div className="os-term-log">
        {log.map((l, i) => (
          <p key={`${i}-${l}`} className={l.startsWith("$ ") ? "is-cmd" : undefined}>
            {l}
          </p>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="os-term-in"
        onSubmit={(e) => {
          e.preventDefault();
          run(line);
        }}
      >
        <span aria-hidden="true">$</span>
        <input
          value={line}
          spellCheck={false}
          autoComplete="off"
          aria-label="Terminal input"
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              if (!history.length) return;
              const next = cursor < 0 ? history.length - 1 : Math.max(0, cursor - 1);
              setCursor(next);
              setLine(history[next]);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (cursor < 0) return;
              const next = cursor + 1;
              if (next >= history.length) {
                setCursor(-1);
                setLine("");
              } else {
                setCursor(next);
                setLine(history[next]);
              }
            }
          }}
        />
      </form>
    </div>
  );
}

/* ── The desktop ───────────────────────────────────────────── */
type Props = {
  phase: Phase;
  season: Season;
  clock: string;
  reduced: boolean;
  onPhase: (next?: Phase) => void;
  onSeason: (next?: Season) => void;
  onSleep: () => void;
};

export default function AtelierOS({
  phase,
  season,
  clock,
  reduced,
  onPhase,
  onSeason,
  onSleep,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const osRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef(1);
  /**
   * The scale a drag has to divide by.
   *
   * Not the same number as --os-fit. That one is layout-derived,
   * because a CSS transform does not change layout. But the room
   * around this machine is itself scaled when the camera pushes
   * in, and the cursor moves in real screen pixels — so dividing
   * by the layout fit alone makes windows fly off at better than
   * twice the speed of the hand moving them. Measuring the live
   * rect picks up every transform above it, whatever they are.
   */
  const dragScaleRef = useRef(1);

  const [booted, setBooted] = useState(false);
  const [wins, setWins] = useState<Win[]>([]);
  /** What the browser opens with, and the key that remounts it. */
  const [web, setWeb] = useState({ start: "", n: 0 });

  const { playing } = useAmbient();

  /* The monitor is some fraction of the stage, and the stage is some
     fraction of the viewport. Rather than chase that through every
     rule, the desktop is built at a fixed size and scaled once. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const f = host.clientWidth / OS_W;
      fitRef.current = f;
      host.style.setProperty("--os-fit", String(f));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const focus = useCallback((id: AppId) => {
    setWins((w) => {
      const hit = w.find((x) => x.id === id);
      const rest = w.filter((x) => x.id !== id);
      if (!hit) return w;
      return [...rest, { ...hit, min: false }];
    });
  }, []);

  const launch = useCallback((id: AppId) => {
    setWins((w) => {
      const hit = w.find((x) => x.id === id);
      const rest = w.filter((x) => x.id !== id);
      if (hit) return [...rest, { ...hit, min: false }];
      const def = byId(id);
      return [...rest, { id, x: def.x, y: def.y, min: false }];
    });
  }, []);

  const close = useCallback((id: AppId) => {
    setWins((w) => w.filter((x) => x.id !== id));
  }, []);

  const minimise = useCallback((id: AppId) => {
    setWins((w) => w.map((x) => (x.id === id ? { ...x, min: true } : x)));
  }, []);

  /* ── Dragging ──────────────────────────────────────────────
     Deltas in client pixels divided by the scale factor, which
     works wherever the monitor happens to sit on the page. */
  const drag = useRef<{
    id: AppId;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);

  const onBarDown = (e: React.PointerEvent, id: AppId) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const win = wins.find((w) => w.id === id);
    if (!win) return;

    focus(id);
    // Measured per drag: the camera may have moved since the last.
    const rect = osRef.current?.getBoundingClientRect();
    dragScaleRef.current = rect && rect.width > 0 ? rect.width / OS_W : fitRef.current;

    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onBarMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const f = dragScaleRef.current || 1;
    const def = byId(d.id);

    // Keep a grip on screen: the bar can leave the edges but never
    // entirely, or the window becomes unreachable.
    const x = Math.max(
      -def.w + 110,
      Math.min(OS_W - 110, d.ox + (e.clientX - d.sx) / f),
    );
    // Keep the whole window above the dock while it still fits;
    // a window taller than the desk keeps its title bar instead.
    const maxY = Math.max(0, Math.min(DESK_H - def.h, DESK_H - 26));
    const y = Math.max(0, Math.min(maxY, d.oy + (e.clientY - d.sy) / f));

    setWins((w) => w.map((win) => (win.id === d.id ? { ...win, x, y } : win)));
  };

  const onBarUp = () => {
    drag.current = null;
  };

  const visible = wins.filter((w) => !w.min);

  const browse = useCallback(
    (target: string) => {
      setWeb((w) => ({ start: target, n: w.n + 1 }));
      launch("web");
    },
    [launch],
  );

  const body = (id: AppId) => {
    switch (id) {
      case "web":
        return <BrowserApp key={web.n} start={web.start} />;
      case "work":
        return <WorkApp />;
      case "readme":
        return <ReadmeApp />;
      case "notes":
        return <NotesApp />;
      case "player":
        return <PlayerApp />;
      case "mail":
        return <MailApp />;
      case "term":
        return (
          <TerminalApp
            phase={phase}
            season={season}
            onPhase={onPhase}
            onSeason={onSeason}
            onBrowse={browse}
            onClose={() => close("term")}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="os-host" ref={hostRef}>
      <div className="os" data-phase={phase} ref={osRef}>
        {!booted ? (
          <BootScreen instant={reduced} onDone={() => setBooted(true)} />
        ) : (
          <>
            {/* ── Menu bar ─────────────────────────────────── */}
            <div className="os-menu">
              <span className="os-mark" aria-hidden="true">
                ◆
              </span>
              <strong>Atelier</strong>
              <span className="os-menu-item">File</span>
              <span className="os-menu-item">View</span>
              <span className="os-menu-item">Light</span>

              <span className="os-menu-right">
                <span className={playing ? "os-chip is-on" : "os-chip"}>
                  {playing ? "♪ on" : "♪ off"}
                </span>
                <span className="os-chip">{season}</span>
                <span className="os-clock">{clock}</span>
              </span>
            </div>

            {/* ── Desktop ──────────────────────────────────── */}
            <div className="os-desk">
              <ul className="os-icons">
                {APPS.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => launch(a.id)}
                      aria-label={`Open ${a.name}`}
                    >
                      <span className="os-icon">
                        <Icon id={a.id} />
                      </span>
                      <span className="os-icon-label">{a.name}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {visible.map((w, i) => {
                const def = byId(w.id);
                return (
                  <section
                    key={w.id}
                    className="os-win"
                    style={{
                      left: w.x,
                      top: w.y,
                      width: def.w,
                      height: def.h,
                      zIndex: 10 + i,
                    }}
                    onPointerDown={() => focus(w.id)}
                    aria-label={def.name}
                  >
                    <header
                      className="os-bar"
                      onPointerDown={(e) => onBarDown(e, w.id)}
                      onPointerMove={onBarMove}
                      onPointerUp={onBarUp}
                      onPointerCancel={onBarUp}
                    >
                      <span className="os-bar-btns">
                        <button
                          type="button"
                          className="os-x"
                          onClick={() => close(w.id)}
                          aria-label={`Close ${def.name}`}
                        />
                        <button
                          type="button"
                          className="os-m"
                          onClick={() => minimise(w.id)}
                          aria-label={`Minimise ${def.name}`}
                        />
                      </span>
                      <span className="os-bar-name">{def.name}</span>
                    </header>
                    <div className="os-win-body">{body(w.id)}</div>
                  </section>
                );
              })}
            </div>

            {/* ── Dock ─────────────────────────────────────── */}
            <div className="os-dock">
              <button type="button" className="os-dock-btn" onClick={onSleep}>
                Sleep
              </button>

              <span className="os-dock-tabs">
                {wins.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={w.min ? "os-tab is-min" : "os-tab"}
                    onClick={() => (w.min ? focus(w.id) : minimise(w.id))}
                  >
                    {byId(w.id).name}
                  </button>
                ))}
              </span>

              <span className="os-dock-hint">
                {wins.length ? "drag a title bar · esc to step back" : "pick something"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
