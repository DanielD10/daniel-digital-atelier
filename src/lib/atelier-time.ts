/**
 * Time and season for the Lab room.
 *
 * Deliberately the same idea as the globe: the room reflects the
 * visitor's real moment rather than a fixed illustration. Someone
 * opening it at 2am in January gets a different room to someone
 * opening it at noon in July — and the fact that it already matched
 * before they touched anything is the whole point.
 */

export type Phase = "dawn" | "day" | "dusk" | "night";
export type Season = "spring" | "summer" | "autumn" | "winter";

export type Mood = {
  phase: Phase;
  season: Season;
  /** Local clock, HH:MM, 24h. */
  clock: string;
  /** What the room says it is, in words. */
  label: string;
};

export function phaseFor(hour: number): Phase {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

/**
 * Meteorological seasons, northern hemisphere. The room is in
 * Texas, so it stays on Texas's calendar regardless of where the
 * visitor is — it is Daniel's room, not theirs.
 */
export function seasonFor(month: number): Season {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

const LABELS: Record<Phase, string> = {
  dawn: "First light",
  day: "Daylight",
  dusk: "Golden hour",
  night: "After hours",
};

export function moodNow(now = new Date()): Mood {
  const phase = phaseFor(now.getHours());
  const season = seasonFor(now.getMonth());

  const clock = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return { phase, season, clock, label: LABELS[phase] };
}

/** Phases in the order the manual toggle cycles through them. */
export const PHASE_ORDER: Phase[] = ["dawn", "day", "dusk", "night"];
export const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"];
