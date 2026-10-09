import Link from "next/link";
import SoundToggle from "./SoundToggle";

export default function Masthead() {
  return (
    <header className="mast">
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
