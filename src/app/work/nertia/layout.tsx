import Link from "next/link";
import Masthead from "@/components/Masthead";
import NertiaNav from "@/components/nertia/NertiaNav";

/**
 * NERTIA is a small site inside the portfolio: an overview, the AR
 * prototype, the race game and the shop, under one section bar. The
 * layout keeps the bar mounted while moving between them.
 */
export default function NertiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Masthead />
      <main className="page nx-page" id="main">
        <Link className="back" href="/work">
          ← All work
        </Link>
        <NertiaNav />
        {children}
      </main>
    </>
  );
}
