/**
 * NERTIA Race — kart-racing rules for real runs.
 *
 * Runners race on their own routes, tracked by GPS. Every 400 m they
 * pass an item box and pick up one of 25 abilities. Abilities change a separate
 * game clock and never touch anyone's real time or PRs. Everything is
 * audio-first: items fire with a double-tap on earbuds or a watch, and
 * the defences that matter most are physical — surge to dodge.
 *
 * Effects are written in race seconds. Item odds depend on where you
 * are in the race: the back of the pack gets the comeback items, the
 * front gets defence. That's what keeps a mixed-pace club in it.
 */

export type AbilityKind = "boost" | "attack" | "defense" | "team";

export type AbilityId =
  | "tailwind"
  | "gel"
  | "gel-pack"
  | "second-wind"
  | "pacer"
  | "slingshot"
  | "runners-high"
  | "kick"
  | "headwind"
  | "cramp"
  | "pothole"
  | "detour"
  | "static"
  | "bonk"
  | "hill"
  | "crowd"
  | "pickpocket"
  | "shield"
  | "mirror"
  | "fog"
  | "air-horn"
  | "rally"
  | "relay"
  | "pace-line"
  | "regroup";

export type Ability = {
  id: AbilityId;
  name: string;
  kind: AbilityKind;
  /** what it does, in one line */
  effect: string;
  /** when a runner should actually use it */
  use: string;
  /** how to beat it, if it can be beaten */
  counter?: string;
  /** roughly what it's worth, in race seconds */
  worth: string;
  /** box odds by position: front of the race, middle, back */
  odds: [number, number, number];
};

export const ABILITY_KINDS: { id: AbilityKind; label: string; line: string }[] = [
  { id: "boost", label: "Boost", line: "Speed for you." },
  { id: "attack", label: "Attack", line: "Time off a rival." },
  { id: "defense", label: "Defense", line: "Protect a lead." },
  { id: "team", label: "Team", line: "Built for run clubs." },
];

export const ABILITIES: Ability[] = [
  /* ── boost ── */
  {
    id: "tailwind",
    name: "Tailwind",
    kind: "boost",
    effect: "You run 20% faster for 10 seconds.",
    use: "Closing a gap before a pass, or the last stretch.",
    counter: "A Headwind on you cancels it.",
    worth: "≈ 2 s",
    odds: [10, 12, 12],
  },
  {
    id: "gel",
    name: "Gel",
    kind: "boost",
    effect: "Jump 6 seconds up the road, instantly.",
    use: "You've been dropped and need to get back on the group.",
    worth: "6 s",
    odds: [0, 4, 16],
  },
  {
    id: "gel-pack",
    name: "Gel Pack",
    kind: "boost",
    effect: "Three small Gels. Each tap jumps you 2.5 seconds up the road.",
    use: "Spend them one at a time: answer a pass, close a gap, then the line.",
    worth: "7.5 s over three taps",
    odds: [4, 10, 10],
  },
  {
    id: "second-wind",
    name: "Second Wind",
    kind: "boost",
    effect: "Full stamina, and every slow on you is cleared.",
    use: "Right after you get hit, or just before the final kick.",
    worth: "Saves 2–5 s",
    odds: [4, 6, 10],
  },
  {
    id: "pacer",
    name: "Pacer",
    kind: "boost",
    effect: "Holds you at surge pace for 20 seconds with no stamina used. Slows can't touch you.",
    use: "On a climb, or when your legs are going.",
    worth: "≈ 2 s, plus protection",
    odds: [8, 6, 8],
  },
  {
    id: "slingshot",
    name: "Slingshot",
    kind: "boost",
    effect: "Used within 20 m behind a rival, it pulls you level and 5 m past.",
    use: "You've been sitting on someone's shoulder. It's drafting, made literal.",
    counter: "With nobody in range it's only a small boost.",
    worth: "Up to 6 s",
    odds: [4, 12, 10],
  },

  {
    id: "runners-high",
    name: "Runner's High",
    kind: "boost",
    effect: "8 seconds at 30% faster. Nothing touches you: attacks and Potholes bounce off, and any slow on you is gone.",
    use: "You're stuck at the back of a fight and everyone's throwing things.",
    worth: "≈ 2.5 s, plus immunity",
    odds: [0, 3, 9],
  },
  {
    id: "kick",
    name: "Kick",
    kind: "boost",
    effect: "Only works in the last 400 m. Surge all the way to the line with no stamina cost.",
    use: "Hold it. It's a guaranteed finishing kick when your legs are gone.",
    counter: "Fired early it does nothing, and you keep it.",
    worth: "≈ 3–4 s",
    odds: [8, 8, 6],
  },

  /* ── attack ── */
  {
    id: "headwind",
    name: "Headwind",
    kind: "attack",
    effect: "The rival directly ahead runs 25% slower for 8 seconds.",
    use: "Someone's just in front and you want the pass.",
    counter: "Surge through it when the warning hits, or Shield or Mirror.",
    worth: "≈ 2 s",
    odds: [10, 14, 10],
  },
  {
    id: "cramp",
    name: "Cramp",
    kind: "attack",
    effect: "Homes in on the race leader and freezes them for 5 seconds.",
    use: "One runner is pulling away from everyone.",
    counter: "Shield, Mirror or Fog. You can't outrun it.",
    worth: "5 s",
    odds: [2, 8, 14],
  },
  {
    id: "pothole",
    name: "Pothole",
    kind: "attack",
    effect: "Dropped where you stand. The next rival to cross it freezes for 3 seconds.",
    use: "Someone's right behind you.",
    counter: "Surge as you cross it to jump it, or Shield.",
    worth: "3 s",
    odds: [16, 8, 0],
  },
  {
    id: "detour",
    name: "Detour",
    kind: "attack",
    effect: "The rival ahead's next 200 m only count as 180 m.",
    use: "A close rival late in the race, where 4 seconds decides it.",
    counter: "Shield or Mirror.",
    worth: "≈ 4–5 s",
    odds: [4, 10, 6],
  },
  {
    id: "static",
    name: "Static",
    kind: "attack",
    effect: "Everyone within 30 m loses the item they're holding.",
    use: "You're in a pack and they're sitting on items.",
    counter: "Fog, or use your item first.",
    worth: "Denies an item",
    odds: [8, 8, 4],
  },
  {
    id: "bonk",
    name: "Bonk",
    kind: "attack",
    effect: "Every rival ahead of you runs 30% slower for 5 seconds.",
    use: "You're at the back. It's the comeback item, and it's rare.",
    counter: "Shield.",
    worth: "≈ 1.5 s on each",
    odds: [0, 1, 8],
  },

  {
    id: "hill",
    name: "Hill",
    kind: "attack",
    effect: "Every rival within 40 m behind you runs 15% slower for 10 seconds.",
    use: "A group is closing on you and you want to hold them off.",
    counter: "Surge through it when the warning hits, or Shield.",
    worth: "≈ 1.5 s on each",
    odds: [12, 6, 0],
  },
  {
    id: "crowd",
    name: "Crowd",
    kind: "attack",
    effect: "Everyone within 20 m of you, ahead or behind, stops for 2 seconds. You don't.",
    use: "You're boxed in by a pack. It's how you break out of one.",
    counter: "Shield, or stay more than 20 m away from whoever's holding it.",
    worth: "2 s on each",
    odds: [4, 8, 6],
  },
  {
    id: "pickpocket",
    name: "Pickpocket",
    kind: "attack",
    effect: "Takes the item from the nearest rival ahead who's holding one, within 50 m.",
    use: "They're sitting on a Shield before your attack, or they've got something you want.",
    counter: "Use your item first, Fog, or Shield.",
    worth: "An item swing",
    odds: [2, 8, 8],
  },

  /* ── defense ── */
  {
    id: "shield",
    name: "Shield",
    kind: "defense",
    effect: "Blocks the next attack in the next 30 seconds.",
    use: "You're leading, or a warning just landed.",
    worth: "Blocks 2–5 s",
    odds: [18, 8, 2],
  },
  {
    id: "mirror",
    name: "Mirror",
    kind: "defense",
    effect: "Sends the next attack back at whoever threw it. Lasts 20 seconds.",
    use: "You're the leader and a Cramp is coming.",
    worth: "Swings 4–10 s",
    odds: [12, 4, 0],
  },
  {
    id: "fog",
    name: "Fog",
    kind: "defense",
    effect: "You drop off the board for 30 seconds. Nobody can target you, and Cramp skips you.",
    use: "Protecting a lead in the last kilometre.",
    worth: "Protection",
    odds: [10, 2, 0],
  },

  {
    id: "air-horn",
    name: "Air Horn",
    kind: "defense",
    effect: "Clears every attack on its way to you, Cramp included, and stops anyone within 15 m behind you for 1 second.",
    use: "A Cramp warning lands and you've got no Shield. The one answer to it.",
    worth: "Blocks 2–5 s",
    odds: [8, 4, 2],
  },

  /* ── team ── */
  {
    id: "rally",
    name: "Rally",
    kind: "team",
    effect: "Teammates within 50 m of you run 12% faster for 12 seconds.",
    use: "Your group is together. It pays to run as a pack.",
    worth: "≈ 1.5 s on each",
    odds: [8, 8, 6],
  },
  {
    id: "relay",
    name: "Relay",
    kind: "team",
    effect: "Your teammate furthest back gets an item at back-of-pack odds.",
    use: "You're up front and they need it more than you do.",
    worth: "An item for a teammate",
    odds: [4, 4, 2],
  },
  {
    id: "pace-line",
    name: "Pace Line",
    kind: "team",
    effect: "A teammate within 15 m behind you runs 10% faster for 12 seconds while they stay on you.",
    use: "Towing a teammate back up the field. The way club runners do it.",
    worth: "≈ 1.2 s",
    odds: [6, 8, 4],
  },
  {
    id: "regroup",
    name: "Regroup",
    kind: "team",
    effect: "Teammates more than 40 m behind you jump 4 seconds up the road.",
    use: "Your group's split up. Bring them back so Rally and Pace Line work again.",
    worth: "4 s on each",
    odds: [8, 5, 0],
  },
];

export const ability = (id: AbilityId) => ABILITIES.find((a) => a.id === id)!;

/** Ways a club can play it. */
export const MODES: { name: string; line: string }[] = [
  { name: "Club race", line: "Same start time, any route, any city. Two teams, points by place. The weekly run, scored." },
  { name: "Ghost race", line: "Race your club's recorded runs on your own schedule. Their items fire where they fired them." },
  { name: "Route war", line: "A shared loop. Potholes you drop stay there for a day, waiting for whoever runs it next." },
  { name: "Equalizer", line: "Everyone races their own predicted time, so a 30-minute runner can beat a 17-minute one." },
  { name: "Club vs club", line: "Run clubs take each other on over a week. Total distance, best times, and items in play." },
  { name: "Time trial", line: "No items. Real times only, for PRs. Kept apart on purpose." },
];

/** Rules that keep it a running game, and keep it fair. */
export const RULES: { title: string; line: string }[] = [
  { title: "Real times never change", line: "Items move a separate game clock. Your Strava times and PRs stay exactly as you ran them." },
  { title: "Effort decides most of it", line: "All items together are capped at about 5% of race time, so a well-run race still beats a lucky one." },
  { title: "No screen while running", line: "Calls come through your earbuds. Items fire with a double-tap on earbuds or a watch, or by voice." },
  { title: "Dodge with your legs", line: "Headwinds and Potholes are beaten by surging. Defending a lead means actually running harder." },
  { title: "Built against cheating", line: "Speed caps, step counts from the phone's motion sensors, and heart rate when a watch is paired." },
  { title: "Items are never for sale", line: "You earn every item on the road. NERTIA gear changes how your items look, never what they do." },
];
