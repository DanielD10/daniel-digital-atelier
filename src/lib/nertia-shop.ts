/**
 * NERTIA — the Drop 001 catalog, as shown on the product sheets.
 *
 * Prices, size runs and features come from the sheets themselves.
 * Where a sheet doesn't give something (the women's line has no
 * prices; most pieces have no size run yet) it stays empty and the
 * shop says so, rather than inventing it.
 */

import { finishes, type FinishId, type Region, type Unit } from "./nertia";
import { FINISH_TYPE, type Card } from "./nertia-cards";

export type ShopCategory = "singlets" | "tees" | "shorts" | "womens" | "accessories";
export type Fit = "M" | "W";

/** An image cropped from a product sheet, in /images/nertia/shop/. */
export type Shot = { src: string; w: number; h: number; contain?: boolean };

export type ProductFinish = {
  id: FinishId;
  /** shot per fit; a missing fit means the finish isn't made in it */
  M?: Shot;
  W?: Shot;
  /** made in this fit but not photographed on the sheet */
  unshot?: Fit[];
};

export type Product = {
  id: string;
  name: string;
  cat: ShopCategory;
  /** USD; null = not on the sheet yet */
  price: number | null;
  badge?: string;
  /** numbered units in Drop 001; null = not set */
  run: number | null;
  tagline: string;
  /** size run per fit, when the sheet gives one */
  sizes?: Partial<Record<Fit, string[]>>;
  sizeNote?: string;
  features: [string, string][];
  finishes: ProductFinish[];
  details: { shot: Shot; label: string }[];
  /** product sheet id in the lookbook */
  sheet: string;
  /** how the AR demo wears it; absent = no AR try-on */
  ar?: {
    region: Region;
    sleeves?: boolean;
    inseam?: number;
    headgear?: Unit["headgear"];
    /** an effect the piece always carries instead of a pull */
    fixed?: string;
  };
  fitNote?: Partial<Record<Fit, string>>;
  /** one design for everyone: no fit choice */
  unisex?: boolean;
};

const shot = (src: string, w: number, h: number, contain = false): Shot => ({ src, w, h, contain });
const RUN = ["XS", "S", "M", "L", "XL", "2XL"];
const range = (from: string, to: string) => RUN.slice(RUN.indexOf(from), RUN.indexOf(to) + 1);

export const catalog: Product[] = [
  {
    id: "first-law",
    name: "First Law Singlet",
    cat: "singlets",
    price: 95,
    run: 140,
    tagline: "The everyday singlet. Liquid performance, zero distractions.",
    sizes: { M: range("M", "2XL"), W: range("XS", "XL") },
    features: [
      ["Solution-dyed yarns", "Color lives in the fiber, not painted on"],
      ["Shift woven", "Ultra-light knit that never clings"],
      ["No-chafe seams", "Built to outlive the grind"],
      ["Reflective logo", "The + catches headlights"],
      ["Tested to 50 washes", "Or we repair or replace it"],
    ],
    finishes: [
      { id: "liquid-chrome", M: shot("firstlaw-m-liquid-chrome", 300, 415), W: shot("firstlaw-w-liquid-chrome", 300, 444) },
      { id: "deep-space", M: shot("firstlaw-m-deep-space", 300, 380), W: shot("firstlaw-w-deep-space", 300, 460) },
      { id: "green-shift", M: shot("firstlaw-m-green-shift", 300, 380), W: shot("firstlaw-w-green-shift", 300, 462) },
      { id: "peach-shift", W: shot("firstlaw-w-peach-shift", 300, 466) },
    ],
    details: [
      { shot: shot("firstlaw-d-logo", 300, 151), label: "Reflective logo" },
      { shot: shot("firstlaw-d-fade", 300, 146), label: "Liquid fade finish" },
      { shot: shot("firstlaw-d-seams", 300, 144), label: "No-chafe seams" },
      { shot: shot("firstlaw-d-move", 300, 146), label: "Built to move" },
    ],
    sheet: "first-law",
    ar: { region: "top" },
  },
  {
    id: "full-reflect",
    name: "Full Reflect Singlet LTD",
    cat: "singlets",
    price: 130,
    badge: "LTD · 40 units",
    run: 40,
    tagline: "Event-night exclusive. Grey by day, white fire in headlights.",
    sizes: { M: range("XS", "2XL"), W: range("XS", "XL") },
    features: [
      ["Retroreflective finish", "Grey by day, white fire in headlights"],
      ["Reflective taping", "Down the back, for visibility"],
      ["Reflective drawcord", "Secure and adjustable"],
      ["Tested to 50 washes", "Performance that lasts"],
      ["Free repair or replace", "If it fails, we fix it"],
    ],
    finishes: [
      { id: "full-reflect", M: shot("reflect-m-full-reflect", 300, 846), W: shot("reflect-w-full-reflect", 300, 963) },
    ],
    details: [
      { shot: shot("reflect-d-fabric", 300, 273), label: "Full Reflect finish" },
      { shot: shot("reflect-d-tape", 300, 270), label: "Reflective taping" },
      { shot: shot("reflect-d-cord", 300, 238), label: "Reflective drawcord" },
    ],
    sheet: "full-reflect",
    ar: { region: "top" },
  },
  {
    id: "tee",
    name: "Performance Tee",
    cat: "tees",
    price: 110,
    run: 120,
    tagline: "Lightweight, breathable, all-day comfort. Built to move, designed to shift.",
    sizeNote: "Size run confirmed at presale",
    features: [
      ["UPF 50", "Sun protection"],
      ["Featherlight", "Four-way stretch"],
      ["Color dyed into the fiber", "Shift woven into the fabric"],
      ["Reflective details", "Front and back"],
      ["Tested to 50 washes", "Free repair or replace"],
    ],
    finishes: [
      { id: "heat-shift", M: shot("tee-m-heat-shift", 300, 354), W: shot("tee-w-heat-shift", 300, 471) },
      { id: "deep-space", M: shot("tee-m-deep-space", 300, 359), W: shot("tee-w-deep-space", 300, 486) },
      { id: "green-shift", M: shot("tee-m-green-shift", 300, 359), W: shot("tee-w-green-shift", 300, 486) },
      { id: "peach-shift", W: shot("tee-w-peach-shift", 300, 486) },
    ],
    details: [
      { shot: shot("tee-d-light", 300, 267), label: "Lightweight, breathable" },
      { shot: shot("tee-d-woven", 300, 267), label: "Shift woven" },
      { shot: shot("tee-d-reflect", 300, 262), label: "Reflective details" },
    ],
    sheet: "tee",
    ar: { region: "top", sleeves: true },
  },
  {
    id: "split-short",
    name: '5" Split Short',
    cat: "shorts",
    price: 140,
    badge: "Hero product",
    run: 120,
    tagline: "Built for speed. Made to move.",
    sizeNote: "Size run confirmed at presale",
    features: [
      ["Lightweight", "Four-way stretch"],
      ["Quick dry", "Sweat wicking"],
      ['5" inseam', "Unrestricted, with a side split"],
      ["Secure waistband", "Zip pocket, locks in, no bunch"],
      ["Built-in liner", "Internal drawcord"],
    ],
    fitNote: { W: "Higher rise for coverage and confidence" },
    finishes: [
      { id: "deep-space", M: shot("split-m-deep-space", 306, 352), W: shot("split-w-deep-space", 306, 358) },
      { id: "heat-shift", M: shot("split-m-heat-shift", 302, 352), W: shot("split-w-heat-shift", 302, 358) },
      { id: "green-shift", M: shot("split-m-green-shift", 300, 352), W: shot("split-w-green-shift", 300, 358) },
    ],
    details: [
      { shot: shot("split-d-side", 300, 252), label: "Side split" },
      { shot: shot("split-d-waist", 300, 244), label: "Zip pocket waistband" },
      { shot: shot("split-d-liner", 300, 242), label: "Built-in liner" },
      { shot: shot("split-d-cord", 300, 245), label: "Internal drawcord" },
      { shot: shot("split-d-fabric", 300, 246), label: "Liquid Series fabric" },
    ],
    sheet: "split-short",
    ar: { region: "bottom", inseam: 0.36 },
  },
  {
    id: "lined-short",
    name: '3" Lined Short',
    cat: "shorts",
    price: 140,
    badge: "Women's exclusive",
    run: 60,
    tagline: "High rise. No distractions. Built to move.",
    sizeNote: "Size run confirmed at presale",
    features: [
      ['4" high-rise waistband', "Wide, stays put"],
      ['3" inseam', "With a built-in liner"],
      ["Drop-in pocket", "Holds small essentials securely"],
      ["Moisture wicking", "Four-way stretch"],
      ["Women-only pattern", "Engineered for the female form"],
    ],
    finishes: [
      { id: "bone-pearl", W: shot("lined-w-bone-pearl", 300, 707) },
      { id: "liquid-chrome", W: shot("lined-w-liquid-chrome", 300, 707) },
      { id: "green-shift", W: shot("lined-w-green-shift", 300, 700) },
      { id: "peach-shift", W: shot("lined-w-peach-shift", 300, 694) },
    ],
    details: [
      { shot: shot("lined-d-back", 364, 414), label: "Secure fit" },
      { shot: shot("lined-d-liner", 300, 510), label: "Liner with drop-in pocket" },
      { shot: shot("lined-d-rear", 332, 414), label: "Built to perform" },
    ],
    sheet: "lined-short",
    ar: { region: "bottom", inseam: 0.28 },
  },
  {
    id: "motion-bra",
    name: "Motion Bra",
    cat: "womens",
    price: null,
    run: null,
    tagline: "Medium support, laser-perforated where you need air.",
    sizeNote: "Pricing and size run at presale",
    features: [
      ["Medium support", "Secure feel with freedom to move"],
      ["Laser perf zones", "Ventilation where you need it most"],
      ["Premium construction", "Durable, sweat-wicking"],
      ["Tested to 50 washes", "Free repair or replace"],
    ],
    finishes: [
      { id: "peach-shift", W: shot("women-look-0", 300, 782) },
      { id: "green-shift", W: shot("women-look-1", 300, 776) },
      { id: "deep-space", W: shot("women-look-2", 300, 776) },
      { id: "bone-pearl", unshot: ["W"] },
    ],
    details: [{ shot: shot("women-d-bra", 408, 210, true), label: "Front, back, Deep Space" }],
    sheet: "womens-line",
    ar: { region: "top" },
  },
  {
    id: "half-tight",
    name: "Motion Half Tight",
    cat: "womens",
    price: null,
    run: null,
    tagline: "No front seam, high-rise sculpt waistband.",
    sizeNote: "Pricing and size run at presale",
    features: [
      ["No front seam", "Half tight for ultimate comfort"],
      ["High-rise sculpt waistband", "Stays put, shapes and supports"],
      ["Premium construction", "Durable, sweat-wicking"],
      ["Tested to 50 washes", "Free repair or replace"],
    ],
    finishes: [
      { id: "bone-pearl", W: shot("women-look-7", 300, 776) },
      { id: "peach-shift", W: shot("women-look-0", 300, 782) },
      { id: "green-shift", W: shot("women-look-1", 300, 776) },
      { id: "deep-space", W: shot("women-look-2", 300, 776) },
    ],
    details: [
      { shot: shot("women-d-tight", 372, 210, true), label: "Peach, Green, Deep Space" },
      { shot: shot("women-look-6", 300, 776), label: "With a Peach Shift singlet" },
      { shot: shot("women-look-8", 300, 776), label: "With a Deep Space singlet" },
    ],
    sheet: "womens-line",
    ar: { region: "bottom", inseam: 0.72 },
  },
  {
    id: "bra-tank",
    name: "Longline Bra Tank",
    cat: "womens",
    price: null,
    run: null,
    tagline: "A tank with a built-in bra. Medium support.",
    sizeNote: "Pricing and size run at presale",
    features: [
      ["Medium support", "Built-in longline bra"],
      ["Racer back", "Freedom through the shoulders"],
      ["Premium construction", "Durable, sweat-wicking"],
      ["Tested to 50 washes", "Free repair or replace"],
    ],
    finishes: [
      { id: "peach-shift", W: shot("women-look-3", 300, 776) },
      { id: "bone-pearl", W: shot("women-look-4", 300, 776) },
      { id: "deep-space", W: shot("women-look-5", 300, 782) },
      { id: "green-shift", unshot: ["W"] },
    ],
    details: [{ shot: shot("women-d-tank", 412, 210, true), label: "Peach front and back, Pearl, Deep Space" }],
    sheet: "womens-line",
    ar: { region: "top" },
  },
  {
    id: "run-cap",
    name: "No-Stain Run Cap",
    cat: "accessories",
    price: 48,
    run: null,
    tagline: "Stay in motion. No sweat stains, all distance.",
    sizeNote: "One size · adjustable buckle",
    features: [
      ["No sweat stains", "Salt-ring resistant fabric keeps you looking fresh"],
      ["Laser perf venting", "Max airflow, stay cool"],
      ["Quick-dry sweatband", "Wicks sweat, dries fast"],
      ["Adjustable fit", "Low-profile buckle, ponytail ready"],
      ["Reflective logo", "More visibility, more miles"],
      ["Tested to 50 washes", "Free repair or replace"],
    ],
    finishes: [
      { id: "full-reflect", M: shot("cap-u-full-reflect", 300, 159, true), W: shot("cap-u-full-reflect", 300, 159, true) },
      { id: "deep-space", M: shot("cap-u-deep-space", 300, 159, true), W: shot("cap-u-deep-space", 300, 159, true) },
      { id: "bone-pearl", M: shot("cap-u-bone-pearl", 300, 159, true), W: shot("cap-u-bone-pearl", 300, 159, true) },
      { id: "green-shift", M: shot("cap-u-green-shift", 300, 159, true), W: shot("cap-u-green-shift", 300, 159, true) },
    ],
    details: [
      { shot: shot("cap-hero", 500, 370, true), label: "Full Reflect" },
      { shot: shot("cap-d-front", 300, 202), label: "Front view" },
      { shot: shot("cap-d-side", 300, 202), label: "Laser perf venting" },
      { shot: shot("cap-d-back", 300, 217), label: "Adjustable back" },
      { shot: shot("cap-d-interior", 300, 207), label: "Quick-dry sweatband" },
      { shot: shot("cap-d-fabric", 300, 203), label: "No-stain fabric" },
      { shot: shot("cap-d-men", 308, 222), label: "Men's" },
      { shot: shot("cap-d-women", 300, 230), label: "Women's" },
      { shot: shot("cap-d-pony", 300, 314), label: "Ponytail ready" },
    ],
    sheet: "run-cap",
    unisex: true,
    ar: { region: "head", headgear: "cap" },
  },
  {
    id: "cooling-headband",
    name: "Cooling Headband",
    cat: "accessories",
    price: 24,
    run: null,
    tagline: "Lightweight. Cooling. Zero distractions.",
    sizeNote: "One size",
    features: [
      ["Cooling knit", "Keeps you cool even on hot runs"],
      ["Sweat wicking", "Pulls sweat away, stays dry"],
      ["No-slip grip", "Silicone interior stays in place"],
      ["Lightweight fit", "Ultra-light, barely there"],
      ["Reflective detail", "More visibility, more miles"],
      ["Tested to 50 washes", "Free repair or replace"],
    ],
    finishes: [
      { id: "deep-space", M: shot("band-u-deep-space", 300, 200, true), W: shot("band-u-deep-space", 300, 200, true) },
      { id: "heat-shift", M: shot("band-u-heat-shift", 300, 203, true), W: shot("band-u-heat-shift", 300, 203, true) },
      { id: "green-shift", M: shot("band-u-green-shift", 300, 203, true), W: shot("band-u-green-shift", 300, 203, true) },
      { id: "peach-shift", W: shot("band-u-peach-shift", 300, 203, true) },
      { id: "bone-pearl", M: shot("band-u-bone-pearl", 300, 201, true), W: shot("band-u-bone-pearl", 300, 201, true) },
    ],
    details: [
      { shot: shot("band-hero", 520, 369, true), label: "Deep Space" },
      { shot: shot("band-d-front", 300, 172), label: "Front view" },
      { shot: shot("band-d-grip", 300, 172), label: "Silicone no-slip grip" },
      { shot: shot("band-d-side", 300, 172), label: "Contoured fit" },
      { shot: shot("band-d-knit", 300, 170), label: "Cooling knit" },
      { shot: shot("band-d-reflect", 300, 174), label: "Reflective detail" },
      { shot: shot("band-d-men", 300, 338), label: "Men's" },
      { shot: shot("band-d-women", 300, 311), label: "Women's" },
      { shot: shot("band-d-men-side", 300, 274), label: "Men's, side" },
      { shot: shot("band-d-women-side", 300, 239), label: "Women's, side" },
    ],
    sheet: "cooling-headband",
    ar: { region: "head", headgear: "band", fixed: "runner-hud" },
  },
  {
    id: "motion-pouch",
    name: "Motion Pouch",
    cat: "accessories",
    price: 50,
    run: 150,
    tagline: "Designed to disappear, built to move. Waist or crossbody.",
    sizes: { M: range("S", "XL"), W: range("S", "XL") },
    sizeNote: "Belt sizes",
    features: [
      ["One body", "Sleek, pack light"],
      ["Secure storage", "Zip it, lock it"],
      ["Water resistant", "Sweat, rain, no worries"],
      ["Waist or crossbody", "Low-profile, comfortable all day"],
      ["Tested to 50 washes", "Free repair or replace"],
    ],
    finishes: [
      { id: "full-reflect", M: shot("pouch-u-full-reflect", 392, 118, true), W: shot("pouch-u-full-reflect", 392, 118, true) },
      { id: "deep-space", M: shot("pouch-u-deep-space", 346, 118, true), W: shot("pouch-u-deep-space", 346, 118, true) },
      { id: "green-shift", M: shot("pouch-u-green-shift", 392, 118, true), W: shot("pouch-u-green-shift", 392, 118, true) },
    ],
    details: [
      { shot: shot("pouch-hero", 520, 216, true), label: "Full Reflect, orange zip" },
      { shot: shot("pouch-d-men", 388, 288), label: "Men's, waist front and back" },
      { shot: shot("pouch-d-women", 376, 288), label: "Women's, waist front and back" },
      { shot: shot("pouch-d-cross", 400, 314), label: "Crossbody" },
    ],
    sheet: "pouch",
    unisex: true,
  },
];

export const shopCategories: { id: ShopCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "singlets", label: "Singlets" },
  { id: "tees", label: "Tees" },
  { id: "shorts", label: "Shorts" },
  { id: "womens", label: "Women's line" },
  { id: "accessories", label: "Accessories" },
];

export const fitsOf = (p: Product): Fit[] =>
  (["M", "W"] as Fit[]).filter((f) => p.finishes.some((x) => x[f] || x.unshot?.includes(f)));

export const finishMadeIn = (pf: ProductFinish, fit: Fit) => !!pf[fit] || !!pf.unshot?.includes(fit);

/** The best shot for a finish and fit, falling back to the product's first shot. */
export function shotFor(p: Product, finish: FinishId, fit: Fit): { shot: Shot; shownIn?: FinishId } {
  const pf = p.finishes.find((x) => x.id === finish);
  const own = pf?.[fit] ?? pf?.[fit === "M" ? "W" : "M"];
  if (own) return { shot: own };
  for (const x of p.finishes) {
    const s = x[fit] ?? x.M ?? x.W;
    if (s) return { shot: s, shownIn: x.id };
  }
  return { shot: p.details[0].shot };
}

export const priceLabel = (p: Product) => (p.price === null ? "Presale pricing" : `$${p.price}`);

/* ─────────────────────────── packs ─────────────────────────── */

/** Anything that can be opened in AR: the shop's pieces plus the concepts. */
export type PackItem = {
  id: string;
  name: string;
  run: number | null;
  ar: NonNullable<Product["ar"]>;
  /** every finish and fit it's made in */
  options: { finish: FinishId; fit: Fit }[];
  concept?: boolean;
};

const both = (fs: FinishId[]) => fs.flatMap((finish) => (["M", "W"] as Fit[]).map((fit) => ({ finish, fit })));

/** Pieces outside Drop 001, labelled as concepts wherever they show up. */
const CONCEPTS: PackItem[] = [
  { id: "motion-runner", name: "Motion Runner", run: 100, ar: { region: "feet" }, concept: true, options: both(["heat-shift", "liquid-chrome", "deep-space", "full-reflect", "green-shift"]) },
  { id: "trail-runner", name: "Trail Runner", run: 100, ar: { region: "feet" }, concept: true, options: both(["deep-space", "green-shift", "heat-shift"]) },
  { id: "race-visor", name: "Race Visor", run: 80, ar: { region: "head", headgear: "visor", fixed: "runner-hud" }, concept: true, options: both(["liquid-chrome", "full-reflect", "deep-space"]) },
  { id: "thermal-beanie", name: "Thermal Beanie", run: 80, ar: { region: "head", headgear: "beanie" }, concept: true, options: both(["heat-shift", "deep-space", "bone-pearl"]) },
];

export const packItems: PackItem[] = [
  ...catalog
    .filter((p) => p.ar)
    .map((p) => ({
      id: p.id,
      name: p.name,
      run: p.run,
      ar: p.ar!,
      options: p.finishes.flatMap((pf) => (["M", "W"] as Fit[]).filter((f) => finishMadeIn(pf, f)).map((fit) => ({ finish: pf.id, fit }))),
    })),
  ...CONCEPTS,
];

/**
 * A sealed unit of any piece and finish, pulled from the run like a
 * pack off the shelf. Its effect is rolled from its serial and revealed
 * when the chip is first read. Pieces without a set run yet get a demo
 * serial; the certificate says so.
 */
export function showroomUnit(productId: string, finish: FinishId, fit: Fit, serial?: number): Unit | null {
  const p = packItems.find((x) => x.id === productId);
  if (!p || !finishes[finish]) return null;
  const run = p.run ?? 100;
  const unit = serial ?? 1 + Math.floor(Math.random() * run);
  return {
    id: `pull-${productId}-${finish}-${fit}-${unit}`,
    product: p.name,
    fit,
    finish,
    region: p.ar.region,
    sleeves: p.ar.sleeves,
    inseam: p.ar.inseam,
    headgear: p.ar.headgear,
    unit,
    of: run,
    washes: 0,
    miles: 0,
    showroom: true,
    sealed: !p.ar.fixed,
    card: p.ar.fixed,
    hud: p.ar.fixed ? "chrome" : undefined,
    concept: p.concept,
    demoSerial: p.run === null,
  };
}

/** A random sealed unit of any piece worn as `region`. */
export function packFor(region: Region): Unit {
  // pieces with a fixed effect have nothing to reveal
  const items = packItems.filter((p) => p.ar.region === region && !p.ar.fixed);
  const p = items[Math.floor(Math.random() * items.length)];
  const o = p.options[Math.floor(Math.random() * p.options.length)];
  return showroomUnit(p.id, o.finish, o.fit)!;
}

/** Pieces the set view dresses a card's preview in, by where it's worn. */
const PREVIEW_PIECE: Record<Region, string> = {
  top: "first-law",
  bottom: "split-short",
  feet: "motion-runner",
  head: "run-cap",
};

/**
 * A unit wearing any card from the set, for previewing it on the stage.
 * The finish is one whose type matches the card where the piece comes
 * in one; body glows keep whatever piece is on stage now.
 */
export function previewUnit(card: Card, current: Unit): Unit {
  const region: Region = card.home === "body" ? current.region : card.home;
  const item = card.home === "body" ? null : packItems.find((p) => p.id === PREVIEW_PIECE[region]);
  if (!item) {
    return { ...current, id: `preview-${card.id}`, card: card.id, sealed: false, preview: true, showroom: true, hud: undefined };
  }
  const match = item.options.find((o) => FINISH_TYPE[o.finish] === card.element) ?? item.options[0];
  const u = showroomUnit(item.id, match.finish, match.fit, 1)!;
  return { ...u, id: `preview-${card.id}`, card: card.id, sealed: false, preview: true };
}
