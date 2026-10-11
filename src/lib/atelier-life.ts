import * as THREE from "three";
import { ROOM, DESK_Y, type Built } from "./atelier-build";
import type { Season } from "./atelier-time";

/**
 * What the driver hands over each frame.
 *
 * It lives here rather than with the geometry because it is a
 * description of a moment, not of a thing — the build module has
 * no opinion about what time it is.
 */
export type Beat = {
  reduced: boolean;
  awake: boolean;
  /** Desk-lamp intensity the current time of day is asking for. */
  lamp: number;
  /** Neon intensity the current time of day is asking for. */
  neon: number;
  /** Pointer in normalised device coordinates, already eased. */
  pointer: THREE.Vector2;
  /** Whether the set is switched on. React owns this, not us. */
  tv: boolean;
};

/**
 * What makes the room a room rather than a model of one.
 *
 * The geometry module builds the parts and hands them over. This
 * one moves them. Keeping it separate matters more than it looks:
 * a scene graph is built once and animated sixty times a second,
 * and mixing those two jobs is how you end up allocating a vector
 * inside a frame loop.
 *
 * The rule throughout is that nothing is on a single loop. A tail
 * that swings on one sine is a metronome; a tail that swings on
 * two sines of unrelated period, with a flick fired by its own
 * timer, is an animal deciding things. Every idle motion here is
 * built out of at least two frequencies that do not divide into
 * each other, so the room never visibly repeats.
 */

const deskZ = ROOM.backZ + 0.52;
const MUG = new THREE.Vector3(-0.78, DESK_Y + 0.12, deskZ + 0.1);

/** How far along x a ship travels before it wraps. */
const SHIP_SPAN = 96;

const HINTS: Record<string, string> = {
  monitor: "Wake the machine",
  cat: "She has noticed you",
  tv: "Switch the set on",
};

export type Life = {
  update: (t: number, dt: number, beat: Beat) => void;
  setHover: (name: string | null) => void;
  hintFor: (name: string) => string;
  setSeason: (s: Season, manual: boolean) => void;
  toggleLamp: () => void;
};

/** Leaf colours per season. Winter is not dead, it is just cold. */
const LEAF: Record<Season, [number, number]> = {
  spring: [0x5f9150, 0x86b468],
  summer: [0x3f7a42, 0x5f9a4e],
  autumn: [0xa8652b, 0xcf8f3c],
  winter: [0x4c6b58, 0x6b8a72],
};

export function bringToLife(b: Built): Life {
  /* ── State ─────────────────────────────────────────────── */
  let hover: string | null = null;
  let lampOn = true;
  let season: Season = "autumn";
  let festive = false;

  // Cat timers. Each runs on its own schedule so nothing lines up.
  let blinkIn = 2.2;
  let blinking = -1;
  let earIn = 1.4;
  let earFlick = -1;
  let earWhich = 0;
  let stretchIn = 17;
  let stretching = -1;

  /* Eased values. Lerped rather than set, so hovering on and off
     quickly never snaps. */
  let blushAmt = 0;
  let attention = 0; // 0 dozing, 1 locked on
  let tvAmt = 0;
  let lampAmt = 1;
  let chairSpin = 0;
  let recordSpin = 0;

  // Rest poses, captured once so offsets are relative to how the
  // rig was actually built rather than to zero.
  const earRest = b.cat.ears.map((e) => e.rotation.z);
  const catBaseY = b.cat.group.position.y;

  const tmp = new THREE.Vector3();
  const approach = (a: number, want: number, k: number) => a + (want - a) * k;

  /* ── Particles ─────────────────────────────────────────── */
  const dustArr = b.particles.dust.geometry.attributes.position.array as Float32Array;
  const steamArr = b.particles.steam.geometry.attributes.position.array as Float32Array;
  const snowArr = b.particles.snow.geometry.attributes.position.array as Float32Array;
  // Per-particle drift, so they do not travel as a sheet.
  const steamSeed = new Float32Array(steamArr.length / 3);
  const snowSeed = new Float32Array(snowArr.length / 3);
  for (let i = 0; i < steamSeed.length; i++) steamSeed[i] = Math.random();
  for (let i = 0; i < snowSeed.length; i++) snowSeed[i] = Math.random();

  function setSeason(s: Season, manual: boolean) {
    season = s;
    const [a, c] = LEAF[s];
    b.leafMats[0].color.setHex(a);
    b.leafMats[1].color.setHex(c);

    /**
     * The tree is a December thing, not a winter thing — one still
     * up in February is a sadder image than Daniel is going for.
     * So it follows the real calendar, unless someone has reached
     * for the season control themselves, in which case winter is
     * a request to be shown the festive room.
     */
    const december = new Date().getMonth() === 11;
    festive = december || (manual && s === "winter");
    b.seasonal.group.visible = festive;
    b.seasonal.light.visible = festive;
    b.particles.snow.visible = s === "winter";
  }

  setSeason("autumn", false);

  return {
    hintFor: (name) => HINTS[name] ?? "",
    setHover: (name) => {
      hover = name;
    },
    setSeason,
    toggleLamp: () => {
      lampOn = !lampOn;
    },

    update(t, dt, beat) {
      const still = beat.reduced;
      const k = Math.min(1, dt * 6);

      /* ══ The clock tells the actual time ═══════════════ */
      const now = new Date();
      const mins = now.getMinutes() + now.getSeconds() / 60;
      const hrs = (now.getHours() % 12) + mins / 60;
      b.clock.minute.rotation.z = -(mins / 60) * Math.PI * 2;
      b.clock.hour.rotation.z = -(hrs / 12) * Math.PI * 2;

      /* ══ The cat ═══════════════════════════════════════
         The thing people will actually look at, so it gets the
         most behaviour: a head that follows you, ears that move
         one at a time, eyes that blink on their own schedule and
         a tail that gives her away. */
      const watching = hover === "cat";
      attention = approach(attention, watching ? 1 : 0.18, Math.min(1, dt * 3.4));
      blushAmt = approach(blushAmt, watching ? 1 : 0, Math.min(1, dt * 3.2));
      for (const m of b.cat.blush) {
        (m.material as THREE.MeshBasicMaterial).opacity = blushAmt * 0.75;
      }

      if (!still) {
        // Head follows the pointer, further when she is paying
        // attention. Clamped: a cat does not owl its head round.
        const yaw = THREE.MathUtils.clamp(beat.pointer.x * 0.62, -0.5, 0.5) * attention;
        const pitch = THREE.MathUtils.clamp(-beat.pointer.y * 0.3, -0.2, 0.26) * attention;
        b.cat.head.rotation.y = approach(b.cat.head.rotation.y, yaw, Math.min(1, dt * 2.6));
        b.cat.head.rotation.z = approach(b.cat.head.rotation.z, pitch, Math.min(1, dt * 2.6));
        // A tilt when she is interested. This is the whole trick
        // for making something read as curious rather than aimed.
        b.cat.head.rotation.x = approach(
          b.cat.head.rotation.x,
          watching ? 0.22 : 0,
          Math.min(1, dt * 2.2),
        );

        // Pupils track a little further than the head does.
        for (const eye of b.cat.eyes) {
          eye.rotation.y = approach(eye.rotation.y, beat.pointer.x * 0.3 * attention, k);
          eye.rotation.z = approach(eye.rotation.z, -beat.pointer.y * 0.18 * attention, k);
        }

        // Blink. Random interval, quick close, slower open.
        blinkIn -= dt;
        if (blinkIn <= 0 && blinking < 0) {
          blinking = 0;
          blinkIn = 2.4 + Math.random() * 4.5;
        }
        if (blinking >= 0) {
          blinking += dt;
          const d = 0.19;
          const p = Math.min(1, blinking / d);
          // Up fast, down slow — a real blink is not symmetrical.
          const shut = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
          for (const lid of b.cat.lids) lid.scale.y = 0.06 + shut * 0.94;
          if (p >= 1) {
            blinking = -1;
            for (const lid of b.cat.lids) lid.scale.y = 0.06;
          }
        } else {
          // Half-lids when she is content and nobody is bothering
          // her; wide when she is watching you.
          const rest = 0.06 + (1 - attention) * 0.16;
          for (const lid of b.cat.lids) lid.scale.y = approach(lid.scale.y, rest, k);
        }

        // Ears: one at a time, not together.
        earIn -= dt;
        if (earIn <= 0 && earFlick < 0) {
          earFlick = 0;
          earWhich = Math.random() < 0.5 ? 0 : 1;
          earIn = 1.1 + Math.random() * 3.4;
        }
        b.cat.ears.forEach((ear, i) => {
          // Perked when watched, relaxed otherwise.
          let want = earRest[i] + attention * 0.16;
          if (earFlick >= 0 && i === earWhich) {
            const p = Math.min(1, earFlick / 0.22);
            want += Math.sin(p * Math.PI) * 0.42;
          }
          ear.rotation.z = approach(ear.rotation.z, want, Math.min(1, dt * 14));
        });
        if (earFlick >= 0) {
          earFlick += dt;
          if (earFlick > 0.22) earFlick = -1;
        }

        // Tail. Two periods that do not divide, plus a wider,
        // faster swing when she has clocked you.
        const wag = watching ? 2.6 : 1.0;
        const amp = watching ? 0.5 : 0.17;
        b.cat.tail.rotation.y =
          Math.sin(t * wag) * amp + Math.sin(t * wag * 0.37 + 1.1) * amp * 0.45;
        b.cat.tail.rotation.x = Math.sin(t * wag * 0.61) * amp * 0.3;

        // Breathing, and a purr that is really just a faster,
        // smaller breath with a tremor on it.
        const breath = Math.sin(t * (watching ? 2.3 : 1.15));
        b.cat.body.scale.y = 1 + breath * 0.022 + (watching ? Math.sin(t * 31) * 0.004 : 0);
        b.cat.body.scale.z = 1 + breath * 0.016;

        // Every so often, a stretch.
        stretchIn -= dt;
        if (stretchIn <= 0 && stretching < 0 && !watching) {
          stretching = 0;
          stretchIn = 22 + Math.random() * 30;
        }
        if (stretching >= 0) {
          stretching += dt;
          const p = Math.min(1, stretching / 1.9);
          const e = Math.sin(p * Math.PI);
          b.cat.group.position.y = catBaseY + e * 0.012;
          b.cat.group.scale.x = 1 + e * 0.07;
          b.cat.head.rotation.x -= e * 0.2;
          if (p >= 1) {
            stretching = -1;
            b.cat.group.scale.x = 1;
            b.cat.group.position.y = catBaseY;
          }
        }
      }

      /* ══ Plants breathe too ════════════════════════════ */
      if (!still) {
        b.plants.forEach((p, i) => {
          const ph = i * 1.7;
          p.rotation.z = Math.sin(t * 0.42 + ph) * 0.012 + Math.sin(t * 0.17 + ph) * 0.008;
          p.rotation.x = Math.sin(t * 0.31 + ph * 0.6) * 0.009;
        });
      }

      /* ══ Light ═════════════════════════════════════════ */
      lampAmt = approach(lampAmt, lampOn ? 1 : 0, Math.min(1, dt * 5));
      // A filament is never perfectly steady. Two sines and a
      // rare dip, so it reads as tungsten rather than as a bug.
      const flicker = still
        ? 1
        : 1 + Math.sin(t * 11.3) * 0.012 + Math.sin(t * 2.7) * 0.02;
      b.lamps.desk.intensity = beat.lamp * lampAmt * flicker;
      (b.props.bulb.material as THREE.MeshBasicMaterial).color.setScalar(
        0.55 + 0.45 * lampAmt,
      );
      b.props.bulb.visible = lampAmt > 0.02;

      b.lamps.neon.intensity =
        beat.neon * (still ? 1 : 1 + Math.sin(t * 17.1) * 0.03 + Math.sin(t * 3.3) * 0.04);

      // The monitor only lights the room when it is awake.
      const screenAmt = beat.awake ? 1 : 0;
      b.lamps.screen.intensity = approach(b.lamps.screen.intensity, screenAmt * 1.5, k);
      (b.screenGlow.material as THREE.MeshBasicMaterial).opacity =
        b.lamps.screen.intensity * 0.26;

      /* ══ Television ════════════════════════════════════ */
      tvAmt = approach(tvAmt, beat.tv ? 1 : 0, Math.min(1, dt * 6));
      b.props.tvStaticMat.uniforms.uTime.value = t;
      b.props.tvStaticMat.uniforms.uAmt.value = tvAmt;
      b.props.tvStatic.visible = tvAmt > 0.01;
      // A CRT does not sit still: the light it throws jumps with
      // whatever is on it.
      const jitter = still ? 1 : 0.78 + Math.abs(Math.sin(t * 9.1) * Math.sin(t * 3.7)) * 0.5;
      b.lamps.tv.intensity = tvAmt * 1.9 * jitter;
      (b.tvGlow.material as THREE.MeshBasicMaterial).opacity = tvAmt * 0.5 * jitter;

      /* ══ Props ═════════════════════════════════════════ */
      if (!still) {
        // The chair never quite settles.
        chairSpin += dt * 0.09;
        b.props.chair.rotation.y = 0.22 + Math.sin(chairSpin) * 0.05;
        recordSpin += dt * 0.5;
        b.props.record.rotation.x = 0.16 + Math.sin(recordSpin * 0.3) * 0.02;
      }

      /* ══ Particles ═════════════════════════════════════ */
      if (!still) {
        // Dust rises slowly through the window light and resets
        // at the floor. Lit from behind, it is most of what sells
        // a shaft of light as air rather than geometry.
        for (let i = 0; i < dustArr.length; i += 3) {
          dustArr[i + 1] += dt * 0.035;
          dustArr[i] += Math.sin(t * 0.4 + i) * dt * 0.012;
          if (dustArr[i + 1] > 2.8) dustArr[i + 1] = 0.25;
        }
        b.particles.dust.geometry.attributes.position.needsUpdate = true;

        // Steam, but only while the lamp side of the room is
        // cool enough to see it — and it spreads as it climbs.
        for (let i = 0, p = 0; i < steamArr.length; i += 3, p++) {
          const s = steamSeed[p];
          steamArr[i + 1] += dt * (0.1 + s * 0.09);
          const rise = steamArr[i + 1] - MUG.y;
          steamArr[i] = MUG.x + Math.sin(t * (0.8 + s) + s * 9) * rise * 0.5;
          steamArr[i + 2] = MUG.z + Math.cos(t * (0.6 + s) + s * 7) * rise * 0.4;
          if (rise > 0.34) steamArr[i + 1] = MUG.y;
        }
        b.particles.steam.geometry.attributes.position.needsUpdate = true;

        if (b.particles.snow.visible) {
          for (let i = 0, p = 0; i < snowArr.length; i += 3, p++) {
            const s = snowSeed[p];
            snowArr[i + 1] -= dt * (1.4 + s * 2.2);
            snowArr[i] += Math.sin(t * 0.5 + s * 11) * dt * (0.5 + s);
            if (snowArr[i + 1] < -2) snowArr[i + 1] = 38;
          }
          b.particles.snow.geometry.attributes.position.needsUpdate = true;
        }
      }

      /* ══ Festive ═══════════════════════════════════════ */
      if (festive && !still) {
        b.seasonal.baubles.forEach((m, i) => {
          const mat = m.material as THREE.MeshStandardMaterial;
          // Each bauble on its own phase, so the string chases
          // rather than pulses as one.
          const g = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.9);
          mat.emissiveIntensity = 0.5 + g * 1.9;
        });
        const sm = b.seasonal.star.material as THREE.MeshStandardMaterial;
        sm.emissiveIntensity = 2 + Math.sin(t * 0.9) * 0.8;
        b.seasonal.light.intensity = 1.1 + Math.sin(t * 1.3) * 0.45;
      }

      /* ══ Traffic ═══════════════════════════════════════ */
      if (!still) {
        for (const ship of b.ships.children) {
          const d = ship.userData as { speed: number; t: number };
          // Wrapped on its own offset so they never convoy.
          const x = ((t * d.speed + d.t * SHIP_SPAN) % SHIP_SPAN + SHIP_SPAN) % SHIP_SPAN;
          ship.position.x = x - SHIP_SPAN / 2;
        }
      }

      void tmp;
    },
  };
}
