"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SoundToggle from "./SoundToggle";

/**
 * The masthead is fixed and, at the top of a page, deliberately
 * has nothing behind it — `mix-blend-mode: difference` lets the
 * monogram invert itself against whatever it is floating over,
 * which is the whole effect.
 *
 * The problem is the rest of the page. Scroll, and headings slide
 * straight through it: on a phone, where the nav wraps onto a
 * second line, "The lab" ends up sitting inside "WORK LAB ABOUT
 * CONTACT" with difference blending scrambling both. So the bar
 * earns a backdrop the moment it stops being at the top, and
 * gives it back when it returns.
 */
export default function Masthead() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const read = () => setStuck(window.scrollY > 8);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  return (
    <header className={`mast${stuck ? " is-stuck" : ""}`}>
      <Link className="monogram" href="/" aria-label="Daniel Duran, home">
        D/D
      </Link>

      <nav className="nav" aria-label="Primary">
        <Link href="/work">Work</Link>
        <Link href="/lab">Lab</Link>
        <Link href="/about">About</Link>
        <Link href="/contact">Contact</Link>
      </nav>

      <div className="mast-end">
        <SoundToggle />
        <Link className="dots" href="/work" aria-label="All work">
          ···
        </Link>
      </div>
    </header>
  );
}
