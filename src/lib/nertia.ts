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
  | "full-reflect"
  | "green-shift"
  | "peach-shift";

export type EffectId =
  | "flames"
  | "stars"
  | "mist"
  | "bubbles"
  | "streaks"
  | "strike"
  | "frost"
  | "laurel"
  | "steam"
  | "embers"
  | "hud"
  | "ghost"
  | "wings"
  | "corona"
  | "leaves"
  | "lightning";

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
  /** e.g. "Women's exclusive" */
  note?: string;
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
    effect: "lightning",
    effectName: "Lightning",
    effectLine: "Electricity crawls across the chrome and cracks off you in forked bolts.",
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
  "green-shift": {
    id: "green-shift",
    name: "Green Shift",
    effect: "leaves",
    effectName: "Leaf Drift",
    effectLine: "Leaves peel off the fabric and tumble behind you, turning to light as they go.",
    ramp: ["#6b7f2a", "#1f9e5a", "#7fe0b0", "#3fae6a"],
    accent: "#3fd18a",
  },
  "peach-shift": {
    id: "peach-shift",
    name: "Peach Shift",
    effect: "bubbles",
    effectName: "Bubbles",
    effectLine: "Peach and coral bubbles rise off your shoulders and pop in your wake.",
    ramp: ["#ffb38a", "#ff9aa8", "#ff6f61", "#ffc9a8"],
    accent: "#ff8f7a",
    note: "Women's exclusive",
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
  /** Pieces outside Drop 001 — labelled as concepts everywhere. */
  concept?: boolean;
  /** How the demo runner draws headwear. */
  headgear?: "cap" | "band" | "visor" | "beanie";
  /** Miles logged against this unit — the effect levels up with them. */
  miles: number;
  /** Where the chip lives, when it isn't the hem. */
  chip?: string;
  /** Leg length of bottoms, as a fraction of the thigh (default 0.36). */
  inseam?: number;
  /** A try-on from the shop, not one of the numbered units. */
  showroom?: boolean;
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
    miles: 212,
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
    miles: 486,
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
    miles: 64,
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
    miles: 318,
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
    miles: 540,
    product: "Full Reflect Singlet LTD",
    fit: "M",
    finish: "full-reflect",
    region: "top",
    unit: 7,
    of: 40,
    washes: 3,
  },
  {
    id: "singlet-green-058",
    miles: 150,
    product: "First Law Singlet",
    fit: "M",
    finish: "green-shift",
    region: "top",
    unit: 58,
    of: 140,
    washes: 14,
  },
  {
    id: "singlet-peach-019",
    miles: 330,
    product: "First Law Singlet",
    fit: "W",
    finish: "peach-shift",
    region: "top",
    unit: 19,
    of: 140,
    washes: 22,
  },
  {
    id: "runner-heat-001",
    miles: 120,
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
    miles: 350,
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
    miles: 610,
    product: "No-Stain Run Cap",
    fit: "M",
    finish: "bone-pearl",
    region: "head",
    headgear: "cap",
    unit: 9,
    of: 80,
    washes: 0,
    chip: "NFC sealed in the brim",
    effect: {
      id: "laurel",
      name: "Victory Laurel",
      line: "A gold laurel of light grows around your head and sheds dust as you run.",
    },
  },
  {
    id: "band-peach-031",
    miles: 90,
    product: "Cooling Headband",
    fit: "W",
    finish: "peach-shift",
    region: "head",
    headgear: "band",
    unit: 31,
    of: 80,
    washes: 0,
    chip: "NFC woven into the band's seam",
    effect: {
      id: "steam",
      name: "Steam",
      line: "Heat rolls off you as steam, and every breath hangs in the cold.",
    },
  },
  {
    id: "trail-space-022",
    miles: 520,
    product: "Trail Runner",
    fit: "M",
    finish: "deep-space",
    region: "feet",
    unit: 22,
    of: 100,
    washes: 0,
    concept: true,
    chip: "NFC in the heel tab, printed QR on the tongue as backup",
    effect: {
      id: "embers",
      name: "Ember Prints",
      line: "Every step burns a print into the road that cools from white to red to black.",
    },
  },
  {
    id: "visor-chrome-044",
    miles: 400,
    product: "Race Visor",
    fit: "W",
    finish: "liquid-chrome",
    region: "head",
    headgear: "visor",
    unit: 44,
    of: 80,
    washes: 0,
    concept: true,
    chip: "NFC sealed in the brim",
    effect: {
      id: "hud",
      name: "Visor HUD",
      line: "Pace, heart rate and splits float beside you. Simulated here; a watch feeds it for real.",
    },
  },
  {
    id: "beanie-heat-013",
    miles: 260,
    product: "Thermal Beanie",
    fit: "M",
    finish: "heat-shift",
    region: "head",
    headgear: "beanie",
    unit: 13,
    of: 80,
    washes: 0,
    concept: true,
    chip: "NFC in the cuff label",
    effect: {
      id: "corona",
      name: "Corona",
      line: "A ring of fire burns around your head like a total eclipse, throwing solar flares off the rim.",
    },
  },
  {
    id: "shell-chrome-005",
    miles: 505,
    product: "Night Shell",
    fit: "M",
    finish: "liquid-chrome",
    region: "top",
    sleeves: true,
    unit: 5,
    of: 60,
    washes: 0,
    concept: true,
    chip: "NFC in the zip garage",
    effect: {
      id: "ghost",
      name: "Ghost Runner",
      line: "Chrome afterimages of your last strides chase you down the road.",
    },
  },
  {
    id: "aero-pearl-003",
    miles: 700,
    product: "Aero Singlet",
    fit: "W",
    finish: "bone-pearl",
    region: "top",
    unit: 3,
    of: 60,
    washes: 0,
    concept: true,
    chip: "NFC in the hem",
    effect: {
      id: "wings",
      name: "Wings",
      line: "Wings of light unfold off your shoulder blades and beat with your stride.",
    },
  },
];

export function unitLabel(u: Unit): string {
  const w = String(u.of).length;
  return `${String(u.unit).padStart(w, "0")} / ${u.of}`;
}

/* ─────────────────────────── levels ─────────────────────────── */

/**
 * Effects level up with the miles logged against a unit. `power`
 * scales how much the effect emits and how big it reads; each effect
 * also unlocks detail at higher levels (more leaves, more readouts,
 * longer wings).
 */
export type Level = { n: 1 | 2 | 3 | 4; roman: string; label: string; min: number; power: number };

export const LEVELS: Level[] = [
  { n: 1, roman: "I", label: "First miles", min: 0, power: 0.45 },
  { n: 2, roman: "II", label: "Broken in", min: 100, power: 0.7 },
  { n: 3, roman: "III", label: "Seasoned", min: 300, power: 1 },
  { n: 4, roman: "IV", label: "Legend", min: 500, power: 1.4 },
];

export function levelFor(miles: number): Level {
  let l = LEVELS[0];
  for (const x of LEVELS) if (miles >= x.min) l = x;
  return l;
}

/** Who runs beside you when "Run together" is on in the demo. */
export function partnerFor(u: Unit): Unit {
  const pick = (id: string) => units.find((x) => x.id === id)!;
  return u.id === "singlet-space-023" ? pick("tee-heat-087") : pick("singlet-space-023");
}

/* ─────────────────────────── lookbook ─────────────────────────── */

/** Product sheets for Drop 001. `unit` links a sheet to its AR unit. */
export type Sheet = {
  id: string;
  file: string;
  title: string;
  kind: string;
  caption: string;
  alt: string;
  unit?: string;
  /** the shop product this sheet is for */
  product?: string;
  /** clickable figures on the sheet, in % of the image */
  spots?: Spot[];
};

export type Spot = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** a numbered unit to read in AR */
  unit?: string;
  /** a product and finish to try on in AR */
  try?: { product: string; finish: FinishId; fit: "M" | "W" };
  /** a product to open in the shop */
  product?: string;
};

export const lookbook: Sheet[] = [
  {
    id: "lineup",
    file: "drop-001-lineup.webp",
    title: "Drop 001: Liquid Series",
    kind: "The full lineup",
    caption:
      "630 numbered units across seven finishes, every one in a men's and a women's fit. Peach Shift is the women's exclusive.",
    alt: "Drop 001 lineup sheet: men's and women's singlets and shorts in seven finishes, Liquid Chrome through Peach Shift, with the build standard along the bottom.",
    spots: [
      { x: 8.13, y: 22.97, w: 11.16, h: 27.11, unit: "singlet-chrome-112", label: "Liquid Chrome · men's" },
      { x: 8.13, y: 50.88, w: 11.16, h: 24.72, unit: "singlet-chrome-112", label: "Liquid Chrome · women's" },
      { x: 20.41, y: 22.97, w: 11.64, h: 27.11, unit: "singlet-space-023", label: "Deep Space · men's" },
      { x: 20.41, y: 50.88, w: 11.64, h: 24.72, unit: "singlet-space-023", label: "Deep Space · women's" },
      { x: 33.17, y: 22.97, w: 11.8, h: 27.11, unit: "tee-heat-087", label: "Heat Shift · men's" },
      { x: 33.17, y: 50.88, w: 11.8, h: 24.72, unit: "tee-heat-087", label: "Heat Shift · women's" },
      { x: 46.09, y: 22.97, w: 11.8, h: 27.11, unit: "short-pearl-041", label: "Bone Pearl · men's" },
      { x: 46.09, y: 50.88, w: 11.8, h: 24.72, unit: "short-pearl-041", label: "Bone Pearl · women's" },
      { x: 59.01, y: 22.97, w: 12.84, h: 27.11, unit: "singlet-reflect-007", label: "Full Reflect · men's" },
      { x: 59.01, y: 50.88, w: 12.84, h: 24.72, unit: "singlet-reflect-007", label: "Full Reflect · women's" },
      { x: 72.97, y: 22.97, w: 12.04, h: 27.11, unit: "singlet-green-058", label: "Green Shift · men's" },
      { x: 72.97, y: 50.88, w: 12.04, h: 24.72, unit: "singlet-green-058", label: "Green Shift · women's" },
      { x: 86.12, y: 50.88, w: 11.64, h: 24.72, unit: "singlet-peach-019", label: "Peach Shift · women's" },
    ],
  },
  {
    id: "first-law",
    file: "first-law-singlet.webp",
    title: "First Law Singlet",
    kind: "$95 · M → 2XL, XS → XL",
    caption: "The everyday singlet. Solution-dyed yarn, so the color lives in the fiber.",
    alt: "First Law Singlet product sheet: men's and women's singlets in Liquid Chrome, Deep Space, Green Shift and Peach Shift, with finish swatches and detail crops.",
    unit: "singlet-chrome-112",
    product: "first-law",
    spots: [
      { x: 10.37, y: 25.36, w: 19.94, h: 30.14, unit: "singlet-chrome-112", label: "Liquid Chrome · men's" },
      { x: 30.94, y: 25.36, w: 22.01, h: 30.14, unit: "singlet-space-023", label: "Deep Space · men's" },
      { x: 53.59, y: 25.36, w: 22.17, h: 30.14, unit: "singlet-green-058", label: "Green Shift · men's" },
      { x: 10.37, y: 56.3, w: 16.19, h: 26.63, unit: "singlet-chrome-112", label: "Liquid Chrome · women's" },
      { x: 27.19, y: 56.3, w: 15.95, h: 26.63, unit: "singlet-space-023", label: "Deep Space · women's" },
      { x: 43.78, y: 56.3, w: 15.87, h: 26.63, unit: "singlet-green-058", label: "Green Shift · women's" },
      { x: 60.29, y: 56.3, w: 15.47, h: 26.63, unit: "singlet-peach-019", label: "Peach Shift · women's" },
    ],
  },
  {
    id: "full-reflect",
    file: "full-reflect-singlet.webp",
    title: "Full Reflect Singlet LTD",
    kind: "$130 · Event-night exclusive",
    caption: "Grey by day, white fire in headlights. Reflective taping and a reflective drawcord.",
    alt: "Full Reflect Singlet LTD product sheet: a man and a woman in white retroreflective singlets and shorts, with fabric, taping and drawcord detail crops.",
    unit: "singlet-reflect-007",
    product: "full-reflect",
    spots: [
      { x: 36.84, y: 15.31, w: 20.26, h: 58.69, unit: "singlet-reflect-007", label: "Full Reflect · men's" },
      { x: 57.42, y: 18.82, w: 15.95, h: 55.18, unit: "singlet-reflect-007", label: "Full Reflect · women's" },
    ],
  },
  {
    id: "split-short",
    file: "split-short.webp",
    title: '5" Split Short',
    kind: "$140 · Hero product",
    caption: "Built for speed. Deep Space, Heat Shift and Green Shift, front and back.",
    alt: "5 inch Split Short product sheet: men's and women's shorts in Deep Space, Heat Shift and Green Shift, front and back, with detail crops of the side split, zip-pocket waistband, liner, drawcord and fabric.",
    product: "split-short",
    spots: [
      { x: 24.88, y: 10.21, w: 24.4, h: 28.07, try: { product: "split-short", finish: "deep-space", fit: "M" }, label: "Deep Space · men's" },
      { x: 49.76, y: 10.21, w: 24.08, h: 28.07, try: { product: "split-short", finish: "heat-shift", fit: "M" }, label: "Heat Shift · men's" },
      { x: 74.32, y: 10.21, w: 23.92, h: 28.07, try: { product: "split-short", finish: "green-shift", fit: "M" }, label: "Green Shift · men's" },
      { x: 24.88, y: 44.34, w: 24.4, h: 28.55, try: { product: "split-short", finish: "deep-space", fit: "W" }, label: "Deep Space · women's" },
      { x: 49.76, y: 44.34, w: 24.08, h: 28.55, try: { product: "split-short", finish: "heat-shift", fit: "W" }, label: "Heat Shift · women's" },
      { x: 74.32, y: 44.34, w: 23.92, h: 28.55, try: { product: "split-short", finish: "green-shift", fit: "W" }, label: "Green Shift · women's" },
    ],
  },
  {
    id: "lined-short",
    file: "lined-short.webp",
    title: '3" Lined Short (W)',
    kind: "$140 · Women's exclusive",
    caption: "High rise, built-in liner with a drop-in pocket. Four finishes.",
    alt: "3 inch Lined Short product sheet: women's shorts in Bone Pearl, Liquid Chrome, Green Shift and Peach Shift, with the liner, pocket and back views.",
    product: "lined-short",
    spots: [
      { x: 28.55, y: 5.9, w: 17.07, h: 40.19, try: { product: "lined-short", finish: "bone-pearl", fit: "W" }, label: "Bone Pearl · women's" },
      { x: 45.77, y: 5.9, w: 17.07, h: 40.19, try: { product: "lined-short", finish: "liquid-chrome", fit: "W" }, label: "Liquid Chrome · women's" },
      { x: 63.0, y: 5.9, w: 17.22, h: 40.19, try: { product: "lined-short", finish: "green-shift", fit: "W" }, label: "Green Shift · women's" },
      { x: 80.38, y: 5.9, w: 17.38, h: 40.19, try: { product: "lined-short", finish: "peach-shift", fit: "W" }, label: "Peach Shift · women's" },
    ],
  },
  {
    id: "tee",
    file: "performance-tee.webp",
    title: "Performance Tee",
    kind: "$110 · UPF 50",
    caption: "Lightweight, breathable, reflective front and back. Peach Shift for women.",
    alt: "Performance Tee product sheet: men's tees in Heat Shift, Deep Space and Green Shift and women's tees adding Peach Shift, with finish swatches and detail crops.",
    product: "tee",
    spots: [
      { x: 33.33, y: 4.94, w: 21.69, h: 27.35, try: { product: "tee", finish: "heat-shift", fit: "M" }, label: "Heat Shift · men's" },
      { x: 55.02, y: 4.94, w: 21.37, h: 27.35, try: { product: "tee", finish: "deep-space", fit: "M" }, label: "Deep Space · men's" },
      { x: 76.4, y: 4.94, w: 21.37, h: 27.35, try: { product: "tee", finish: "green-shift", fit: "M" }, label: "Green Shift · men's" },
      { x: 33.33, y: 37.32, w: 16.11, h: 26.08, try: { product: "tee", finish: "heat-shift", fit: "W" }, label: "Heat Shift · women's" },
      { x: 49.44, y: 37.32, w: 16.11, h: 26.08, try: { product: "tee", finish: "deep-space", fit: "W" }, label: "Deep Space · women's" },
      { x: 65.55, y: 37.32, w: 16.11, h: 26.08, try: { product: "tee", finish: "green-shift", fit: "W" }, label: "Green Shift · women's" },
      { x: 81.66, y: 37.32, w: 16.11, h: 26.08, try: { product: "tee", finish: "peach-shift", fit: "W" }, label: "Peach Shift · women's" },
    ],
  },
  {
    id: "womens-line",
    file: "womens-line.webp",
    title: "Women's Line",
    kind: "Bra · Half Tight · Bra Tank",
    caption: "Three core pieces in four finishes, styled nine ways.",
    alt: "Women's Line sheet: Motion Bra, Motion Half Tight and Longline Bra Tank in Peach Shift, Green Shift, Bone Pearl and Deep Space, styled in nine outfits.",
    product: "motion-bra",
    spots: [
      { x: 2.39, y: 48.8, w: 10.53, h: 25.36, try: { product: "motion-bra", finish: "peach-shift", fit: "W" }, label: "Motion Bra · Peach Shift" },
      { x: 12.92, y: 48.8, w: 10.61, h: 25.36, try: { product: "motion-bra", finish: "green-shift", fit: "W" }, label: "Motion Bra · Green Shift" },
      { x: 23.52, y: 48.8, w: 10.61, h: 25.36, try: { product: "motion-bra", finish: "deep-space", fit: "W" }, label: "Motion Bra · Deep Space" },
      { x: 34.13, y: 48.8, w: 10.61, h: 25.36, try: { product: "bra-tank", finish: "peach-shift", fit: "W" }, label: "Longline Bra Tank · Peach Shift" },
      { x: 44.74, y: 48.8, w: 10.61, h: 25.36, try: { product: "bra-tank", finish: "bone-pearl", fit: "W" }, label: "Longline Bra Tank · Bone Pearl" },
      { x: 55.34, y: 48.8, w: 10.53, h: 25.36, try: { product: "bra-tank", finish: "deep-space", fit: "W" }, label: "Longline Bra Tank · Deep Space" },
      { x: 65.87, y: 48.8, w: 10.61, h: 25.36, try: { product: "half-tight", finish: "peach-shift", fit: "W" }, label: "Half Tight · Peach Shift" },
      { x: 76.48, y: 48.8, w: 10.61, h: 25.36, try: { product: "half-tight", finish: "bone-pearl", fit: "W" }, label: "Half Tight · Bone Pearl" },
      { x: 87.08, y: 48.8, w: 10.61, h: 25.36, try: { product: "half-tight", finish: "deep-space", fit: "W" }, label: "Half Tight · Deep Space" },
    ],
  },
  {
    id: "pouch",
    file: "motion-pouch.webp",
    title: "Motion Pouch",
    kind: "$50 · Waist or crossbody",
    caption: "Full Reflect, Deep Space and Green Shift. Designed to disappear.",
    alt: "Motion Pouch product sheet: the pouch in Full Reflect, Deep Space and Green Shift, worn at the waist and crossbody by men and women.",
    product: "motion-pouch",
    spots: [
      { x: 25.36, y: 14.19, w: 51.36, h: 21.37, product: "motion-pouch", label: "Motion Pouch" },
      { x: 3.19, y: 42.9, w: 31.26, h: 9.41, product: "motion-pouch", label: "Full Reflect" },
      { x: 36.2, y: 42.9, w: 27.59, h: 9.41, product: "motion-pouch", label: "Deep Space" },
      { x: 65.55, y: 42.9, w: 31.26, h: 9.41, product: "motion-pouch", label: "Green Shift" },
      { x: 2.55, y: 58.21, w: 30.94, h: 25.04, product: "motion-pouch", label: "Men's, waist" },
      { x: 34.61, y: 58.21, w: 29.98, h: 25.04, product: "motion-pouch", label: "Women's, waist" },
      { x: 65.55, y: 58.21, w: 31.9, h: 25.04, product: "motion-pouch", label: "Crossbody" },
    ],
  },
  {
    id: "run-cap",
    file: "run-cap.webp",
    title: "No-Stain Run Cap",
    kind: "$48 · Adjustable",
    caption: "Salt-ring resistant, laser-perf venting, quick-dry sweatband. Four finishes.",
    alt: "No-Stain Run Cap product sheet: the cap in Full Reflect, Deep Space, Bone Pearl and Green Shift, front, side, back and interior views, worn by a man and a woman.",
    product: "run-cap",
    spots: [
      { x: 35.09, y: 6.38, w: 39.87, h: 29.51, try: { product: "run-cap", finish: "full-reflect", fit: "M" }, label: "Full Reflect" },
      { x: 2.71, y: 40.19, w: 22.81, h: 12.12, try: { product: "run-cap", finish: "full-reflect", fit: "M" }, label: "Full Reflect" },
      { x: 26.63, y: 40.19, w: 22.81, h: 12.12, try: { product: "run-cap", finish: "deep-space", fit: "M" }, label: "Deep Space" },
      { x: 50.56, y: 40.19, w: 22.81, h: 12.12, try: { product: "run-cap", finish: "bone-pearl", fit: "M" }, label: "Bone Pearl" },
      { x: 74.48, y: 40.19, w: 22.81, h: 12.12, try: { product: "run-cap", finish: "green-shift", fit: "M" }, label: "Green Shift" },
      { x: 9.41, y: 74.8, w: 24.56, h: 17.7, try: { product: "run-cap", finish: "full-reflect", fit: "M" }, label: "Full Reflect · men's" },
      { x: 45.14, y: 74.8, w: 23.13, h: 17.7, try: { product: "run-cap", finish: "deep-space", fit: "W" }, label: "Deep Space · women's" },
      { x: 69.22, y: 74.8, w: 28.07, h: 17.7, try: { product: "run-cap", finish: "full-reflect", fit: "W" }, label: "Full Reflect · women's" },
    ],
  },
  {
    id: "cooling-headband",
    file: "cooling-headband.webp",
    title: "Cooling Headband",
    kind: "$24 · One size",
    caption: "Cooling knit with a silicone no-slip grip. Five finishes, Peach Shift for women.",
    alt: "Cooling Headband product sheet: the headband in Deep Space, Heat Shift, Green Shift, Peach Shift and Bone Pearl, with grip and knit details, worn by a man and a woman.",
    product: "cooling-headband",
    spots: [
      { x: 31.9, y: 5.58, w: 45.45, h: 32.3, try: { product: "cooling-headband", finish: "deep-space", fit: "M" }, label: "Deep Space" },
      { x: 2.55, y: 40.19, w: 18.42, h: 12.28, try: { product: "cooling-headband", finish: "deep-space", fit: "M" }, label: "Deep Space" },
      { x: 21.85, y: 40.19, w: 18.18, h: 12.28, try: { product: "cooling-headband", finish: "heat-shift", fit: "M" }, label: "Heat Shift" },
      { x: 40.83, y: 40.19, w: 18.18, h: 12.28, try: { product: "cooling-headband", finish: "green-shift", fit: "M" }, label: "Green Shift" },
      { x: 59.97, y: 40.19, w: 18.18, h: 12.28, try: { product: "cooling-headband", finish: "peach-shift", fit: "W" }, label: "Peach Shift · women's" },
      { x: 78.95, y: 40.19, w: 18.34, h: 12.28, try: { product: "cooling-headband", finish: "bone-pearl", fit: "M" }, label: "Bone Pearl" },
      { x: 8.61, y: 73.84, w: 37.32, h: 18.66, try: { product: "cooling-headband", finish: "deep-space", fit: "M" }, label: "Deep Space · men's" },
      { x: 55.34, y: 73.84, w: 41.95, h: 18.66, try: { product: "cooling-headband", finish: "peach-shift", fit: "W" }, label: "Peach Shift · women's" },
    ],
  },
];
