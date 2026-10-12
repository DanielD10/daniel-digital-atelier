"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The arcade.
 *
 * Two kinds of entry, and the difference matters. A `local` game
 * is vendored into /public/games and served from this origin, so
 * nothing depends on another site's frame policy or on that site
 * still being up in a year. An `embed` is somebody else's page in
 * an iframe, which is fine when they allow it and dead the day
 * they stop.
 *
 * Steam is not an option and never will be: Steam games are
 * native binaries, the Web API returns library and achievement
 * data and nothing playable. Anyone reading this looking for the
 * hook — it does not exist.
 *
 * Licences for the vendored games, and the changes made to them,
 * are in public/games/NOTICE.md. Both are MIT.
 */

export type Game = {
  id: string;
  name: string;
  by: string;
  /** One line on the card, and what to do with the keys. */
  blurb: string;
  keys: string;
  src: string;
  kind: "local" | "embed";
};

export const GAMES: Game[] = [
  {
    id: "racer",
    name: "Coastal Run",
    by: "Jake Gordon · MIT",
    blurb: "Pseudo-3D arcade driving, the way an upright cabinet did it in 1986.",
    keys: "Arrows to steer and accelerate",
    src: "/games/racer/v4.final.html",
    kind: "local",
  },
  {
    id: "2048",
    name: "2048",
    by: "Gabriele Cirulli · MIT",
    blurb: "Slide the tiles, match the numbers, lose an hour.",
    keys: "Arrows, or swipe",
    src: "/games/2048/index.html",
    kind: "local",
  },
];

export default function AtelierArcade() {
  const [open, setOpen] = useState<Game | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  /* A game in an iframe only hears the keyboard once it has
     focus, and nothing gives it focus on its own — so the first
     arrow key goes to the page behind it and the car does not
     move. */
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => frameRef.current?.focus(), 240);
    return () => window.clearTimeout(id);
  }, [open]);

  if (open) {
    return (
      <div className="arc-play">
        <div className="arc-playbar">
          <button type="button" onClick={() => setOpen(null)}>
            ‹ Arcade
          </button>
          <span className="arc-playname">{open.name}</span>
          <span className="arc-keys">{open.keys}</span>
        </div>
        <iframe
          ref={frameRef}
          key={open.id}
          src={open.src}
          title={open.name}
          tabIndex={0}
          /* Local games get a loose sandbox because they are our
             own files; an embed gets the same minus same-origin,
             which it has no business with. */
          sandbox={
            open.kind === "local"
              ? "allow-scripts allow-same-origin allow-pointer-lock"
              : "allow-scripts allow-pointer-lock allow-popups"
          }
          allow="autoplay; gamepad"
        />
      </div>
    );
  }

  return (
    <div className="arc">
      <ul className="arc-list">
        {GAMES.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => setOpen(g)}>
              <span className="arc-name">{g.name}</span>
              <span className="arc-blurb">{g.blurb}</span>
              <span className="arc-by">{g.by}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="arc-foot">
        Served from this site, not linked out. Licences in /games/NOTICE.md.
      </p>
    </div>
  );
}
