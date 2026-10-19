/**
 * The NERTIA Race simulation. No DOM in here: it steps a club race in
 * race seconds and the view draws whatever state it finds.
 *
 * Distance is what's credited to a runner, not what their legs did:
 * a freeze stops their distance counting while the clock runs, a
 * Headwind credits 75% of each step, a Gel jumps them forward. Each
 * runner also carries `xNat`, the distance they'd have without any
 * items, so the results can show exactly what the items were worth.
 */

import { ABILITIES, ability, type AbilityId } from "@/lib/nertia-race";

/** The demo race: a mile, sped up four times. */
export const RACE_M = 1609;
export const SPEEDUP = 4;
export const BOX_ROWS = [150, 350, 550, 750, 950, 1150, 1350];
/** race seconds of warning before a Headwind lands */
export const WARN = 5;

const SURGE = 1.1;
const DRAIN = 0.065;
const REGEN = 0.024;

export type Team = 0 | 1;

type SpeedTag = "tailwind" | "headwind" | "bonk" | "rally" | "hill";

export type Fx =
  | { k: "speed"; mul: number; until: number; tag: SpeedTag }
  | { k: "high"; until: number }
  | { k: "kick"; until: number }
  | { k: "freeze"; until: number }
  | { k: "shield"; until: number }
  | { k: "mirror"; until: number }
  | { k: "fog"; until: number }
  | { k: "pacer"; until: number }
  | { k: "detour"; left: number }
  | { k: "line"; until: number; leader: number };

export type Runner = {
  i: number;
  name: string;
  short: string;
  team: Team;
  you: boolean;
  /** m/s at even effort */
  base: number;
  x: number;
  xNat: number;
  lane: number;
  stamina: number;
  surging: boolean;
  item: AbilityId | null;
  /** taps left on a Gel Pack */
  charges: number;
  fx: Fx[];
  finish: number | null;
  /** seconds the items were worth to this runner; positive = time saved */
  itemSec: number;
  ai: { skill: number; think: number; wait: number };
};

export type Hit = {
  kind: AbilityId;
  from: number;
  to: number;
  launched: number;
  at: number;
  dodge: boolean;
  reflected?: boolean;
};

export type Trap = { x: number; owner: number; team: Team; born: number };

export type Tone = "you" | "team" | "rival" | "info";
export type FeedItem = { t: number; text: string; tone: Tone };

/** one-off moments for the view to animate */
export type Pop = { kind: string; runner: number; t: number; good: boolean };

const ROSTER: { name: string; team: Team; base: number; you?: boolean; skill: number }[] = [
  { name: "Dre", team: 1, base: 4.28, skill: 0.7 },
  { name: "Maya", team: 0, base: 4.25, skill: 0.65 },
  { name: "Kim", team: 1, base: 4.15, skill: 0.55 },
  { name: "You", team: 0, base: 4.15, you: true, skill: 0 },
  { name: "Luis", team: 1, base: 4.03, skill: 0.45 },
  { name: "Sam", team: 0, base: 4.02, skill: 0.5 },
];

export const TEAM_NAMES = ["Blue", "Orange"] as const;
export const POINTS = [6, 5, 4, 3, 2, 1];

export class Race {
  t = 0;
  runners: Runner[];
  hits: Hit[] = [];
  traps: Trap[] = [];
  feed: FeedItem[] = [];
  pops: Pop[] = [];
  done = false;

  constructor() {
    this.runners = ROSTER.map((r, i) => ({
      i,
      name: r.name,
      short: r.name === "You" ? "YOU" : r.name.slice(0, 2).toUpperCase(),
      team: r.team,
      you: !!r.you,
      base: r.base,
      x: 0,
      xNat: 0,
      lane: i,
      stamina: 1,
      surging: false,
      item: null,
      charges: 0,
      fx: [],
      finish: null,
      itemSec: 0,
      ai: { skill: r.skill, think: Math.random() * 0.4, wait: 0 },
    }));
  }

  get you() {
    return this.runners.find((r) => r.you)!;
  }

  /** finishers by time, then everyone else by distance */
  standings(): Runner[] {
    return [...this.runners].sort((a, b) => {
      if (a.finish !== null && b.finish !== null) return a.finish - b.finish;
      if (a.finish !== null) return -1;
      if (b.finish !== null) return 1;
      return b.x - a.x;
    });
  }

  placeOf(r: Runner) {
    return this.standings().indexOf(r) + 1;
  }

  has(r: Runner, k: Fx["k"]) {
    return r.fx.some((f) => f.k === k && (!("until" in f) || f.until > this.t));
  }

  private say(text: string, who: Runner | null) {
    const tone: Tone = !who ? "info" : who.you ? "you" : who.team === this.you.team ? "team" : "rival";
    this.feed.unshift({ t: this.t, text, tone });
    if (this.feed.length > 7) this.feed.pop();
  }

  private pop(kind: string, r: Runner, good: boolean) {
    this.pops.push({ kind, runner: r.i, t: this.t, good });
    if (this.pops.length > 40) this.pops.shift();
  }

  /* ───────────── targeting ───────────── */

  private live(r: Runner) {
    return r.finish === null;
  }
  private hidden(r: Runner) {
    return this.has(r, "fog");
  }
  private rivals(r: Runner) {
    return this.runners.filter((o) => o.team !== r.team && this.live(o) && !this.hidden(o));
  }
  private mates(r: Runner) {
    return this.runners.filter((o) => o.team === r.team && o !== r && this.live(o));
  }
  aheadRival(r: Runner, range = Infinity) {
    return this.rivals(r)
      .filter((o) => o.x > r.x && o.x - r.x <= range)
      .sort((a, b) => a.x - b.x)[0];
  }
  behindRival(r: Runner, range: number) {
    return this.rivals(r)
      .filter((o) => o.x < r.x && r.x - o.x <= range)
      .sort((a, b) => b.x - a.x)[0];
  }
  private leaderRival(r: Runner) {
    return this.rivals(r).sort((a, b) => b.x - a.x)[0];
  }

  /* ───────────── items ───────────── */

  private roll(r: Runner, bucket?: 0 | 1 | 2) {
    const place = this.placeOf(r);
    const b = bucket ?? (place <= 2 ? 0 : place <= 4 ? 1 : 2);
    const solo = this.mates(r).length === 0;
    const pool = ABILITIES.map((a) => ({ id: a.id, w: solo && a.kind === "team" ? 0 : a.odds[b] }));
    let pick = Math.random() * pool.reduce((s, p) => s + p.w, 0);
    for (const p of pool) {
      pick -= p.w;
      if (pick <= 0) return p.id;
    }
    return pool[0].id;
  }

  /** hands a runner an item, filling a Gel Pack */
  private give(r: Runner, id: AbilityId, charges?: number) {
    r.item = id;
    r.charges = id === "gel-pack" ? (charges ?? 3) : 0;
  }

  private addSpeed(r: Runner, mul: number, secs: number, tag: SpeedTag) {
    r.fx.push({ k: "speed", mul, until: this.t + secs, tag });
  }

  /**
   * Fires a runner's item. Returns false (and keeps the item) when
   * there's nothing to use it on, so a tap at the wrong moment isn't
   * wasted.
   */
  use(r: Runner): boolean {
    const id = r.item;
    if (!id || !this.live(r)) return false;
    const a = ability(id);
    const fire = (to: Runner, delay: number, dodge: boolean) =>
      this.hits.push({ kind: id, from: r.i, to: to.i, launched: this.t, at: this.t + delay, dodge });

    switch (id) {
      case "tailwind":
        this.addSpeed(r, 1.2, 10, "tailwind");
        break;
      case "gel":
        r.x += r.base * 6;
        break;
      case "gel-pack": {
        r.x += r.base * 2.5;
        r.charges -= 1;
        this.pop(id, r, true);
        if (r.charges > 0) {
          this.say(`${r.name} used a Gel (${r.charges} left)`, r);
          r.ai.wait = 1 + Math.random() * 3;
          return true;
        }
        this.say(`${r.name} used the last Gel`, r);
        r.item = null;
        return true;
      }
      case "runners-high":
        r.fx = r.fx.filter((f) => !(f.k === "freeze" || f.k === "detour" || (f.k === "speed" && f.mul < 1)));
        r.fx.push({ k: "high", until: this.t + 8 });
        break;
      case "kick":
        if (RACE_M - r.x > 400) return this.nope(r, "Kick works in the last 400 m. Save it");
        r.fx.push({ k: "kick", until: Infinity });
        break;
      case "second-wind":
        r.stamina = 1;
        r.fx = r.fx.filter((f) => !(f.k === "freeze" || f.k === "detour" || (f.k === "speed" && f.mul < 1)));
        break;
      case "pacer":
        r.fx.push({ k: "pacer", until: this.t + 20 });
        break;
      case "slingshot": {
        const tgt = this.aheadRival(r, 20);
        if (tgt) r.x = tgt.x + 5;
        else this.addSpeed(r, 1.1, 5, "tailwind");
        break;
      }
      case "headwind": {
        const tgt = this.aheadRival(r);
        if (!tgt) return this.nope(r, "Nobody ahead to hit");
        fire(tgt, WARN, true);
        this.say(`${r.name} threw a Headwind at ${tgt.name}`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "cramp": {
        const tgt = this.leaderRival(r);
        if (!tgt) return this.nope(r, "No leader to hit");
        fire(tgt, Math.max(1.5, Math.abs(tgt.x - r.x) / 22), false);
        this.say(`${r.name} sent a Cramp after ${tgt.name}`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "pothole":
        this.traps.push({ x: r.x - 1.5, owner: r.i, team: r.team, born: this.t });
        break;
      case "detour": {
        const tgt = this.aheadRival(r);
        if (!tgt) return this.nope(r, "Nobody ahead to detour");
        fire(tgt, 1.5, false);
        this.say(`${r.name} sent ${tgt.name} on a Detour`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "static": {
        const near = this.rivals(r).filter((o) => Math.abs(o.x - r.x) <= 30 && o.item);
        near.forEach((o) => {
          o.item = null;
          this.pop("lost", o, false);
        });
        this.say(near.length ? `${r.name}'s Static wiped ${near.map((o) => o.name).join(" and ")}` : `${r.name} used Static. Nobody close was holding anything`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "bonk": {
        const ahead = this.rivals(r).filter((o) => o.x > r.x);
        if (!ahead.length) return this.nope(r, "Nobody ahead to Bonk");
        ahead.forEach((o) => fire(o, 1, false));
        this.say(`${r.name} Bonked everyone ahead`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "hill": {
        const back = this.rivals(r).filter((o) => o.x < r.x && r.x - o.x <= 40);
        if (!back.length) return this.nope(r, "Nobody within 40 m behind");
        back.forEach((o) => fire(o, 2.5, true));
        this.say(`${r.name} put a Hill in front of ${back.map((o) => o.name).join(" and ")}`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "crowd": {
        const near = this.rivals(r).filter((o) => Math.abs(o.x - r.x) <= 20);
        if (!near.length) return this.nope(r, "Nobody within 20 m");
        near.forEach((o) => fire(o, 0.4, false));
        this.say(`${r.name} brought a Crowd onto the road`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "pickpocket": {
        const tgt = this.rivals(r)
          .filter((o) => o.x > r.x && o.x - r.x <= 50 && o.item)
          .sort((a2, b2) => a2.x - b2.x)[0];
        if (!tgt) return this.nope(r, "Nobody within 50 m ahead is holding anything");
        r.item = null;
        fire(tgt, 1, false);
        this.say(`${r.name} went for ${tgt.name}'s pocket`, r);
        this.pop(id, r, true);
        return true;
      }
      case "air-horn": {
        const cleared = this.hits.filter((h) => h.to === r.i).length;
        this.hits = this.hits.filter((h) => h.to !== r.i);
        const back = this.rivals(r).filter((o) => o.x < r.x && r.x - o.x <= 15);
        back.forEach((o) => fire(o, 0.2, false));
        this.say(cleared ? `${r.name}'s Air Horn cleared ${cleared === 1 ? "an attack" : `${cleared} attacks`}` : `${r.name} hit the Air Horn`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "shield":
        r.fx.push({ k: "shield", until: this.t + 30 });
        break;
      case "mirror":
        r.fx.push({ k: "mirror", until: this.t + 20 });
        break;
      case "fog":
        r.fx.push({ k: "fog", until: this.t + 30 });
        break;
      case "rally": {
        const near = this.mates(r).filter((o) => Math.abs(o.x - r.x) <= 50);
        if (!near.length) return this.nope(r, "No teammates within 50 m");
        near.forEach((o) => {
          this.addSpeed(o, 1.12, 12, "rally");
          this.pop("rally", o, true);
        });
        this.say(`${r.name} rallied ${near.map((o) => o.name).join(" and ")}`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "relay": {
        const back = this.mates(r)
          .filter((o) => !o.item)
          .sort((a2, b2) => a2.x - b2.x)[0];
        if (!back) return this.nope(r, "Your teammates are already holding items");
        const got = this.roll(back, 2);
        this.give(back, got);
        this.say(`${r.name} relayed ${ability(got).name} back to ${back.name}`, r);
        this.pop("relay", back, true);
        r.item = null;
        return true;
      }
      case "regroup": {
        const lost = this.mates(r).filter((o) => r.x - o.x > 40);
        if (!lost.length) return this.nope(r, "Your teammates are already with you");
        lost.forEach((o) => {
          o.x += o.base * 4;
          this.pop("regroup", o, true);
        });
        this.say(`${r.name} pulled ${lost.map((o) => o.name).join(" and ")} back up`, r);
        this.pop(id, r, true);
        r.item = null;
        return true;
      }
      case "pace-line": {
        const mate = this.mates(r)
          .filter((o) => o.x < r.x && r.x - o.x <= 15)
          .sort((a2, b2) => b2.x - a2.x)[0];
        if (!mate) return this.nope(r, "No teammate within 15 m behind you");
        mate.fx.push({ k: "line", until: this.t + 12, leader: r.i });
        this.say(`${r.name} pulled ${mate.name} along in a Pace Line`, r);
        this.pop("line", mate, true);
        r.item = null;
        return true;
      }
    }
    this.say(`${r.name} used ${a.name}`, r);
    this.pop(id, r, true);
    r.item = null;
    return true;
  }

  private nope(r: Runner, why: string) {
    if (r.you) this.say(why, null);
    return false;
  }

  /* ───────────── the step ───────────── */

  step(dt: number) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;

    for (const r of this.runners) {
      r.fx = r.fx.filter((f) => ("until" in f ? f.until > t : f.left > 0));
      const prev = r.x;
      const high = this.has(r, "high");
      const kick = this.has(r, "kick");
      // Runner's High and Pacer both shrug off slows
      const pacer = this.has(r, "pacer") || high;
      const frozen = this.has(r, "freeze") && !high;
      const surge = (r.surging && r.stamina > 0.02) || kick;
      // a steady runner still drifts a little either side of even pace
      const drift = 1 + 0.02 * Math.sin(t * 0.21 + r.i * 1.7) + 0.012 * Math.sin(t * 0.9 + r.i);
      let mul = 1;
      for (const f of r.fx) {
        if (f.k === "speed" && !(pacer && f.mul < 1)) mul *= f.mul;
        if (f.k === "line") {
          const lead = this.runners[f.leader];
          if (lead.x > r.x && lead.x - r.x <= 15) mul *= 1.1;
        }
      }
      if (high) mul *= 1.3;
      const effort = surge || this.has(r, "pacer") ? SURGE : 1;
      const v = r.base * drift * effort * mul;
      let dx = frozen ? 0 : v * dt;
      const det = r.fx.find((f) => f.k === "detour") as Extract<Fx, { k: "detour" }> | undefined;
      if (det && dx > 0) {
        det.left -= dx;
        dx *= 0.9;
      }
      if (r.finish === null) {
        r.x += dx;
        r.xNat += r.base * drift * (surge ? SURGE : 1) * dt;
      } else {
        // finished runners jog it out past the line
        r.x += r.base * 0.6 * dt;
      }
      if (surge && !pacer && !kick) r.stamina = Math.max(0, r.stamina - DRAIN * dt);
      else r.stamina = Math.min(1, r.stamina + REGEN * dt);

      if (r.finish === null) {
        // item boxes
        for (const row of BOX_ROWS) {
          if (prev < row && r.x >= row && !r.item) {
            const got = this.roll(r);
            this.give(r, got);
            r.ai.wait = 0.6 + Math.random() * 2.5;
            if (r.you) this.say(`You picked up ${ability(got).name}`, null);
            this.pop("box", r, true);
          }
        }
        // potholes
        for (let k = this.traps.length - 1; k >= 0; k--) {
          const tr = this.traps[k];
          if (tr.team === r.team || !(prev < tr.x && r.x >= tr.x)) continue;
          this.traps.splice(k, 1);
          const owner = this.runners[tr.owner];
          if (high) {
            this.say(`${r.name} ran straight over ${owner.name}'s Pothole`, r);
            this.pop("block", r, true);
          } else if (r.surging && r.stamina > 0.02) {
            this.say(`${r.name} jumped ${owner.name}'s Pothole`, r);
            this.pop("dodge", r, true);
          } else if (this.consume(r, "shield")) {
            this.say(`${r.name}'s Shield took ${owner.name}'s Pothole`, r);
            this.pop("block", r, true);
          } else {
            r.fx.push({ k: "freeze", until: t + 3 });
            this.say(`${r.name} hit ${owner.name}'s Pothole`, owner);
            this.pop("hit", r, false);
          }
        }
        if (r.x >= RACE_M) {
          const over = (r.x - RACE_M) / Math.max(0.1, dx / dt || r.base);
          r.finish = t - over;
          r.itemSec = (r.x - r.xNat) / r.base;
          this.say(`${r.name} finished ${ordinal(this.runners.filter((o) => o.finish !== null).length)}`, r);
        }
      }
    }
    this.traps = this.traps.filter((tr) => t - tr.born < 60);

    // hits landing
    for (let k = this.hits.length - 1; k >= 0; k--) {
      const h = this.hits[k];
      if (h.at > t) continue;
      this.hits.splice(k, 1);
      this.land(h);
    }

    for (const r of this.runners) if (!r.you) this.think(r, dt);
    if (this.runners.every((r) => r.finish !== null)) this.done = true;
  }

  private consume(r: Runner, k: "shield" | "mirror") {
    const i = r.fx.findIndex((f) => f.k === k && "until" in f && f.until > this.t);
    if (i < 0) return false;
    r.fx.splice(i, 1);
    return true;
  }

  private land(h: Hit) {
    const tgt = this.runners[h.to];
    const from = this.runners[h.from];
    const name = ability(h.kind).name;
    if (!this.live(tgt)) return;
    if (this.has(tgt, "high")) {
      this.say(`${from.name}'s ${name} bounced off ${tgt.name}`, tgt);
      this.pop("block", tgt, true);
      return;
    }
    if (this.hidden(tgt) && h.kind !== "bonk") {
      this.say(`${from.name}'s ${name} lost ${tgt.name} in the Fog`, tgt);
      return;
    }
    if (this.consume(tgt, "shield")) {
      this.say(`${tgt.name}'s Shield blocked ${from.name}'s ${name}`, tgt);
      this.pop("block", tgt, true);
      return;
    }
    if (!h.reflected && this.consume(tgt, "mirror")) {
      this.say(`${tgt.name} mirrored the ${name} back at ${from.name}`, tgt);
      this.pop("mirror", tgt, true);
      this.hits.push({ ...h, from: tgt.i, to: from.i, launched: this.t, at: this.t + (h.dodge ? 2.5 : 1), reflected: true });
      return;
    }
    if (h.dodge && tgt.surging && tgt.stamina > 0.02) {
      this.say(`${tgt.name} surged through ${from.name}'s ${name}`, tgt);
      this.pop("dodge", tgt, true);
      return;
    }
    switch (h.kind) {
      case "headwind":
        tgt.fx = tgt.fx.filter((f) => !(f.k === "speed" && f.tag === "tailwind"));
        this.addSpeed(tgt, 0.75, 8, "headwind");
        break;
      case "cramp":
        tgt.fx.push({ k: "freeze", until: this.t + 5 });
        break;
      case "detour":
        tgt.fx.push({ k: "detour", left: 200 });
        break;
      case "bonk":
        this.addSpeed(tgt, 0.7, 5, "bonk");
        break;
      case "hill":
        this.addSpeed(tgt, 0.85, 10, "hill");
        break;
      case "crowd":
        tgt.fx.push({ k: "freeze", until: this.t + 2 });
        break;
      case "air-horn":
        tgt.fx.push({ k: "freeze", until: this.t + 1 });
        break;
      case "pickpocket": {
        if (!tgt.item) {
          this.say(`${tgt.name} used it first. ${from.name}'s Pickpocket came up empty`, tgt);
          return;
        }
        const got = tgt.item;
        if (!from.item) this.give(from, got, tgt.charges);
        tgt.item = null;
        tgt.charges = 0;
        this.say(`${from.name} pickpocketed ${ability(got).name} from ${tgt.name}`, from);
        this.pop("lost", tgt, false);
        return;
      }
    }
    this.say(`${from.name}'s ${name} hit ${tgt.name}`, from);
    this.pop("hit", tgt, false);
  }

  /* ───────────── the other five runners ───────────── */

  private think(r: Runner, dt: number) {
    if (!this.live(r)) {
      r.surging = false;
      return;
    }
    r.ai.think -= dt;
    if (r.ai.think > 0) return;
    r.ai.think = 0.4;
    const left = RACE_M - r.x;
    const incoming = this.hits.filter((h) => h.to === r.i);
    const trapAhead = this.traps.some((tr) => tr.team !== r.team && tr.x > r.x && tr.x - r.x < 8);

    // dodge with the legs when it can be dodged
    const dodging = incoming.some((h) => h.dodge && h.at - this.t < 1.6) || trapAhead;
    const kick = left < 280 && r.stamina > 0.25;
    r.surging = (dodging && Math.random() < r.ai.skill + 0.2) || kick;

    if (!r.item) return;
    const id = r.item;
    const kind = ability(id).kind;
    // defences answer a warning
    if (incoming.length && (kind === "defense" || id === "runners-high") && Math.random() < 0.8) {
      this.use(r);
      return;
    }
    r.ai.wait -= 0.4;
    if (r.ai.wait > 0) return;

    const mates = this.mates(r);
    const ahead = this.aheadRival(r);
    const gapAhead = ahead ? ahead.x - r.x : Infinity;
    const leading = this.placeOf(r) === 1;
    let go = false;
    switch (id) {
      case "tailwind":
        go = gapAhead < 25 || left < 500;
        break;
      case "gel":
      case "bonk":
      case "cramp":
        go = true;
        break;
      case "gel-pack":
        go = gapAhead < 30 || left < 350;
        break;
      case "runners-high":
        go = this.placeOf(r) >= 4 || left < 500;
        break;
      case "kick":
        go = left <= 400;
        break;
      case "hill":
        go = this.rivals(r).some((o) => o.x < r.x && r.x - o.x <= 40);
        break;
      case "crowd":
        go = this.rivals(r).filter((o) => Math.abs(o.x - r.x) <= 20).length >= (r.ai.wait < -6 ? 1 : 2);
        break;
      case "pickpocket":
        go = this.rivals(r).some((o) => o.x > r.x && o.x - r.x <= 50 && o.item);
        break;
      case "air-horn":
        go = false;
        break;
      case "regroup":
        go = mates.some((o) => r.x - o.x > 40);
        break;
      case "second-wind":
        go = r.stamina < 0.35 || r.fx.some((f) => f.k === "freeze" || (f.k === "speed" && f.mul < 1)) || left < 350;
        break;
      case "pacer":
        go = r.stamina < 0.4 || left < 450;
        break;
      case "slingshot":
        go = gapAhead > 3 && gapAhead <= 20;
        break;
      case "headwind":
      case "detour":
        go = gapAhead < 60;
        break;
      case "pothole":
        go = !!this.behindRival(r, 25);
        break;
      case "static":
        go = this.rivals(r).some((o) => Math.abs(o.x - r.x) <= 30 && o.item);
        break;
      case "shield":
      case "mirror":
        go = leading && left < 900;
        break;
      case "fog":
        go = leading && left < 700;
        break;
      case "rally":
        go = mates.some((o) => Math.abs(o.x - r.x) <= 50);
        break;
      case "relay":
        go = mates.some((o) => !o.item && r.x - o.x > 40);
        break;
      case "pace-line":
        go = mates.some((o) => o.x < r.x && r.x - o.x <= 15);
        break;
    }
    // nobody sits on an item forever (except the ones made to be held)
    const hold = id === "kick" || id === "air-horn";
    if (go || (!hold && r.ai.wait < -14)) this.use(r);
  }

  /* ───────────── results ───────────── */

  teamPoints(): [number, number] {
    const pts: [number, number] = [0, 0];
    this.standings().forEach((r, i) => (pts[r.team] += POINTS[i] ?? 0));
    return pts;
  }
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** race seconds as m:ss.s */
export function clock(s: number, tenths = false) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${(tenths ? sec.toFixed(1) : Math.floor(sec).toString()).padStart(tenths ? 4 : 2, "0")}`;
}
