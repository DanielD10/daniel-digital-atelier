/**
 * NERTIA — the Drop 001 effect set.
 *
 * Every unit is sealed like an unopened pack. Its effect is rolled
 * when the unit is made, from the pool for that kind of garment, and
 * stays hidden until the chip is read for the first time. The roll is
 * seeded by product, finish and serial, so unit 087 always holds the
 * same effect, and a rare pull makes that unit worth more at resale.
 *
 * The finish sets the type: a garment pulls effects of its own type
 * three times as often as any other.
 */

import type { EffectId, FinishId, Region } from "./nertia";

/* ─────────────────────────── rarity ─────────────────────────── */

export type RarityId = "common" | "uncommon" | "rare" | "holo" | "ultra" | "secret";

export type Rarity = {
  id: RarityId;
  label: string;
  /** chance of pulling this tier */
  odds: number;
  /** stars printed on the card */
  stars: number;
  color: string;
};

export const RARITIES: Rarity[] = [
  { id: "common", label: "Common", odds: 0.46, stars: 1, color: "#b9b4ab" },
  { id: "uncommon", label: "Uncommon", odds: 0.28, stars: 2, color: "#6fd3a8" },
  { id: "rare", label: "Rare", odds: 0.15, stars: 3, color: "#6aa8ff" },
  { id: "holo", label: "Holo", odds: 0.07, stars: 3, color: "#c48bff" },
  { id: "ultra", label: "Ultra", odds: 0.03, stars: 4, color: "#ff6fa8" },
  { id: "secret", label: "Secret", odds: 0.01, stars: 5, color: "#ffc94a" },
];

export const rarity = (id: RarityId) => RARITIES.find((r) => r.id === id)!;
const tier = (id: RarityId) => RARITIES.findIndex((r) => r.id === id);

/* ─────────────────────────── type ─────────────────────────── */

export type Element = "fire" | "storm" | "cosmic" | "spirit" | "light" | "nature" | "bloom";

export const ELEMENTS: Record<Element, { label: string; color: string }> = {
  fire: { label: "Fire", color: "#ff6a2a" },
  storm: { label: "Storm", color: "#7fd8ff" },
  cosmic: { label: "Cosmic", color: "#9b86ff" },
  spirit: { label: "Spirit", color: "#e9e1d4" },
  light: { label: "Light", color: "#fff1b8" },
  nature: { label: "Nature", color: "#5fd68f" },
  bloom: { label: "Bloom", color: "#ff9a9a" },
};

/** The type each finish pulls toward. */
export const FINISH_TYPE: Record<FinishId, Element> = {
  "heat-shift": "fire",
  "deep-space": "cosmic",
  "bone-pearl": "spirit",
  "liquid-chrome": "storm",
  "full-reflect": "light",
  "green-shift": "nature",
  "peach-shift": "bloom",
};

/* ─────────────────────────── the set ─────────────────────────── */

export type Home = Region | "body";

export type Card = {
  id: string;
  name: string;
  /** one line on how it reads, for the card and the certificate */
  line: string;
  engine: EffectId;
  /** palette or style the engine runs in */
  variant?: string;
  rarity: RarityId;
  element: Element;
  /** where the card sits in the set */
  home: Home;
  /** which garments can pull it */
  regions: Region[];
  /** Ultra and Secret pulls come with a second effect: a body glow */
  bonus?: string;
  /** standard on a piece, not pulled (the headband's HUD) */
  fixed?: boolean;
};

const ALL: Region[] = ["top", "bottom", "feet", "head"];
const TB: Region[] = ["top", "bottom"];

type Def = Omit<Card, "regions"> & { regions?: Region[] };

const defs: Def[] = [
  /* ── tops ── */
  { id: "leaf-drift", name: "Leaf Drift", engine: "leaves", rarity: "common", element: "nature", home: "top", regions: TB, line: "Leaves peel off the fabric and tumble behind you, turning to light." },
  { id: "autumn", name: "Autumn", engine: "leaves", variant: "autumn", rarity: "common", element: "nature", home: "top", regions: TB, line: "Red and gold leaves come off you like a tree in October." },
  { id: "bubbles", name: "Bubbles", engine: "bubbles", rarity: "common", element: "bloom", home: "top", regions: TB, line: "Peach and coral bubbles rise off you and pop in your wake." },
  { id: "snowfall", name: "Snowfall", engine: "snow", rarity: "common", element: "spirit", home: "top", regions: ["top", "head"], line: "Snow falls around you, and only you, wherever you run." },
  { id: "slipstream", name: "Slipstream", engine: "slipstream", rarity: "common", element: "storm", home: "top", regions: TB, line: "You can see the air: silver flow lines peel off you at pace." },
  { id: "sakura", name: "Sakura", engine: "leaves", variant: "sakura", rarity: "uncommon", element: "bloom", home: "top", regions: TB, line: "Cherry blossom petals stream off you and spin away." },
  { id: "light-streaks", name: "Light Streaks", engine: "streaks", rarity: "uncommon", element: "light", home: "top", regions: TB, line: "Long-exposure light streaks, like headlights catching the fabric." },
  { id: "gold-dust", name: "Gold Dust", engine: "sparkle", variant: "gold", rarity: "uncommon", element: "light", home: "top", regions: ["top", "feet", "head"], line: "Gold dust sheds off you and glitters in the air behind." },
  { id: "finish-line", name: "Finish Line", engine: "confetti", rarity: "uncommon", element: "light", home: "top", regions: ["top"], line: "Every run ends in confetti. So does every stride." },
  { id: "silk", name: "Silk Ribbons", engine: "ribbons", rarity: "uncommon", element: "bloom", home: "top", regions: TB, line: "Silk ribbons trail off you, twisting in the wind you make." },
  { id: "flames", name: "Flames", engine: "flames", rarity: "rare", element: "fire", home: "top", regions: ALL, line: "Fire peels off you and trails behind at pace." },
  { id: "star-trail", name: "Star Trail", engine: "stars", rarity: "rare", element: "cosmic", home: "top", regions: ["top", "bottom", "head"], line: "Every stride leaves a field of stars hanging where you were." },
  { id: "lightning", name: "Lightning", engine: "lightning", rarity: "rare", element: "storm", home: "top", regions: ["top", "bottom", "head"], line: "Electricity crawls over you and cracks off in forked bolts." },
  { id: "butterflies", name: "Butterflies", engine: "butterflies", rarity: "rare", element: "nature", home: "top", regions: ["top"], line: "Glowing blue butterflies lift off you and scatter into the night." },
  { id: "diamond-dust", name: "Diamond Dust", engine: "sparkle", variant: "diamond", rarity: "rare", element: "spirit", home: "top", regions: ["top", "head"], line: "Ice crystals hang in the air around you and flash as they turn." },
  { id: "aurora", name: "Aurora", engine: "aurora", rarity: "holo", element: "cosmic", home: "top", regions: ["top"], line: "Curtains of northern lights ripple up off your shoulders and trail behind." },
  { id: "cold-fire", name: "Cold Fire", engine: "flames", variant: "cold", rarity: "holo", element: "fire", home: "top", regions: ALL, line: "Blue fire, white at the core. It burns hotter than the orange kind." },
  { id: "glitch", name: "Glitch", engine: "glitch", rarity: "holo", element: "storm", home: "top", regions: TB, line: "You break up like bad signal and shed pixels as you run." },
  { id: "gold-lightning", name: "Gold Lightning", engine: "lightning", variant: "gold", rarity: "holo", element: "light", home: "top", regions: ["top", "bottom", "head"], line: "Lightning, in gold." },
  { id: "ghost-runner", name: "Ghost Runner", engine: "ghost", rarity: "ultra", element: "storm", home: "top", bonus: "volt-glow", regions: TB, line: "Chrome afterimages of your last strides chase you down the road." },
  { id: "wings", name: "Wings", engine: "wings", rarity: "ultra", element: "spirit", home: "top", bonus: "ice-glow", regions: ["top"], line: "Wings of light unfold off your shoulder blades and beat with your stride." },
  { id: "red-lightning", name: "Red Lightning", engine: "lightning", variant: "crimson", rarity: "ultra", element: "storm", home: "top", bonus: "amber-glow", regions: ["top", "bottom", "head"], line: "Red lightning. Nobody else on the road has it." },
  { id: "black-flame", name: "Black Flame", engine: "flames", variant: "void", rarity: "secret", element: "cosmic", home: "top", bonus: "shadow-aura", regions: ["top"], line: "Fire that eats light. Black at the core, violet at the edge." },

  /* ── bottoms ── */
  { id: "comets", name: "Comets", engine: "comet", rarity: "rare", element: "cosmic", home: "bottom", regions: ["bottom", "feet"], line: "A comet rides each knee, its tail streaming out behind you." },
  { id: "nova", name: "Nova", engine: "comet", variant: "nova", rarity: "holo", element: "fire", home: "bottom", regions: ["bottom", "feet"], line: "Comets again, burning magenta and gold." },
  { id: "rainbow-trail", name: "Rainbow Trail", engine: "ribbons", variant: "rainbow", rarity: "secret", element: "light", home: "bottom", bonus: "prism", regions: ["bottom"], line: "A full rainbow streams off your hips and follows you home." },

  /* ── shoes ── */
  { id: "mist", name: "Mist", engine: "mist", rarity: "common", element: "spirit", home: "feet", regions: ["feet"], line: "A pearl mist rolls off your shoes and hangs low on the road." },
  { id: "shadow", name: "Shadow", engine: "mist", variant: "shadow", rarity: "uncommon", element: "cosmic", home: "feet", regions: ["feet"], line: "Black smoke with a violet edge pours off your shoes and settles on the road." },
  { id: "neon-strike", name: "Neon Strike", engine: "strike", variant: "neon", rarity: "common", element: "light", home: "feet", regions: ["feet"], line: "Every footstrike lands as a neon shockwave." },
  { id: "ripple-step", name: "Ripple Step", engine: "ripple", rarity: "common", element: "bloom", home: "feet", regions: ["feet"], line: "The road turns to water under you. Every step splashes and rings out." },
  { id: "footstrike", name: "Footstrike", engine: "strike", rarity: "uncommon", element: "fire", home: "feet", regions: ["feet"], line: "Every footstrike lands as a shockwave, and the shoes leave light on the road." },
  { id: "bloom-step", name: "Bloom Step", engine: "bloom", rarity: "uncommon", element: "nature", home: "feet", regions: ["feet"], line: "Flowers grow where you step, then wilt behind you." },
  { id: "neon-grid", name: "Neon Grid", engine: "grid", rarity: "uncommon", element: "storm", home: "feet", regions: ["feet"], line: "The road is a dance floor. Every step lights up the tiles under you." },
  { id: "frost-step", name: "Frost Step", engine: "frost", rarity: "rare", element: "spirit", home: "feet", regions: ["feet"], line: "Each step freezes the road. Ice prints spread under you and melt behind." },
  { id: "ember-prints", name: "Ember Prints", engine: "embers", rarity: "rare", element: "fire", home: "feet", regions: ["feet"], line: "Every step burns a print into the road that cools from white to red to black." },
  { id: "lightning-steps", name: "Lightning Steps", engine: "thunder", rarity: "holo", element: "storm", home: "feet", regions: ["feet"], line: "Lightning hits the road every time a foot comes down." },
  { id: "red-thunder", name: "Red Thunder", engine: "thunder", variant: "crimson", rarity: "ultra", element: "storm", home: "feet", bonus: "amber-glow", regions: ["feet"], line: "Lightning Steps, in red. The road scorches under you." },
  { id: "gold-thunder", name: "Gold Thunder", engine: "thunder", variant: "gold", rarity: "secret", element: "light", home: "feet", bonus: "solar-aura", regions: ["feet"], line: "Gold lightning on every step. One in a hundred pairs." },

  /* ── hats ── */
  { id: "steam", name: "Steam", engine: "steam", rarity: "common", element: "spirit", home: "head", regions: ["head"], line: "Heat rolls off you as steam, and every breath hangs in the cold." },
  { id: "storm-cloud", name: "Storm Cloud", engine: "cloud", rarity: "uncommon", element: "storm", home: "head", regions: ["head"], line: "Your own storm cloud follows you, raining and flickering." },
  { id: "orbit", name: "Orbit", engine: "orbit", rarity: "rare", element: "cosmic", home: "head", regions: ["head"], line: "Three small moons circle your head, leaving trails." },
  { id: "halo", name: "Halo", engine: "halo", rarity: "holo", element: "spirit", home: "head", regions: ["head"], line: "A gold ring of light floats over your head and drops light as you run." },
  { id: "victory-laurel", name: "Victory Laurel", engine: "laurel", rarity: "ultra", element: "nature", home: "head", bonus: "amber-glow", regions: ["head"], line: "A gold laurel of light grows around your head and sheds dust as you run." },
  { id: "crown", name: "Crown of Light", engine: "crown", rarity: "ultra", element: "light", home: "head", bonus: "ice-glow", regions: ["head"], line: "A crown of light turns slowly over your head." },
  { id: "black-halo", name: "Black Halo", engine: "halo", variant: "void", rarity: "ultra", element: "cosmic", home: "head", bonus: "violet-glow", regions: ["head"], line: "A halo, but black, with a violet rim. It drinks the light around it." },
  { id: "corona", name: "Corona", engine: "corona", rarity: "secret", element: "fire", home: "head", bonus: "solar-aura", regions: ["head"], line: "A ring of fire burns around your head like a total eclipse." },

  /* ── body glows: any garment can pull them ── */
  { id: "ice-glow", name: "Ice Glow", engine: "aura", variant: "glow-ice", rarity: "common", element: "spirit", home: "body", line: "A cold blue light breathes off your whole body." },
  { id: "violet-glow", name: "Violet Glow", engine: "aura", variant: "glow-violet", rarity: "common", element: "cosmic", home: "body", line: "A deep violet light hangs around your outline like dusk." },
  { id: "rose-glow", name: "Rose Glow", engine: "aura", variant: "glow-rose", rarity: "common", element: "bloom", home: "body", line: "A soft rose light breathes around your outline." },
  { id: "volt-glow", name: "Volt Glow", engine: "aura", variant: "glow-volt", rarity: "common", element: "storm", home: "body", line: "An electric lime glow hums around you." },
  { id: "amber-glow", name: "Amber Glow", engine: "aura", variant: "glow-amber", rarity: "common", element: "fire", home: "body", line: "Warm amber light comes off you like a banked fire." },
  { id: "heartbeat", name: "Heartbeat", engine: "aura", variant: "pulse", rarity: "uncommon", element: "bloom", home: "body", line: "Your outline pulses outward in rings, in time with a heartbeat." },
  { id: "spirit-aura", name: "Spirit Aura", engine: "aura", variant: "flare-spirit", rarity: "rare", element: "spirit", home: "body", line: "Blue-white flame licks up around your whole body." },
  { id: "solar-aura", name: "Solar Aura", engine: "aura", variant: "flare-solar", rarity: "holo", element: "light", home: "body", line: "A gold aura blazes up around you like a small sun." },
  { id: "prism", name: "Prism", engine: "aura", variant: "prism", rarity: "holo", element: "light", home: "body", line: "Your outline glows through every color, like light through a prism." },
  { id: "crimson-aura", name: "Crimson Aura", engine: "aura", variant: "flare-crimson", rarity: "ultra", element: "fire", home: "body", bonus: "heartbeat", line: "A red aura roars up off you. People step aside." },
  { id: "shadow-aura", name: "Shadow Aura", engine: "aura", variant: "flare-shadow", rarity: "ultra", element: "cosmic", home: "body", bonus: "heartbeat", line: "Dark flame with a violet edge rises off you." },
];

/** Standard on the Cooling Headband and the visor, whatever the serial. */
export const RUNNER_HUD: Card = {
  id: "runner-hud",
  name: "Runner HUD",
  engine: "hud",
  rarity: "common",
  element: "storm",
  home: "head",
  regions: [],
  fixed: true,
  line: "Pace, heart rate, distance and splits float beside you. Simulated here; a watch feeds it for real.",
};

/** HUD themes the owner can switch between at any time. */
export const HUD_THEMES = [
  { id: "chrome", label: "Chrome", color: "#7ff0ff" },
  { id: "heat", label: "Heat", color: "#ffa25a" },
  { id: "night", label: "Night vision", color: "#8dff9a" },
  { id: "rose", label: "Rose", color: "#ffb0c4" },
  { id: "gold", label: "Gold", color: "#ffd772" },
  { id: "mono", label: "Mono", color: "#f2efe8" },
] as const;

export type HudTheme = (typeof HUD_THEMES)[number]["id"];

const HOME_ORDER: Home[] = ["top", "bottom", "feet", "head", "body"];

/**
 * The set in print order: by home, then rarity. Secret rares come
 * last and number past the set size, the way trading cards do it.
 */
export const cards: Card[] = defs
  .map((d) => ({ ...d, regions: d.regions ?? ALL }) as Card)
  .sort((a, b) => {
    const sa = a.rarity === "secret" ? 1 : 0;
    const sb = b.rarity === "secret" ? 1 : 0;
    if (sa !== sb) return sa - sb;
    const h = HOME_ORDER.indexOf(a.home) - HOME_ORDER.indexOf(b.home);
    return h || tier(a.rarity) - tier(b.rarity);
  });

/** cards that aren't secret: the number printed after the slash */
export const SET_SIZE = cards.filter((c) => c.rarity !== "secret").length;

export const cardById = (id: string) => (id === RUNNER_HUD.id ? RUNNER_HUD : cards.find((c) => c.id === id));

/** "014/053" */
export function setNumber(c: Card): string {
  const n = cards.indexOf(c) + 1;
  const w = String(SET_SIZE).length;
  return `${String(n).padStart(w, "0")}/${SET_SIZE}`;
}

export const HOME_LABEL: Record<Home, string> = {
  top: "Tops",
  bottom: "Bottoms",
  feet: "Shoes",
  head: "Hats",
  body: "Body glows",
};

export const poolFor = (region: Region) => cards.filter((c) => c.regions.includes(region));

/* ─────────────────────────── the roll ─────────────────────────── */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, and the same on every device */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A card's share of its tier: three times as likely when it matches the
 * finish's type. Body glows can come out of any garment, so they're
 * weighted down a little to leave room for the garment's own effects.
 */
const weight = (c: Card, type: Element) => (c.element === type ? 3 : 1) * (c.home === "body" ? 0.6 : 1);

/**
 * The effect sealed in a unit. Same product, finish and serial in,
 * same card out, on any device. Rarity first, by the published odds;
 * then a card of that rarity from the garment's pool, weighted toward
 * the finish's type. A tier with nothing in the pool drops to the
 * next one down.
 */
export function rollCard(seed: string, region: Region, finish: FinishId): Card {
  const r = rng(hash(seed));
  const x = r();
  let t = 0;
  let acc = 0;
  for (let i = 0; i < RARITIES.length; i++) {
    acc += RARITIES[i].odds;
    if (x < acc) {
      t = i;
      break;
    }
    t = i;
  }
  const pool = poolFor(region);
  const type = FINISH_TYPE[finish];
  for (let i = t; i >= 0; i--) {
    const tierCards = pool.filter((c) => c.rarity === RARITIES[i].id);
    if (!tierCards.length) continue;
    const w = tierCards.map((c) => weight(c, type));
    let pick = r() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < tierCards.length; k++) {
      pick -= w[k];
      if (pick <= 0) return tierCards[k];
    }
    return tierCards[tierCards.length - 1];
  }
  return pool[0];
}

/** chance of each card in a garment's pool for a finish, for the odds table */
export function cardOdds(region: Region, finish: FinishId): Map<string, number> {
  const pool = poolFor(region);
  const type = FINISH_TYPE[finish];
  const out = new Map<string, number>();
  let carry = 0;
  // walk tiers top-down so an empty tier's odds fall to the one below
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    const odds = RARITIES[i].odds + carry;
    const tierCards = pool.filter((c) => c.rarity === RARITIES[i].id);
    if (!tierCards.length) {
      carry = odds;
      continue;
    }
    carry = 0;
    const w = tierCards.map((c) => weight(c, type));
    const sum = w.reduce((a, b) => a + b, 0);
    tierCards.forEach((c, k) => out.set(c.id, (odds * w[k]) / sum));
  }
  return out;
}
