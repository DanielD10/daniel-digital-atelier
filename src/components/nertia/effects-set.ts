/**
 * The effects added for the Drop 001 set, by engine id. effects.ts
 * hands anything it doesn't build itself to this factory.
 */

import type { EffectId } from "@/lib/nertia";
import { Aura, Aurora, Butterflies, Comet, Confetti, Glitch, Ribbons, Slipstream, Snow, Sparkle } from "./fx-body";
import { Bloom, Grid, Ripple, Thunder } from "./fx-ground";
import { Cloud, Crown, Halo, Orbit } from "./fx-head";
import type { Effect } from "./fxkit";

export function createSetEffect(id: EffectId, variant?: string): Effect | null {
  switch (id) {
    case "aura":
      return new Aura(variant);
    case "ribbons":
      return new Ribbons(variant);
    case "comet":
      return new Comet(variant);
    case "aurora":
      return new Aurora();
    case "sparkle":
      return new Sparkle(variant);
    case "snow":
      return new Snow();
    case "confetti":
      return new Confetti();
    case "butterflies":
      return new Butterflies();
    case "slipstream":
      return new Slipstream();
    case "glitch":
      return new Glitch();
    case "thunder":
      return new Thunder(variant);
    case "ripple":
      return new Ripple();
    case "bloom":
      return new Bloom();
    case "grid":
      return new Grid();
    case "cloud":
      return new Cloud();
    case "orbit":
      return new Orbit();
    case "halo":
      return new Halo(variant);
    case "crown":
      return new Crown();
    default:
      return null;
  }
}
