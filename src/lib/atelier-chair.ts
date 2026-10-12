import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * The chair.
 *
 * It was five boxes: a slab to sit on, a slab to lean against, a
 * tube, and five sticks with balls on. At any distance that reads
 * as a chair-shaped object rather than a chair, and it was the
 * single most obviously placeholder thing in the room.
 *
 * This is a racing-style gaming chair built the way the real ones
 * are put together, because the silhouette comes from the
 * assembly: a bucket pan with bolsters running up both sides, a
 * channelled backrest between two tall wings, lumbar and neck
 * cushions hanging off their straps, four-dee armrests on posts,
 * a gas lift inside a shroud, and a five-spoke base on castors
 * that actually have tyres.
 *
 * Nothing here is a cube. Capsules for anything padded — a capsule
 * is a cylinder with hemispherical caps, which is exactly the
 * cross-section of a stuffed bolster — lathes for the turned
 * metal, tori for the tyres, and rounded boxes with real corner
 * radii for the flat panels. Edges are where light tells you what
 * something is made of, so none of them are left sharp.
 */

export type ChairMats = {
  /** Leatherette. Dark, slightly glossy — it catches the neon. */
  hide: THREE.Material;
  /** The accent: piping, stitch lines, the strip under the base. */
  accent: THREE.Material;
  /** Chrome-ish, for the gas lift and the spokes. */
  metal: THREE.Material;
  /** Matte, for the armrest tops and castor housings. */
  plastic: THREE.Material;
  /** Unlit, for the underglow. */
  glow: THREE.Material;
};

type Keep = <T extends { dispose: () => void }>(x: T) => T;

/** Degrees, because every spec sheet for a chair is in degrees. */
const d2r = (d: number) => (d * Math.PI) / 180;

export type GamingChair = {
  group: THREE.Group;
  /** The seat, backrest and arms as one, so the whole thing can recline. */
  recliner: THREE.Group;
  /** Underglow, for the driver to pulse. */
  glowRing: THREE.Mesh;
  /** Castors, so they can roll when the chair is spun. */
  castors: THREE.Mesh[];
};

export function buildGamingChair(keep: Keep, m: ChairMats): GamingChair {
  const group = new THREE.Group();

  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material, cast = true) => {
    const x = new THREE.Mesh(keep(g), mat);
    x.castShadow = cast;
    return x;
  };

  /** A padded form: a capsule is the right cross-section for one. */
  const pad = (r: number, len: number, mat: THREE.Material = m.hide) =>
    mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);

  /** A flat panel with its corners properly taken off. */
  const panel = (w: number, h: number, t: number, r: number, mat: THREE.Material = m.hide) =>
    mesh(new RoundedBoxGeometry(w, h, t, 4, Math.min(r, Math.min(w, h, t) * 0.49)), mat);

  const SEAT_Y = 0.45;

  /* ── Base ──────────────────────────────────────────────
     Five spokes. A real one is a tapered aerofoil that is deep
     at the hub and thin at the castor, which is what stops it
     reading as five sticks: the taper is the whole shape. */
  const base = new THREE.Group();
  group.add(base);

  const hub = mesh(new THREE.CylinderGeometry(0.062, 0.078, 0.07, 20), m.metal);
  hub.position.y = 0.075;
  base.add(hub);

  const castors: THREE.Mesh[] = [];
  const SPOKES = 5;
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2 + 0.3;

    /* One tapered arm per spoke, deep at the hub and thin at the
       castor. A cylinder with two different radii is the whole
       trick — the taper is what stops five of these reading as
       five sticks. It slopes down to the floor as it goes out,
       because a flat star looks like a diagram of a chair. */
    const arm = mesh(new THREE.CylinderGeometry(0.014, 0.032, 0.215, 10), m.metal);
    arm.rotation.z = d2r(90 - 7);
    arm.rotation.y = -a;
    arm.position.set(Math.cos(a) * 0.138, 0.063, Math.sin(a) * 0.138);
    base.add(arm);

    const housing = mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.045, 10), m.plastic);
    housing.position.set(Math.cos(a) * 0.245, 0.048, Math.sin(a) * 0.245);
    base.add(housing);

    /* A torus is a tyre. A sphere is a ball bearing, which is
       what the old one looked like. */
    const tyre = mesh(new THREE.TorusGeometry(0.019, 0.0105, 8, 16), m.plastic);
    tyre.position.set(Math.cos(a) * 0.245, 0.022, Math.sin(a) * 0.245);
    tyre.rotation.y = -a + Math.PI / 2;
    base.add(tyre);
    castors.push(tyre);
  }

  /* The strip of light under the star. Every one of these chairs
     has one and in a room lit like this it would be on. */
  const glowRing = mesh(new THREE.TorusGeometry(0.15, 0.009, 8, 40), m.glow, false);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.028;
  base.add(glowRing);

  /* ── Gas lift ──────────────────────────────────────────
     Two diameters with a collar, because a single tube is a
     broom handle. */
  const column = mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.26, 16), m.metal);
  column.position.y = 0.2;
  group.add(column);

  const shroudPts: THREE.Vector2[] = [];
  for (let s = 0; s <= 10; s++) {
    const u = s / 10;
    shroudPts.push(new THREE.Vector2(0.042 - Math.pow(u, 2.2) * 0.012, u * 0.19));
  }
  const shroud = mesh(new THREE.LatheGeometry(shroudPts, 18), m.plastic);
  shroud.position.y = 0.1;
  group.add(shroud);

  const collar = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.016, 16), m.accent);
  collar.position.y = 0.318;
  group.add(collar);

  /* ── Everything that reclines ──────────────────────────
     Seat, back and arms move together, hinged at the seat. */
  const recliner = new THREE.Group();
  recliner.position.y = SEAT_Y - 0.06;
  group.add(recliner);

  const tilt = mesh(new RoundedBoxGeometry(0.16, 0.05, 0.2, 3, 0.012), m.metal);
  tilt.position.y = 0.02;
  recliner.add(tilt);

  /* ── Seat pan ──────────────────────────────────────────
     Wider at the front than the back, which is the one
     proportion that makes a seat look sat-in. */
  const seat = panel(0.47, 0.072, 0.46, 0.03);
  seat.position.set(0, 0.068, 0.01);
  seat.rotation.x = d2r(-3);
  recliner.add(seat);

  /* A front lip that rolls under, so the leading edge is not a
     cut face. */
  const lip = pad(0.036, 0.42);
  lip.rotation.z = Math.PI / 2;
  lip.position.set(0, 0.062, 0.228);
  recliner.add(lip);

  // Side bolsters: the walls of the bucket.
  for (const sx of [-1, 1]) {
    const bolster = pad(0.046, 0.33);
    bolster.rotation.x = Math.PI / 2;
    bolster.rotation.z = d2r(sx * 5);
    bolster.position.set(sx * 0.212, 0.106, 0.01);
    recliner.add(bolster);

    // Contrast piping along the top of each bolster.
    const piping = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 7), m.accent);
    piping.rotation.x = Math.PI / 2;
    piping.position.set(sx * 0.219, 0.142, 0.01);
    recliner.add(piping);
  }

  /* ── Backrest ──────────────────────────────────────────
     Hinged at the base of the seat and leaned back a little,
     because nobody's chair is at ninety degrees. */
  const back = new THREE.Group();
  back.position.set(0, 0.1, -0.2);
  back.rotation.x = d2r(-13);
  recliner.add(back);

  /* The shell behind the padding — visible at the edges and
     around the back, and the reason the padding reads as padding
     rather than as the whole chair. */
  const shell = panel(0.44, 0.63, 0.055, 0.04, m.plastic);
  shell.position.set(0, 0.3, -0.035);
  back.add(shell);

  /* Channelled padding: five pads with gaps, narrowing toward
     the shoulders. Horizontal channels are the signature of
     this kind of chair and they cost five rounded boxes. */
  const PADS = 5;
  for (let i = 0; i < PADS; i++) {
    const u = i / (PADS - 1);
    const wide = 0.33 - u * 0.055;
    const p = panel(wide, 0.1, 0.055, 0.028);
    p.position.set(0, 0.075 + i * 0.118, 0.012);
    back.add(p);

    // The stitch line sitting in each channel.
    if (i < PADS - 1) {
      const stitch = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, wide - 0.03, 6), m.accent);
      stitch.rotation.z = Math.PI / 2;
      stitch.position.set(0, 0.134 + i * 0.118, 0.028);
      back.add(stitch);
    }
  }

  // Tall wings down both sides of the back.
  for (const sx of [-1, 1]) {
    const wing = pad(0.044, 0.44);
    wing.rotation.z = d2r(sx * -4);
    wing.rotation.y = d2r(sx * -13);
    wing.position.set(sx * 0.187, 0.3, 0.028);
    back.add(wing);

    const wingPipe = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.42, 7), m.accent);
    wingPipe.rotation.z = d2r(sx * -4);
    wingPipe.rotation.y = d2r(sx * -13);
    wingPipe.position.set(sx * 0.206, 0.3, 0.052);
    back.add(wingPipe);
  }

  /* The headrest shoulders, where the two wings meet over the
     top of the backrest. */
  const crown = pad(0.04, 0.26);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(0, 0.615, 0.01);
  back.add(crown);

  /* ── Cushions ──────────────────────────────────────────
     Both hang off straps, which is the detail that makes them
     read as accessories rather than as more chair. */
  const neck = panel(0.25, 0.115, 0.075, 0.045);
  neck.position.set(0, 0.575, 0.072);
  neck.rotation.x = d2r(12);
  back.add(neck);
  for (const sx of [-1, 1]) {
    const strap = mesh(new RoundedBoxGeometry(0.022, 0.17, 0.012, 2, 0.005), m.accent);
    strap.position.set(sx * 0.075, 0.6, 0.04);
    strap.rotation.x = d2r(-6);
    back.add(strap);
  }

  const lumbar = panel(0.26, 0.125, 0.08, 0.05);
  lumbar.position.set(0, 0.14, 0.072);
  lumbar.rotation.x = d2r(-6);
  back.add(lumbar);

  /* ── Armrests ──────────────────────────────────────────
     Post, bracket, pad. The bracket is what makes it look
     adjustable instead of welded on. */
  for (const sx of [-1, 1]) {
    const post = mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.17, 10), m.plastic);
    post.position.set(sx * 0.225, 0.17, -0.03);
    recliner.add(post);

    const bracket = mesh(new RoundedBoxGeometry(0.05, 0.035, 0.1, 3, 0.012), m.metal);
    bracket.position.set(sx * 0.225, 0.258, -0.025);
    recliner.add(bracket);

    const armPad = panel(0.072, 0.03, 0.235, 0.014, m.plastic);
    armPad.position.set(sx * 0.228, 0.282, -0.015);
    armPad.rotation.y = d2r(sx * -3);
    recliner.add(armPad);

    // A soft top on the pad, so it is not a plastic plank.
    const armTop = panel(0.062, 0.022, 0.215, 0.011);
    armTop.position.set(sx * 0.228, 0.3, -0.015);
    armTop.rotation.y = d2r(sx * -3);
    recliner.add(armTop);
  }

  return { group, recliner, glowRing, castors };
}
