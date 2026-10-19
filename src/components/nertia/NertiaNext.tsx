import Link from "next/link";
import { NERTIA_TABS } from "./tabs";

/** The card at the foot of each NERTIA page that leads to the next one. */
export default function NertiaNext({ from }: { from: (typeof NERTIA_TABS)[number]["href"] }) {
  const i = NERTIA_TABS.findIndex((t) => t.href === from);
  const next = NERTIA_TABS[(i + 1) % NERTIA_TABS.length];
  return (
    <Link href={next.href} className="nxx">
      <span className="micro">Next</span>
      <span className="nxx-title">
        {next.label} <span aria-hidden="true">&#8594;</span>
      </span>
      <span className="nxx-line">{next.line}</span>
    </Link>
  );
}
