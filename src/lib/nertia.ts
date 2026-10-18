/**
 * NERTIA — Drop 001: Liquid Series.
 *
 * Single source of truth for the AR prototype on /work/nertia. Each
 * finish owns exactly one signature effect, and each numbered unit
 * carries its finish's effect as a license: own the garment, own its
 * digital layer.
 */

export type FinishId =
  | "heat-shift"
  | "deep-space"
  | "bone-pearl"
  | "liquid-chrome"
  | "full-reflect";

export type EffectId =
  | "flames"
  | "stars"
  | "mist"
  | "bubbles"
  | "streaks"
  | "strike"
  | "frost"
  | "laurel"
  | "steam";

export type Finish = {
  id: FinishId;
  name: string;
  effect: EffectId;
  effectName: string;
  /** One line on how the effect reads, for the certificate and the write-up. */
  effectLine: string;
  /** Iridescent ramp the garment shifts through, in order. */
  ramp: string[];
  /** The accent used for UI chrome and the silhouette's rim light. */
  accent: string;
};

export const finishes: Record<FinishId, Finish> = {
  "heat-shift": {
    id: "heat-shift",
    name: "Heat Shift",
    effect: "flames",
    effectName: "Flames",
    effectLine: "Fire peels off the back and trails behind you at pace.",
    ramp: ["#ff5c1a", "#e0218a", "#ffb627", "#ff7a2e"],
    accent: "#ff5c1a",
  },
  "deep-space": {
    id: "deep-space",
    name: "Deep Space",
    effect: "stars",
    effectName: "Star trail",
    effectLine: "Every stride leaves a field of stars hanging where you were.",
    ramp: ["#1a1340", "#3b1f7a", "#0f5566", "#22104a"],
    accent: "#8b7bff",
  },
  "bone-pearl": {
    id: "bone-pearl",
    name: "Bone Pearl",
    effect: "mist",
    effectName: "Mist",
    effectLine: "A pearl-white mist rolls off the hem and hangs in the air.",
    ramp: ["#efe8dc", "#f1d9e2", "#d8eee8", "#ece4d6"],
    accent: "#e9dfd0",
  },
  "liquid-chrome": {
    id: "liquid-chrome",
    name: "Liquid Chrome",
    effect: "bubbles",
    effectName: "Bubbles",
    effectLine: "Chrome bubbles rise off the shoulders and pop in your wake.",
    ramp: ["#d9dde3", "#8a7cff", "#3fd1c6", "#c9ccd6"],
    accent: "#9fe3dc",
  },
  "full-reflect": {
    id: "full-reflect",
    name: "Full Reflect",
    effect: "streaks",
    effectName: "Light streaks",
    effectLine: "Long-exposure light streaks, like headlights catching the fabric.",
    ramp: ["#8d9096", "#b7bac0", "#f4f6fa", "#9a9da3"],
    accent: "#f4f6fa",
  },
};

export type Region = "top" | "bottom" | "feet" | "head";

export type Category = "apparel" | "footwear" | "headwear";

export function categoryOf(r: Region): Category {
  return r === "feet" ? "footwear" : r === "head" ? "headwear" : "apparel";
}

export type Unit = {
  id: string;
  product: string;
  fit: "M" | "W";
  finish: FinishId;
  region: Region;
  /** Sleeves change how the demo runner draws the garment. */
  sleeves?: boolean;
  unit: number;
  of: number;
  washes: number;
  /** Footwear and headwear are outside Drop 001 — labelled as concepts everywhere. */
  concept?: boolean;
  /** How the demo runner draws headwear. */
  headgear?: "cap" | "band";
  /** Where the chip lives, when it isn't the hem. */
  chip?: string;
  /**
   * Accessories break the one-finish-one-effect rule on purpose: each
   * accessory carries its own effect, whatever its finish.
   */
  effect?: { id: EffectId; name: string; line: string };
};

export type UnitEffect = { id: EffectId; name: string; line: string };

export function unitEffect(u: Unit): UnitEffect {
  if (u.effect) return u.effect;
  const f = finishes[u.finish];
  return { id: f.effect, name: f.effectName, line: f.effectLine };
}

export const units: Unit[] = [
  {
    id: "tee-heat-087",
    product: "Performance Tee",
    fit: "M",
    finish: "heat-shift",
    region: "top",
    sleeves: true,
    unit: 87,
    of: 120,
    washes: 12,
  },
  {
    id: "singlet-space-023",
    product: "First Law Singlet",
    fit: "W",
    finish: "deep-space",
    region: "top",
    unit: 23,
    of: 140,
    washes: 31,
  },
  {
    id: "short-pearl-041",
    product: '3" Lined Short',
    fit: "W",
    finish: "bone-pearl",
    region: "bottom",
    unit: 41,
    of: 60,
    washes: 8,
  },
  {
    id: "singlet-chrome-112",
    product: "First Law Singlet",
    fit: "M",
    finish: "liquid-chrome",
    region: "top",
    unit: 112,
    of: 140,
    washes: 19,
  },
  {
    id: "singlet-reflect-007",
    product: "Full Reflect Singlet LTD",
    fit: "M",
    finish: "full-reflect",
    region: "top",
    unit: 7,
    of: 40,
    washes: 3,
  },
  {
    id: "runner-heat-001",
    product: "Motion Runner",
    fit: "M",
    finish: "heat-shift",
    region: "feet",
    unit: 1,
    of: 100,
    washes: 0,
    concept: true,
    chip: "NFC in the heel tab, printed QR on the tongue as backup",
    effect: {
      id: "strike",
      name: "Footstrike",
      line: "Every footstrike lands as a shockwave, and the shoes leave light on the road.",
    },
  },
  {
    id: "runner-chrome-014",
    product: "Motion Runner",
    fit: "W",
    finish: "liquid-chrome",
    region: "feet",
    unit: 14,
    of: 100,
    washes: 0,
    concept: true,
    chip: "NFC in the heel tab, printed QR on the tongue as backup",
    effect: {
      id: "frost",
      name: "Frost Step",
      line: "Each step freezes the road. Ice prints spread under you and melt behind.",
    },
  },
  {
    id: "cap-pearl-009",
    product: "Race Cap",
    fit: "M",
    finish: "bone-pearl",
    region: "head",
    headgear: "cap",
    unit: 9,
    of: 80,
    washes: 0,
    concept: true,
    chip: "NFC sealed in the brim",
    effect: {
      id: "laurel",
      name: "Victory Laurel",
      line: "A gold laurel of light grows around your head and sheds dust as you run.",
    },
  },
  {
    id: "band-reflect-031",
    product: "Race Headband",
    fit: "W",
    finish: "full-reflect",
    region: "head",
    headgear: "band",
    unit: 31,
    of: 80,
    washes: 0,
    concept: true,
    chip: "NFC woven into the band's seam",
    effect: {
      id: "steam",
      name: "Steam",
      line: "Heat rolls off you as steam, and every breath hangs in the cold.",
    },
  },
];

export function unitLabel(u: Unit): string {
  const w = String(u.of).length;
  return `${String(u.unit).padStart(w, "0")} / ${u.of}`;
}
