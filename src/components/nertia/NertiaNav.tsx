"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NERTIA_TABS } from "./tabs";

/** The NERTIA section bar: one place to move between its pages. */
export default function NertiaNav() {
  const path = usePathname();
  return (
    <nav className="nxn" aria-label="NERTIA">
      <Link href="/work/nertia" className="nxn-mark">
        NERTIA<b>.</b>
      </Link>
      <div className="nxn-tabs">
        {NERTIA_TABS.map((t) => {
          const on = path === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}>
              {t.label}
            </Link>
          );
        })}
      </div>
      <span className="nxn-status">
        <i aria-hidden="true" />
        In development · Drop 001 presale
      </span>
    </nav>
  );
}
