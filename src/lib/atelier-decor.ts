/**
 * What the room is decorated for, right now.
 *
 * Season tells you the light and the leaves. This tells you
 * whether there is a tree in the corner. They are not the same
 * question: December and February are both winter, and only one
 * of them has a wreath on the door.
 *
 * The point is that nobody sets this. Open the Lab on the 20th of
 * December and the tree is already lit, because the room keeps its
 * own calendar.
 */

export type Decor =
  | "christmas"
  | "newyear"
  | "spring"
  | "summer"
  | "halloween"
  | "plain";

export type DecorInfo = {
  key: Decor;
  /** Shown under the room, in words. */
  label: string;
};

const LABELS: Record<Decor, string> = {
  christmas: "Decorated for December",
  newyear: "Still up from New Year",
  spring: "Blossom on the sill",
  summer: "Fan on, blinds half down",
  halloween: "Something on the desk is watching",
  plain: "",
};

/**
 * Month is 0-indexed, matching Date#getMonth.
 *
 * The windows are deliberately generous — a tree that appears on
 * the 24th and vanishes on the 26th is a gimmick nobody sees.
 */
export function decorFor(now = new Date()): DecorInfo {
  const m = now.getMonth();
  const d = now.getDate();

  // Late November through the end of December.
  if ((m === 10 && d >= 24) || m === 11) return { key: "christmas", label: LABELS.christmas };
  // The first week of January, before anyone gets round to it.
  if (m === 0 && d <= 7) return { key: "newyear", label: LABELS.newyear };
  // October, building to the end of it.
  if (m === 9) return { key: "halloween", label: LABELS.halloween };
  // March through May.
  if (m >= 2 && m <= 4) return { key: "spring", label: LABELS.spring };
  // June through August.
  if (m >= 5 && m <= 7) return { key: "summer", label: LABELS.summer };

  return { key: "plain", label: LABELS.plain };
}

/** The order the manual toggle walks, so every state is reachable. */
export const DECOR_ORDER: Decor[] = [
  "plain",
  "spring",
  "summer",
  "halloween",
  "christmas",
  "newyear",
];

export function decorLabel(key: Decor): string {
  return LABELS[key];
}
