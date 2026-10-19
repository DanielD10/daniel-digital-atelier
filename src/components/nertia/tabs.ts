/**
 * The NERTIA section's pages, in order. A plain module (not a client
 * component) so server pages and the client section bar can both read it.
 */
export const NERTIA_TABS = [
  { href: "/work/nertia", label: "Overview", line: "The brand, where it stands, and the notes." },
  { href: "/work/nertia/ar", label: "AR", line: "Open a sealed unit and wear its effect." },
  { href: "/work/nertia/effects", label: "Effects", line: "All 57 effects, their rarity and the odds." },
  { href: "/work/nertia/race", label: "Race", line: "Play a club race with 25 abilities." },
  { href: "/work/nertia/shop", label: "Shop", line: "Drop 001, every piece and product sheet." },
] as const;
