import type { AbilityId } from "@/lib/nertia-race";

/** one line icon per ability */
const PATHS: Record<AbilityId, string> = {
  tailwind: "M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8",
  gel: "M9 3h6l-1 3v3l3 3v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7l3-3V6zM8 15h8",
  "second-wind": "M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4M12 8v4l3 2",
  pacer: "M12 9v4.5l3 2M9 2h6M12 5a8 8 0 1 0 0 16 8 8 0 1 0 0-16",
  slingshot: "M6 3v7a6 6 0 0 0 12 0V3M12 16v5M6 7c3 2 9 2 12 0",
  headwind: "M21 8H10a3 3 0 1 1 3-3M21 12H6a3 3 0 1 0 3 3M21 16h-8",
  cramp: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M8 9l3 3-3 3M16 9l-3 3 3 3",
  pothole: "M3 16c0-2 4-3.5 9-3.5s9 1.5 9 3.5-4 3.5-9 3.5-9-1.5-9-3.5zM9 11l1.2-4 2 2 1.3-4.5",
  detour: "M4 20v-9a4 4 0 0 1 8 0v3a4 4 0 0 0 8 0V5M17 7l3-3 3 3",
  static: "M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19M10 9l4 2-4 2 4 2",
  bonk: "M3 6h18v12H3zM3 12h18M9 6v6M15 12v6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  mirror: "M12 2l8 4.5v9L12 20l-8-4.5v-9zM8 11h8M13 8l3 3-3 3",
  fog: "M4 9h12M2 13h16M6 17h14M18 9h2",
  rally: "M5 21V4M5 4h11l-2 4 2 4H5",
  relay: "M3 12h13M12 7l5 5-5 5M21 5v14",
  "pace-line": "M4 7l5 5-5 5M10 7l5 5-5 5M16 7l5 5-5 5",
  "gel-pack": "M4 5h4l-.5 2.5V17a1.5 1.5 0 0 1-3 0V7.5zM10 5h4l-.5 2.5V17a1.5 1.5 0 0 1-3 0V7.5zM16 5h4l-.5 2.5V17a1.5 1.5 0 0 1-3 0V7.5z",
  "runners-high": "M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z",
  kick: "M3 20h18M5 20l4-6 3 2.5 5-9.5M14 7h3v3",
  hill: "M2 20l7-11 4 5.5 3-3.5 6 9zM9 9l1.5-2",
  crowd: "M6 8.5a2 2 0 1 0 0 .01M12 6.5a2 2 0 1 0 0 .01M18 8.5a2 2 0 1 0 0 .01M3 20v-4a3 3 0 0 1 6 0v4M9 20v-6a3 3 0 0 1 6 0v6M15 20v-4a3 3 0 0 1 6 0v4",
  pickpocket: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V10M14 10V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L3.6 14a1.5 1.5 0 0 1 2.4-1.8L8 14",
  "air-horn": "M3 10v4h3l7 5V5l-7 5zM16.5 9a4 4 0 0 1 0 6M19.5 6a8 8 0 0 1 0 12",
  regroup: "M3 6l6 6-6 6M21 6l-6 6 6 6M12 4v16",
};

export default function RaceIcon({ id, className }: { id: AbilityId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={PATHS[id]} />
    </svg>
  );
}

export const ICON_PATHS = PATHS;
