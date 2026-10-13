import * as THREE from "three";
import type { Decor } from "./atelier-decor";

/**
 * The things in the room that are alive.
 *
 * A room full of static geometry is a photograph, however well it
 * is lit. What makes somewhere feel inhabited is that it is doing
 * something while you are not looking at it — and then does
 * something else when you do.
 *
 * So every item here has two layers. An idle loop that runs
 * forever whether or not anyone is watching: breathing, swaying,
 * blinking, the second hand moving. And a reaction that rises
 * when the cursor finds it. The reaction is never a swap to
 * another state; it is the same motion pushed further, because a
 * living thing that snaps between poses reads as a machine.
 *
 * Focus is a 0..1 number eased by the driver, never a boolean.
 */

export type LifeCtx = {
  /** How strongly this object is attended to, 0..1, already eased. */
  focus: number;
  /** Where the cursor is, in world space, for things that look back. */
  cursor: THREE.Vector3;
  /** Seconds since the scene started. */
  t: number;
  dt: number;
  reduced: boolean;
};

export type Life = {
  name: string;
  group: THREE.Group;
  /** The mesh the raycaster tests. Usually an invisible box. */
  hit?: THREE.Object3D;
  update: (ctx: LifeCtx) => void;
  /** Fired on click; returns true if it handled it. */
  poke?: () => void;
};

/* Deterministic noise so the room behaves identically every load. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Smooth, cheap, loops forever. Two sines beating against each other. */
function wobble(t: number, a: number, b: number): number {
  return Math.sin(t * a) * 0.65 + Math.sin(t * b + 1.7) * 0.35;
}

/**
 * How a chain of bones shares one bend.
 *
 * Every segment of a tail is parented to the one before it, so
 * equal angles do not hold steady — they accumulate. Three
 * segments given 0.6 radians each put the tip 1.8 radians over,
 * which is how a tail ends up swinging through a window.
 *
 * These weights sum to one, so the number passed in is the total
 * sweep from root to tip and the base carries most of it, which
 * is also how a real tail bends.
 */
const TAIL_W = [0.5, 0.31, 0.19];

/**
 * Three sines whose periods do not divide each other, so the sum
 * never repeats on any timescale a person watches for.
 *
 * A single sine is the thing that makes procedural motion read as
 * a machine: it is perfectly symmetric, it peaks on a beat, and
 * once the eye catches the beat it cannot unsee it. Beating a few
 * together costs nothing and the pattern stops being findable.
 */
function drift(t: number, speed = 1): number {
  return (
    Math.sin(t * 0.37 * speed) * 0.5 +
    Math.sin(t * 0.83 * speed + 2.1) * 0.33 +
    Math.sin(t * 1.61 * speed + 4.7) * 0.17
  );
}

/**
 * A thing that fires at uneven intervals.
 *
 * Twitches on a timer are the other tell. This holds a countdown
 * and rolls a fresh, randomly-sized gap each time it fires, so
 * ears flick and eyes blink on no schedule at all.
 */
function ticker(next: () => number, lo: number, hi: number) {
  let left = lo + next() * (hi - lo);
  return (dt: number): boolean => {
    left -= dt;
    if (left > 0) return false;
    left = lo + next() * (hi - lo);
    return true;
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function hitBox(
  w: number,
  h: number,
  d: number,
  name: string,
  keep: (x: { dispose: () => void }) => void,
): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.MeshBasicMaterial({ visible: false });
  keep(g);
  keep(m);
  const mesh = new THREE.Mesh(g, m);
  mesh.name = name;
  return mesh;
}

/* ══════════════════════════════════════════════════════════════
   THE CAT
   ══════════════════════════════════════════════════════════════ */

export function buildCat(keep: (x: { dispose: () => void }) => void): Life {
  const group = new THREE.Group();

  const fur = new THREE.MeshStandardMaterial({ color: 0x241f30, roughness: 0.95 });
  const furLight = new THREE.MeshStandardMaterial({ color: 0x322b42, roughness: 0.95 });
  const innerEar = new THREE.MeshStandardMaterial({ color: 0xc98ba6, roughness: 0.9 });
  keep(fur);
  keep(furLight);
  keep(innerEar);

  /* Body sits on its own pivot so breathing does not drag the
     head around with it. */
  const bodyPivot = new THREE.Group();
  const bodyGeo = new THREE.CapsuleGeometry(0.085, 0.11, 10, 24);
  keep(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, fur);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.085;
  body.castShadow = true;
  bodyPivot.add(body);

  // Haunch and front paws, so she reads as sitting rather than
  // as a cylinder lying down.
  const haunchGeo = new THREE.SphereGeometry(0.062, 18, 14);
  keep(haunchGeo);
  const haunch = new THREE.Mesh(haunchGeo, fur);
  haunch.position.set(-0.055, 0.07, 0.045);
  haunch.scale.set(1, 0.85, 0.8);
  haunch.castShadow = true;
  bodyPivot.add(haunch);

  const pawGeo = new THREE.CapsuleGeometry(0.018, 0.035, 6, 12);
  keep(pawGeo);
  for (const pz of [-0.04, 0.04]) {
    const paw = new THREE.Mesh(pawGeo, furLight);
    paw.rotation.x = Math.PI / 2;
    paw.position.set(0.085, 0.022, pz);
    bodyPivot.add(paw);
  }
  group.add(bodyPivot);

  /* Head, on a pivot at the neck. Everything facial parents to it
     so a turn of the head takes the eyes and ears with it. */
  const headPivot = new THREE.Group();
  headPivot.position.set(0.085, 0.15, 0);

  const headGeo = new THREE.SphereGeometry(0.068, 26, 20);
  keep(headGeo);
  const head = new THREE.Mesh(headGeo, fur);
  head.scale.set(1, 0.94, 1.02);
  head.castShadow = true;
  headPivot.add(head);

  const muzzleGeo = new THREE.SphereGeometry(0.034, 16, 12);
  keep(muzzleGeo);
  const muzzle = new THREE.Mesh(muzzleGeo, furLight);
  muzzle.position.set(0.05, -0.016, 0);
  muzzle.scale.set(0.8, 0.7, 1.1);
  headPivot.add(muzzle);

  const noseGeo = new THREE.SphereGeometry(0.008, 10, 8);
  keep(noseGeo);
  const nose = new THREE.Mesh(noseGeo, innerEar);
  nose.position.set(0.078, -0.008, 0);
  headPivot.add(nose);

  /* Ears, each on its own pivot at the base so they can rotate
     forward rather than slide. */
  const earGeo = new THREE.ConeGeometry(0.029, 0.058, 12);
  keep(earGeo);
  const earInGeo = new THREE.ConeGeometry(0.017, 0.036, 10);
  keep(earInGeo);

  const ears: THREE.Group[] = [];
  for (const ez of [-0.036, 0.036]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.004, 0.048, ez);
    const ear = new THREE.Mesh(earGeo, fur);
    ear.position.y = 0.028;
    ear.castShadow = true;
    pivot.add(ear);
    const inner = new THREE.Mesh(earInGeo, innerEar);
    inner.position.set(0.006, 0.026, 0);
    pivot.add(inner);
    // Resting splay: ears sit out and slightly back.
    pivot.rotation.x = ez > 0 ? 0.22 : -0.22;
    pivot.rotation.z = -0.1;
    headPivot.add(pivot);
    ears.push(pivot);
  }

  /* Eyes: a pale eyeball with a slit pupil that actually moves.
     Blinking scales the whole eye on Y, which is what a lid does. */
  const eyeGeo = new THREE.SphereGeometry(0.0145, 16, 12);
  keep(eyeGeo);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xd7f06a,
    emissive: 0x55701a,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });
  keep(eyeMat);
  const pupilGeo = new THREE.SphereGeometry(0.0075, 12, 10);
  keep(pupilGeo);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0a0a10 });
  keep(pupilMat);

  const eyes: THREE.Mesh[] = [];
  const pupils: THREE.Mesh[] = [];
  for (const ez of [-0.028, 0.028]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.052, 0.012, ez);
    headPivot.add(eye);
    eyes.push(eye);

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    // Slit, not a dot.
    pupil.scale.set(0.5, 1.5, 1);
    pupil.position.set(0.064, 0.012, ez);
    headPivot.add(pupil);
    pupils.push(pupil);
  }

  /* Blush, invisible until she is noticed. */
  const blushMat = new THREE.MeshBasicMaterial({
    color: 0xff7aa8,
    transparent: true,
    opacity: 0,
  });
  keep(blushMat);
  const blushGeo = new THREE.SphereGeometry(0.019, 14, 10);
  keep(blushGeo);
  const blush: THREE.Mesh[] = [];
  for (const bz of [-0.045, 0.045]) {
    const b = new THREE.Mesh(blushGeo, blushMat);
    b.position.set(0.044, -0.012, bz);
    b.scale.set(0.45, 0.7, 1);
    headPivot.add(b);
    blush.push(b);
  }

  // Whiskers.
  const whiskerMat = new THREE.MeshBasicMaterial({ color: 0x9c93ad });
  keep(whiskerMat);
  const whiskerGeo = new THREE.CylinderGeometry(0.0011, 0.0008, 0.07, 4);
  keep(whiskerGeo);
  for (const wz of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(whiskerGeo, whiskerMat);
      w.position.set(0.066, -0.008 + i * 0.008, wz * 0.022);
      w.rotation.z = Math.PI / 2;
      w.rotation.y = wz * (0.5 + i * 0.16);
      headPivot.add(w);
    }
  }

  group.add(headPivot);

  /* Tail: three segments, each parented to the last, so it curls
     rather than swinging as a rigid stick. */
  const tailRoot = new THREE.Group();
  tailRoot.position.set(-0.11, 0.075, 0);
  /* Cancels the yaw the whole cat is given when she is placed, so
     the tail runs along the sill rather than into the glass 10cm
     behind her. */
  tailRoot.rotation.y = 0.55;
  const tailSegs: THREE.Group[] = [];
  let parent: THREE.Object3D = tailRoot;
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    seg.position.x = i === 0 ? 0 : -0.07;
    const geo = new THREE.CapsuleGeometry(0.015 - i * 0.003, 0.06, 6, 10);
    keep(geo);
    const mesh = new THREE.Mesh(geo, fur);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.x = -0.035;
    mesh.castShadow = true;
    seg.add(mesh);
    parent.add(seg);
    parent = seg;
    tailSegs.push(seg);
  }
  group.add(tailRoot);

  const hit = hitBox(0.44, 0.38, 0.32, "cat", keep);
  hit.position.set(-0.01, 0.17, 0);
  group.add(hit);

  /* ── Behaviour ──────────────────────────────────────────── */
  const r = rand(1337);
  let blinkAt = 2 + r() * 3;
  let blinkPhase = -1; // -1 idle, otherwise 0..1 through the blink
  let twitchAt = 3 + r() * 4;
  let twitch = 0;
  let stretch = 0;
  // Where she is looking when nobody is interacting.
  const wander = new THREE.Vector3(1, 0.1, 0.4);
  let wanderAt = 0;

  const lookTarget = new THREE.Vector3();
  const headQuat = new THREE.Quaternion();
  const tmp = new THREE.Object3D();
  const groupQuat = new THREE.Quaternion();
  const invGroup = new THREE.Quaternion();
  const localDir = new THREE.Vector3();
  const aim = new THREE.Vector3();

  const update = ({ focus, cursor, t, dt, reduced }: LifeCtx) => {
    if (reduced) {
      blushMat.opacity = focus * 0.75;
      return;
    }

    // Breathing. Always, whether or not anyone is here.
    const breath = 1 + Math.sin(t * 1.5) * 0.022 + focus * 0.012;
    bodyPivot.scale.set(1, breath, 1 + (breath - 1) * 0.6);

    /* Blinking on a schedule, faster when she is alert. Lids are
       a scale, not a texture swap. */
    if (blinkPhase < 0 && t > blinkAt) {
      blinkPhase = 0;
      blinkAt = t + 2.2 + r() * 4.2 - focus * 1.2;
    }
    let lid = 1;
    if (blinkPhase >= 0) {
      blinkPhase += dt / 0.16;
      // Down and back up.
      lid = Math.abs(Math.cos(Math.min(1, blinkPhase) * Math.PI));
      lid = 0.07 + lid * 0.93;
      if (blinkPhase >= 1) blinkPhase = -1;
    }
    // Wider eyes when attended to.
    const open = lid * (1 + focus * 0.22);
    for (const e of eyes) e.scale.set(1, open, 1);
    for (const p of pupils) {
      // Slit opens in low light and when excited, which is also
      // simply what a cat's pupil does.
      p.scale.set(0.5 + focus * 0.5, 1.5 * open, 1);
      p.visible = lid > 0.2;
    }

    /* Ears. A slow idle drift, an occasional sharp twitch, and a
       forward perk that rises with attention. */
    if (t > twitchAt) {
      twitch = 1;
      twitchAt = t + 2.5 + r() * 5;
    }
    twitch = Math.max(0, twitch - dt * 4.5);
    const twitchKick = Math.sin(twitch * Math.PI * 3) * twitch * 0.35;

    ears.forEach((ear, i) => {
      const sign = i === 0 ? -1 : 1;
      const drift = wobble(t * 0.5 + i * 2, 1.1, 0.37) * 0.05;
      // Perk: rotate forward and bring them together.
      ear.rotation.x = sign * (0.22 - focus * 0.16) + drift;
      ear.rotation.z = -0.1 - focus * 0.26 + twitchKick * (i === 0 ? 1 : 0.6);
    });

    /* Looking. At the cursor when attended to, otherwise at
       whatever she has decided is interesting this minute. */
    if (t > wanderAt) {
      wander.set(0.6 + r() * 0.8, -0.2 + r() * 0.7, (r() - 0.5) * 1.6).normalize();
      wanderAt = t + 2.5 + r() * 4;
    }
    const worldHead = headPivot.getWorldPosition(new THREE.Vector3());
    if (focus > 0.01) {
      lookTarget.copy(cursor).sub(worldHead).normalize();
      lookTarget.lerp(wander, 1 - focus);
    } else {
      lookTarget.copy(wander);
    }

    /**
     * Aim the head.
     *
     * Two things were wrong here and together they made her spin.
     *
     * The correction rotations were applied to headPivot AFTER the
     * slerp, which meant the next frame's slerp started from an
     * already-corrected quaternion and added another quarter turn
     * to it. Every frame. The whole transform has to be composed
     * on a scratch object and slerped to once — never touched
     * afterwards.
     *
     * And headPivot's quaternion is relative to the cat, not the
     * world, so a world-space direction was the wrong frame
     * entirely. The target comes into her local space first.
     *
     * Then it is clamped, because cats do not have owl necks.
     */
    group.getWorldQuaternion(groupQuat);
    localDir.copy(lookTarget).applyQuaternion(invGroup.copy(groupQuat).invert()).normalize();

    const yaw = clamp(Math.atan2(-localDir.z, localDir.x), -1.0, 1.0);
    const pitch = clamp(Math.asin(clamp(localDir.y, -1, 1)), -0.4, 0.5);
    const cp = Math.cos(pitch);
    aim.set(Math.cos(yaw) * cp, Math.sin(pitch), -Math.sin(yaw) * cp);

    tmp.quaternion.identity();
    tmp.position.set(0, 0, 0);
    tmp.lookAt(aim);
    // lookAt puts +Z on the target; the model faces +X.
    tmp.rotateY(-Math.PI / 2);
    // A small tilt when curious. Nothing sells interest like it.
    tmp.rotateZ(focus * 0.17 * Math.sin(t * 0.8));
    headQuat.copy(tmp.quaternion);
    headPivot.quaternion.slerp(headQuat, Math.min(1, dt * 3.4));

    /* Tail.
     *
     * She is sitting on a sill 30cm deep with glass directly
     * behind her, and the tail is 32cm from root to tip — so it
     * cannot go backwards and it cannot go forwards. It lies
     * along the sill instead, which is what a cat on a ledge
     * actually does, and sways in that plane.
     *
     * `amp` is now the whole sweep rather than the angle given to
     * each segment; TAIL_W shares it out. The old code handed the
     * same angle to all three and they compounded, which is what
     * put the tip through the window. */
    const speed = 0.8 + focus * 1.5;
    const amp = 0.26 + focus * 0.4;
    tailSegs.forEach((seg, i) => {
      // A wave travelling outward, not three segments on one beat.
      const phase = t * speed - i * 0.55;
      const w = TAIL_W[i];
      seg.rotation.y = (Math.sin(phase) * amp + drift(t + i, 0.6) * 0.1) * w;
      /* A shallow arc along the ledge: lifted a little at the
         base, settling toward the tip. */
      seg.rotation.z = i === 0 ? 0.2 + focus * 0.22 : -0.14 + Math.cos(phase) * 0.07;
    });

    /* Blush and the stretch she does when poked. */
    blushMat.opacity += (focus * 0.8 - blushMat.opacity) * Math.min(1, dt * 5);
    if (stretch > 0) {
      stretch = Math.max(0, stretch - dt * 1.6);
      const s = Math.sin(stretch * Math.PI);
      bodyPivot.scale.x = 1 + s * 0.22;
      bodyPivot.position.x = -s * 0.03;
      headPivot.position.y = 0.15 + s * 0.02;
    } else {
      bodyPivot.position.x = 0;
      headPivot.position.y = 0.15;
    }
  };

  return {
    name: "cat",
    group,
    hit,
    update,
    poke: () => {
      stretch = 1;
      blinkAt = 0;
    },
  };
}

/* ══════════════════════════════════════════════════════════════
   PLANTS
   ══════════════════════════════════════════════════════════════ */

export type PlantKind = "monstera" | "snake" | "pothos" | "succulent";

/**
 * Veins.
 *
 * A leaf with no vein structure is a green shape, and ten green
 * shapes on a stem is a houseplant-shaped object. The midrib and
 * the laterals are most of what the eye uses to decide something
 * grew rather than was drawn.
 *
 * Deliberately near-white with darker veining rather than green:
 * the material's own colour is what the calendar repaints as the
 * seasons turn, and a coloured map would fight it. This supplies
 * the structure, the material supplies the hue.
 *
 * ExtrudeGeometry takes its uv straight from the shape's own
 * coordinates, and leafShape runs x over -wide..+wide and y over
 * 0..len — so the caller scales the map to its own leaf and the
 * midrib lands exactly down the middle every time.
 */
function leafTexture(): { map: THREE.Texture; rough: THREE.Texture } {
  const W = 192;
  const H = 384;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = rand(9021);

  g.fillStyle = "#e9e9e9";
  g.fillRect(0, 0, W, H);

  // Blotching, so the surface is not uniform before the veins go on.
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = 6 + r() * 26;
    g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "150,160,140"},${0.03 + r() * 0.05})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }

  // The midrib: thick at the stem, tapering to the tip.
  g.strokeStyle = "rgba(74,92,64,0.78)";
  g.lineCap = "round";
  for (let i = 0; i < 24; i++) {
    const t = i / 24;
    g.lineWidth = 15 * (1 - t) + 3.5;
    g.beginPath();
    g.moveTo(W / 2, H * t);
    g.lineTo(W / 2, H * (t + 1 / 24));
    g.stroke();
  }
  // A highlight just off the rib, which is what makes it read as raised.
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(W / 2 + 4, H * 0.04);
  g.lineTo(W / 2 + 2.5, H * 0.95);
  g.stroke();

  // Laterals, swept toward the tip, each with a few branchlets.
  g.strokeStyle = "rgba(78,96,68,0.62)";
  /* Seven, not eleven. At the distance the camera actually
     sits, a leaf is about a hundred pixels tall — eleven thin
     laterals average out to a flat wash, where seven thick ones
     still read as veins. */
  for (let i = 1; i <= 7; i++) {
    const t = i / 8;
    const y = H * t;
    const reach = Math.sin(t * Math.PI) * (W / 2) * 0.86;
    const rise = H * 0.085 * (1 - t * 0.4);
    for (const dir of [-1, 1]) {
      g.lineWidth = 6.5 * (1 - t * 0.45) + 1.6;
      g.beginPath();
      g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + dir * reach * 0.55, y + rise * 0.4, W / 2 + dir * reach, y + rise);
      g.stroke();
      // Branchlets off each lateral.
      g.lineWidth = 2.4;
      for (let b = 1; b <= 2; b++) {
        const f = b / 3;
        const bx = W / 2 + dir * reach * f;
        const by = y + rise * f * 0.8;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + dir * reach * 0.16, by + rise * 0.5);
        g.stroke();
      }
    }
  }

  /* A darker margin. Real leaves are thinner and darker at the
     rim, and at this size the rim is a bigger share of the leaf
     than any single vein. */
  const rim = g.createLinearGradient(0, 0, W, 0);
  rim.addColorStop(0, "rgba(40,54,34,0.5)");
  rim.addColorStop(0.17, "rgba(40,54,34,0)");
  rim.addColorStop(0.83, "rgba(40,54,34,0)");
  rim.addColorStop(1, "rgba(40,54,34,0.5)");
  g.fillStyle = rim;
  g.fillRect(0, 0, W, H);
  const tip = g.createLinearGradient(0, H, 0, H * 0.72);
  tip.addColorStop(0, "rgba(40,54,34,0.45)");
  tip.addColorStop(1, "rgba(40,54,34,0)");
  g.fillStyle = tip;
  g.fillRect(0, H * 0.72, W, H * 0.28);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;

  /* The same drawing read as roughness: the veins sit slightly
     glossier than the blade, which is how a real leaf catches a
     window. */
  const rc = document.createElement("canvas");
  rc.width = W;
  rc.height = H;
  const rg = rc.getContext("2d") as CanvasRenderingContext2D;
  rg.fillStyle = "#b4b4b4";
  rg.fillRect(0, 0, W, H);
  rg.globalAlpha = 0.75;
  rg.drawImage(c, 0, 0);
  const rough = new THREE.CanvasTexture(rc);
  rough.anisotropy = 4;
  rough.wrapS = THREE.ClampToEdgeWrapping;
  rough.wrapT = THREE.ClampToEdgeWrapping;

  return { map, rough };
}

/** A leaf as real geometry: an outline, extruded thin. */
function leafShape(len: number, wide: number, notched: boolean): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  const steps = 16;
  const side = (dir: number) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const span = Math.sin(t * Math.PI) * wide * (1 - t * 0.22);
      const cut = notched && i % 3 === 0 ? 0.4 : 1;
      s.lineTo(dir * span * cut, t * len);
    }
  };
  side(-1);
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const span = Math.sin(t * Math.PI) * wide * (1 - t * 0.22);
    const cut = notched && i % 3 === 0 ? 0.4 : 1;
    s.lineTo(span * cut, t * len);
  }
  s.lineTo(0, 0);
  return s;
}

/* ══════════════════════════════════════════════════════════════
   THE OTHER CAT — the one that does laps
   ══════════════════════════════════════════════════════════════ */

/**
 * A cat on a circuit.
 *
 * She walks the room, settles in her corner, sleeps for a while,
 * gets up and walks it the other way. The states are a small
 * machine rather than a timeline, because a timeline has to be
 * kept in step with the frame rate and a machine does not — and
 * because stopping to look at someone has to be able to happen in
 * the middle of any of it.
 *
 * The gait is a diagonal one: front-left swings with back-right.
 * That is what cats actually do at a walk, and it is also the
 * thing your eye notices immediately when it is wrong.
 */
export function buildWalkingCat(
  path: THREE.Vector3[],
  keep: (x: { dispose: () => void }) => void,
): Life {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  const fur = new THREE.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 0.93 });
  const furPale = new THREE.MeshStandardMaterial({ color: 0xb49070, roughness: 0.93 });
  const innerEar = new THREE.MeshStandardMaterial({ color: 0xc98ba6, roughness: 0.9 });
  keep(fur);
  keep(furPale);
  keep(innerEar);

  /* Body, slung between the shoulders and the hips. */
  const bodyPivot = new THREE.Group();
  const bodyGeo = new THREE.CapsuleGeometry(0.062, 0.17, 8, 18);
  keep(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, fur);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  bodyPivot.add(body);

  const chestGeo = new THREE.SphereGeometry(0.058, 16, 12);
  keep(chestGeo);
  const chest = new THREE.Mesh(chestGeo, fur);
  chest.position.set(0.09, -0.004, 0);
  chest.castShadow = true;
  bodyPivot.add(chest);
  const rump = new THREE.Mesh(chestGeo, fur);
  rump.position.set(-0.1, 0.004, 0);
  rump.scale.setScalar(1.05);
  rump.castShadow = true;
  bodyPivot.add(rump);
  bodyPivot.position.y = 0.17;
  rig.add(bodyPivot);

  /* Head on its own pivot at the neck. */
  const headPivot = new THREE.Group();
  headPivot.position.set(0.17, 0.215, 0);
  const headGeo = new THREE.SphereGeometry(0.055, 22, 16);
  keep(headGeo);
  const head = new THREE.Mesh(headGeo, fur);
  head.castShadow = true;
  headPivot.add(head);
  const muzzleGeo = new THREE.SphereGeometry(0.028, 14, 10);
  keep(muzzleGeo);
  const muzzle = new THREE.Mesh(muzzleGeo, furPale);
  muzzle.position.set(0.042, -0.013, 0);
  muzzle.scale.set(0.85, 0.7, 1.1);
  headPivot.add(muzzle);

  const earGeo = new THREE.ConeGeometry(0.024, 0.046, 10);
  keep(earGeo);
  const earInGeo = new THREE.ConeGeometry(0.013, 0.028, 8);
  keep(earInGeo);
  const ears: THREE.Group[] = [];
  for (const ez of [-0.03, 0.03]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.006, 0.04, ez);
    const ear = new THREE.Mesh(earGeo, fur);
    ear.position.y = 0.022;
    ear.castShadow = true;
    pivot.add(ear);
    const inner = new THREE.Mesh(earInGeo, innerEar);
    inner.position.set(0.005, 0.02, 0);
    pivot.add(inner);
    pivot.rotation.x = ez > 0 ? 0.2 : -0.2;
    headPivot.add(pivot);
    ears.push(pivot);
  }

  const eyeGeo = new THREE.SphereGeometry(0.0105, 12, 10);
  keep(eyeGeo);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x6fd8e8,
    emissive: 0x1d5a66,
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });
  keep(eyeMat);
  const eyes: THREE.Mesh[] = [];
  for (const ez of [-0.023, 0.023]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.042, 0.01, ez);
    headPivot.add(eye);
    eyes.push(eye);
  }
  rig.add(headPivot);

  /* Four legs. Each is one pivot at the shoulder or hip with a
     single segment hanging off it — at this size a second joint
     costs geometry and buys nothing you can see. */
  const legGeo = new THREE.CapsuleGeometry(0.016, 0.1, 6, 10);
  keep(legGeo);
  const pawGeo = new THREE.SphereGeometry(0.021, 10, 8);
  keep(pawGeo);
  type Leg = { pivot: THREE.Group; phase: number };
  const legs: Leg[] = [];
  // Diagonal gait: front-left with back-right.
  const legSpec: Array<[number, number, number]> = [
    [0.085, -0.045, 0],
    [0.085, 0.045, Math.PI],
    [-0.095, -0.045, Math.PI],
    [-0.095, 0.045, 0],
  ];
  for (const [lx, lz, phase] of legSpec) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.155, lz);
    const seg = new THREE.Mesh(legGeo, fur);
    seg.position.y = -0.055;
    seg.castShadow = true;
    pivot.add(seg);
    const paw = new THREE.Mesh(pawGeo, furPale);
    paw.position.y = -0.112;
    paw.scale.set(1, 0.7, 1.1);
    pivot.add(paw);
    rig.add(pivot);
    legs.push({ pivot, phase });
  }

  /* Tail, three segments chained so it curls. */
  const tailRoot = new THREE.Group();
  tailRoot.position.set(-0.15, 0.185, 0);
  const tailSegs: THREE.Group[] = [];
  let parent: THREE.Object3D = tailRoot;
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    seg.position.x = i === 0 ? 0 : -0.06;
    const g = new THREE.CapsuleGeometry(0.013 - i * 0.003, 0.05, 6, 8);
    keep(g);
    const mesh = new THREE.Mesh(g, fur);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.x = -0.03;
    mesh.castShadow = true;
    seg.add(mesh);
    parent.add(seg);
    parent = seg;
    tailSegs.push(seg);
  }
  rig.add(tailRoot);

  const hit = hitBox(0.44, 0.36, 0.3, "cat2", keep);
  hit.position.set(0, 0.18, 0);
  rig.add(hit);

  /* ── The circuit ───────────────────────────────────────── */
  const r = rand(5150);
  type Mode = "walk" | "settle" | "rest" | "rise";
  let mode: Mode = "walk";
  let leg = 0;          // which segment of the path
  let along = 0;        // 0..1 through that segment
  let dir: 1 | -1 = 1;  // which way round
  let down = 0;         // 0 standing, 1 lying
  let restLeft = 0;
  let stride = 0;
  let blinkAt = 3;
  let blinkPhase = -1;

  const SPEED = 0.34;   // metres a second
  const pos = new THREE.Vector3().copy(path[0]);
  const look = new THREE.Vector3();
  const seg = new THREE.Vector3();
  let yaw = 0;

  const update = ({ focus, cursor, t, dt, reduced }: LifeCtx) => {
    if (reduced) {
      group.position.copy(path[path.length - 1]);
      return;
    }

    /* Pausing to look at someone can interrupt any state, which is
       why the gait is driven by distance travelled rather than by
       the clock — stop moving and the legs stop with you. */
    const attention = focus;
    const pace = mode === "walk" ? (1 - attention * 0.92) : 0;

    if (mode === "walk") {
      const a = path[leg];
      const b = path[leg + dir] ?? path[leg];
      seg.subVectors(b, a);
      const len = Math.max(0.0001, seg.length());
      along += (SPEED * pace * dt) / len;

      if (along >= 1) {
        along = 0;
        leg += dir;
        const atEnd = dir === 1 ? leg >= path.length - 1 : leg <= 0;
        if (atEnd) {
          leg = Math.max(0, Math.min(path.length - 1, leg));
          // The far end of the circuit is the corner she sleeps in.
          if (dir === 1) {
            mode = "settle";
          } else {
            dir = 1;
          }
        }
      }
      pos.copy(a).addScaledVector(seg, along);
      if (len > 0.0001 && pace > 0.01) {
        const d = seg.clone().normalize();
        yaw = Math.atan2(-d.z, d.x);
      }
      stride += SPEED * pace * dt * 11;
    } else if (mode === "settle") {
      down = Math.min(1, down + dt * 1.5);
      if (down >= 1) {
        mode = "rest";
        restLeft = 14 + r() * 18;
      }
    } else if (mode === "rest") {
      restLeft -= dt;
      // Someone paying attention is worth getting up for.
      if (restLeft <= 0 || attention > 0.75) mode = "rise";
    } else {
      down = Math.max(0, down - dt * 1.1);
      if (down <= 0) {
        mode = "walk";
        dir = -1;
        leg = path.length - 1;
        along = 0;
      }
    }

    group.position.copy(pos);
    group.rotation.y += (yaw - group.rotation.y) * Math.min(1, dt * 4);

    /* Gait. Legs swing, the body rises on each pair of steps, and
       all of it folds away as she lies down. */
    const stand = 1 - down;
    for (const l of legs) {
      const swing = Math.sin(stride + l.phase) * 0.5 * stand;
      // Tucked under her when lying.
      l.pivot.rotation.z = swing;
      l.pivot.rotation.x = down * (l.pivot.position.z > 0 ? -1.25 : 1.25);
      l.pivot.position.y = 0.155 - down * 0.1;
    }
    bodyPivot.position.y = 0.17 - down * 0.098 + Math.sin(stride * 2) * 0.006 * stand;
    bodyPivot.rotation.z = Math.sin(stride * 2 + 0.6) * 0.03 * stand;

    /* Head: bobs with the walk, turns to whoever is looking. */
    headPivot.position.set(
      0.17 - down * 0.02,
      0.215 - down * 0.112 + Math.sin(stride * 2 + 1.2) * 0.005 * stand,
      0,
    );
    let wantPitch = -down * 0.25;
    let wantYaw = 0;
    if (attention > 0.02) {
      look.copy(cursor).sub(group.getWorldPosition(new THREE.Vector3()));
      const localYaw = Math.atan2(-look.z, look.x) - group.rotation.y;
      wantYaw = clamp(Math.atan2(Math.sin(localYaw), Math.cos(localYaw)), -1.1, 1.1) * attention;
      wantPitch += clamp(Math.atan2(look.y - 0.2, Math.hypot(look.x, look.z)), -0.3, 0.6) * attention;
    }
    headPivot.rotation.y += (wantYaw - headPivot.rotation.y) * Math.min(1, dt * 4);
    headPivot.rotation.z += (wantPitch - headPivot.rotation.z) * Math.min(1, dt * 4);

    for (const [i, ear] of ears.entries()) {
      const sign = i === 0 ? -1 : 1;
      ear.rotation.x = sign * (0.2 - attention * 0.14) - down * 0.1;
    }

    if (blinkPhase < 0 && t > blinkAt) {
      blinkPhase = 0;
      blinkAt = t + 2.5 + r() * 4;
    }
    let lid = 1;
    if (blinkPhase >= 0) {
      blinkPhase += dt / 0.15;
      lid = 0.08 + Math.abs(Math.cos(Math.min(1, blinkPhase) * Math.PI)) * 0.92;
      if (blinkPhase >= 1) blinkPhase = -1;
    }
    // Asleep, the eyes stay shut.
    const open = lid * (1 - down * 0.86);
    for (const e of eyes) e.scale.set(1, Math.max(0.05, open), 1);

    /* Tail. Counterweight at a walk, curled around her at rest.
     *
     * Same fix as the sitting cat: these angles are shares of one
     * total, not three copies of it. Handing every segment
     * `down * 0.55` meant the curl reached 1.65 radians at the
     * tip and wrapped the tail through her own flank. */
    tailSegs.forEach((s2, i) => {
      const phase = stride * 0.5 - i * 0.6;
      const w = TAIL_W[i];
      // Swings with the gait, plus a slow wander that is not on the beat.
      const swish = (Math.sin(phase) * (0.3 + attention * 0.5) + drift(t + i * 1.7, 0.8) * 0.18) * stand;
      s2.rotation.y = (swish + down * 0.9) * w;
      s2.rotation.z =
        i === 0
          ? (0.42 + attention * 0.5) * stand - down * 0.42
          : (-0.1 + Math.cos(phase) * 0.08 * stand + down * 0.3) * w * 2;
    });
  };

  return {
    name: "cat2",
    group,
    hit,
    update,
    poke: () => {
      // Woken, or at least acknowledged.
      if (mode === "rest") mode = "rise";
      blinkAt = 0;
    },
  };
}

export function buildPlant(
  kind: PlantKind,
  seed: number,
  keep: (x: { dispose: () => void }) => void,
): Life {
  const group = new THREE.Group();
  const r = rand(seed);

  const potMat = new THREE.MeshStandardMaterial({ color: 0xa4663f, roughness: 0.88 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 1 });
  const veins = leafTexture();
  keep(veins.map);
  keep(veins.rough);
  const leafA = new THREE.MeshStandardMaterial({
    color: 0x3f7a42,
    roughness: 0.58,
    side: THREE.DoubleSide,
    map: veins.map,
    roughnessMap: veins.rough,
  });
  const leafB = new THREE.MeshStandardMaterial({
    color: 0x5a9e4f,
    roughness: 0.58,
    side: THREE.DoubleSide,
    map: veins.map.clone(),
    roughnessMap: veins.rough,
  });
  keep(leafB.map!);
  // Flipped, so the two materials are not the same leaf twice.
  leafB.map!.repeat.x = -1;
  // Tagged so the season can repaint every plant in the room by
  // walking the graph once, rather than each plant having to hold
  // its own reference back up to the driver.
  leafA.userData.leaf = "a";
  leafB.userData.leaf = "b";
  keep(potMat);
  keep(soilMat);
  keep(leafA);
  keep(leafB);

  const spec = {
    monstera: { pot: 0.22, potH: 0.3, count: 10, len: 0.34, wide: 0.15, notched: true, stem: true },
    snake: { pot: 0.17, potH: 0.26, count: 13, len: 0.62, wide: 0.04, notched: false, stem: false },
    pothos: { pot: 0.085, potH: 0.11, count: 0, len: 0.07, wide: 0.045, notched: false, stem: false },
    succulent: { pot: 0.05, potH: 0.065, count: 14, len: 0.075, wide: 0.026, notched: false, stem: false },
  }[kind];

  /* Fit the vein map to this plant's leaf. leafShape runs x over
     -wide..+wide and y over 0..len, and ExtrudeGeometry hands
     those straight through as uv, so this puts the midrib down
     the centre of the blade whatever size it is. */
  for (const m of [leafA, leafB]) {
    const t = m.map!;
    t.repeat.set((t.repeat.x < 0 ? -1 : 1) / (spec.wide * 2), 1 / spec.len);
    t.offset.set(0.5, 0);
    t.needsUpdate = true;
  }
  veins.rough.repeat.set(1 / (spec.wide * 2), 1 / spec.len);
  veins.rough.offset.set(0.5, 0);
  veins.rough.needsUpdate = true;

  const potGeo = new THREE.CylinderGeometry(spec.pot, spec.pot * 0.76, spec.potH, 28);
  keep(potGeo);
  const pot = new THREE.Mesh(potGeo, potMat);
  pot.position.y = spec.potH / 2;
  pot.castShadow = true;
  pot.receiveShadow = true;
  group.add(pot);

  const lipGeo = new THREE.TorusGeometry(spec.pot, spec.pot * 0.07, 8, 28);
  keep(lipGeo);
  const lip = new THREE.Mesh(lipGeo, potMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = spec.potH;
  group.add(lip);

  const soilGeo = new THREE.CylinderGeometry(spec.pot * 0.93, spec.pot * 0.93, 0.018, 24);
  keep(soilGeo);
  const soil = new THREE.Mesh(soilGeo, soilMat);
  soil.position.y = spec.potH - 0.01;
  group.add(soil);

  /* Each leaf gets its own pivot and its own phase, which is the
     only way a plant sways like a plant instead of like a flag. */
  const leaves: Array<{ pivot: THREE.Group; phase: number; lean: number }> = [];

  const addLeaf = (
    len: number,
    wide: number,
    notched: boolean,
    pos: THREE.Vector3,
    rot: THREE.Euler,
    mat: THREE.Material,
  ) => {
    const geo = new THREE.ExtrudeGeometry(leafShape(len, wide, notched), {
      depth: 0.004,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.0025,
      bevelSegments: 1,
      curveSegments: 4,
    });
    keep(geo);
    const pivot = new THREE.Group();
    pivot.position.copy(pos);
    pivot.rotation.copy(rot);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    leaves.push({ pivot, phase: r() * 6.28, lean: rot.z });
    return pivot;
  };

  if (kind === "monstera") {
    for (let i = 0; i < spec.count; i++) {
      const a = (i / spec.count) * Math.PI * 2 + r() * 0.6;
      const tilt = 0.35 + r() * 0.5;
      const stemLen = 0.26 + r() * 0.34;

      const stemGeo = new THREE.CylinderGeometry(0.008, 0.011, stemLen, 8);
      keep(stemGeo);
      const stem = new THREE.Mesh(stemGeo, leafA);
      stem.position.set(Math.cos(a) * 0.045, spec.potH + stemLen / 2, Math.sin(a) * 0.045);
      stem.rotation.z = Math.cos(a) * tilt;
      stem.rotation.x = -Math.sin(a) * tilt;
      stem.castShadow = true;
      group.add(stem);

      addLeaf(
        spec.len + r() * 0.1,
        spec.wide,
        true,
        new THREE.Vector3(
          Math.cos(a) * (0.045 + Math.sin(tilt) * stemLen),
          spec.potH + Math.cos(tilt) * stemLen,
          Math.sin(a) * (0.045 + Math.sin(tilt) * stemLen),
        ),
        new THREE.Euler(-1.0 - r() * 0.5, a + r(), r() * 0.5 - 0.25),
        i % 2 ? leafA : leafB,
      );
    }
  } else if (kind === "snake") {
    for (let i = 0; i < spec.count; i++) {
      const a = (i / spec.count) * Math.PI * 2 + r();
      addLeaf(
        spec.len * (0.7 + r() * 0.6),
        spec.wide,
        false,
        new THREE.Vector3(Math.cos(a) * 0.05 * r(), spec.potH - 0.02, Math.sin(a) * 0.05 * r()),
        new THREE.Euler(-0.06 + r() * 0.12, a, Math.cos(a) * (0.06 + r() * 0.2)),
        i % 3 ? leafA : leafB,
      );
    }
  } else if (kind === "pothos") {
    for (let v = 0; v < 4; v++) {
      const dir = v - 1.5;
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        addLeaf(
          spec.len,
          spec.wide,
          false,
          new THREE.Vector3(
            dir * 0.03 + Math.sin(t * 5 + v) * 0.045,
            spec.potH - t * (0.42 + v * 0.13),
            Math.cos(t * 4 + v) * 0.045,
          ),
          new THREE.Euler(-1.4 + r() * 0.6, r() * 6, r() * 6),
          i % 2 ? leafA : leafB,
        );
      }
    }
  } else {
    for (let i = 0; i < spec.count; i++) {
      const a = (i / spec.count) * Math.PI * 2;
      const ring = Math.floor(i / 7);
      addLeaf(
        spec.len * (1 - ring * 0.3),
        spec.wide,
        false,
        new THREE.Vector3(Math.cos(a) * 0.016, spec.potH - 0.004, Math.sin(a) * 0.016),
        new THREE.Euler(-0.55 - ring * 0.35, a, 0),
        i % 2 ? leafA : leafB,
      );
    }
  }

  const hit = hitBox(
    spec.pot * 3.2,
    spec.potH + spec.len * 1.4,
    spec.pot * 3.2,
    `plant-${kind}-${seed}`,
    keep,
  );
  hit.position.y = (spec.potH + spec.len * 1.4) / 2;
  group.add(hit);

  const update = ({ focus, t, dt, reduced }: LifeCtx) => {
    if (reduced) return;
    // Draught from the window, always. Stronger, and with a tiny
    // lift, when someone is paying attention to it.
    const gust = 0.5 + 0.5 * Math.sin(t * 0.23);
    for (const l of leaves) {
      const s = wobble(t * 0.9 + l.phase, 1, 0.41);
      l.pivot.rotation.z = l.lean + s * (0.035 + gust * 0.03 + focus * 0.07);
      l.pivot.rotation.x += (s * 0.012 * focus - l.pivot.rotation.x * 0.02) * dt * 2;
    }
    const lift = 1 + focus * 0.035;
    group.scale.setScalar(group.scale.x + (lift - group.scale.x) * Math.min(1, dt * 6));
  };

  return { name: `plant-${kind}-${seed}`, group, hit, update };
}

/* ══════════════════════════════════════════════════════════════
   STEAM
   ══════════════════════════════════════════════════════════════ */

export function buildSteam(keep: (x: { dispose: () => void }) => void): Life {
  const group = new THREE.Group();
  const COUNT = 40;

  const pos = new Float32Array(COUNT * 3);
  const seedAttr = new Float32Array(COUNT);
  const r = rand(404);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (r() - 0.5) * 0.03;
    pos[i * 3 + 1] = r() * 0.16;
    pos[i * 3 + 2] = (r() - 0.5) * 0.03;
    seedAttr[i] = r();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seedAttr, 1));
  keep(geo);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBoost: { value: 0 } },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform float uBoost;
      varying float vFade;
      void main() {
        float life = fract(uTime * (0.12 + aSeed * 0.08) + aSeed);
        vec3 p = position;
        p.y += life * (0.17 + uBoost * 0.1);
        // Drift sideways as it rises, the way steam actually goes.
        p.x += sin(life * 6.0 + aSeed * 20.0) * 0.022 * life;
        p.z += cos(life * 5.0 + aSeed * 14.0) * 0.016 * life;
        vFade = sin(life * 3.1415) * (0.5 + uBoost * 0.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (5.0 + life * 26.0) * (1.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(d));
        gl_FragColor = vec4(vec3(0.85, 0.88, 0.95), a * a * vFade * 0.3);
      }
    `,
  });
  keep(mat);

  const pts = new THREE.Points(geo, mat);
  group.add(pts);

  const update = ({ focus, t, reduced }: LifeCtx) => {
    if (reduced) {
      mat.uniforms.uTime.value = 0;
      return;
    }
    mat.uniforms.uTime.value = t;
    mat.uniforms.uBoost.value = focus;
  };

  return { name: "steam", group, update };
}

/* ══════════════════════════════════════════════════════════════
   CLOCK — real hands, real time
   ══════════════════════════════════════════════════════════════ */

export function buildClock(keep: (x: { dispose: () => void }) => void): Life {
  const group = new THREE.Group();

  const caseMat = new THREE.MeshStandardMaterial({ color: 0x241f2e, roughness: 0.5 });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.62 });
  const handMat = new THREE.MeshStandardMaterial({ color: 0x1a1620, roughness: 0.4 });
  const secMat = new THREE.MeshStandardMaterial({
    color: 0xd05a4a,
    emissive: 0x4a1a12,
    emissiveIntensity: 0.6,
    roughness: 0.4,
  });
  keep(caseMat);
  keep(faceMat);
  keep(handMat);
  keep(secMat);

  const R = 0.115;
  const bodyGeo = new THREE.CylinderGeometry(R, R, 0.03, 40);
  keep(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, caseMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);

  const faceGeo = new THREE.CircleGeometry(R * 0.92, 40);
  keep(faceGeo);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = 0.016;
  group.add(face);

  // Hour ticks.
  const tickGeo = new THREE.BoxGeometry(0.006, 0.016, 0.002);
  keep(tickGeo);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(tickGeo, handMat);
    tick.position.set(Math.sin(a) * R * 0.78, Math.cos(a) * R * 0.78, 0.018);
    tick.rotation.z = -a;
    group.add(tick);
  }

  /* Hands on pivots at the centre, each offset so it rotates about
     its end rather than its middle. */
  const mkHand = (len: number, w: number, mat: THREE.Material, z: number) => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    const geo = new THREE.BoxGeometry(w, len, 0.003);
    keep(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = len / 2 - len * 0.16;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };

  const hourHand = mkHand(R * 0.52, 0.009, handMat, 0.019);
  const minHand = mkHand(R * 0.76, 0.006, handMat, 0.021);
  const secHand = mkHand(R * 0.84, 0.003, secMat, 0.023);

  const capGeo = new THREE.SphereGeometry(0.008, 12, 10);
  keep(capGeo);
  const cap = new THREE.Mesh(capGeo, secMat);
  cap.position.z = 0.025;
  group.add(cap);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.1,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.6,
  });
  keep(glassMat);
  const glassGeo = new THREE.CircleGeometry(R * 0.93, 32);
  keep(glassGeo);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.z = 0.027;
  group.add(glass);

  const hit = hitBox(R * 2.2, R * 2.2, 0.08, "clock", keep);
  group.add(hit);

  const update = ({ focus, reduced }: LifeCtx) => {
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;

    hourHand.rotation.z = -(h / 12) * Math.PI * 2;
    minHand.rotation.z = -(m / 60) * Math.PI * 2;
    // A real second hand ticks. Sweeping it is the cheaper lie.
    secHand.rotation.z = -(reduced ? Math.floor(s) / 60 : s / 60) * Math.PI * 2;

    secMat.emissiveIntensity = 0.6 + focus * 1.4;
  };

  return { name: "clock", group, hit, update };
}

/* ══════════════════════════════════════════════════════════════
   DECOR — what the calendar puts in the corner
   ══════════════════════════════════════════════════════════════ */

export type DecorSet = {
  group: THREE.Group;
  show: (key: Decor) => void;
  update: (ctx: LifeCtx) => void;
  hits: THREE.Object3D[];
};

export function buildDecor(
  keep: (x: { dispose: () => void }) => void,
  anchors: { corner: THREE.Vector3; desk: THREE.Vector3; sill: THREE.Vector3 },
): DecorSet {
  const group = new THREE.Group();
  const hits: THREE.Object3D[] = [];
  const r = rand(909);

  /* ── Christmas tree ───────────────────────────────────── */
  const tree = new THREE.Group();
  {
    const needleMat = new THREE.MeshStandardMaterial({ color: 0x22512e, roughness: 0.88 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.92 });
    keep(needleMat);
    keep(trunkMat);

    const potGeo = new THREE.CylinderGeometry(0.17, 0.14, 0.18, 20);
    keep(potGeo);
    const pot = new THREE.Mesh(potGeo, trunkMat);
    pot.position.y = 0.09;
    pot.castShadow = true;
    tree.add(pot);

    const trunkGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.3, 10);
    keep(trunkGeo);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.3;
    tree.add(trunk);

    // Four tiers, each a cone, narrowing upward.
    const tiers = [
      { y: 0.42, r: 0.42, h: 0.42 },
      { y: 0.68, r: 0.34, h: 0.38 },
      { y: 0.92, r: 0.26, h: 0.34 },
      { y: 1.13, r: 0.17, h: 0.3 },
    ];
    for (const tier of tiers) {
      const g = new THREE.ConeGeometry(tier.r, tier.h, 20);
      keep(g);
      const cone = new THREE.Mesh(g, needleMat);
      cone.position.y = tier.y + tier.h / 2;
      cone.castShadow = true;
      cone.receiveShadow = true;
      tree.add(cone);
    }

    // Baubles and lights. The lights are emissive so the bloom
    // pass picks them up and the tree actually glows in the dark.
    const baubleGeo = new THREE.SphereGeometry(0.026, 12, 10);
    keep(baubleGeo);
    const lightGeo = new THREE.SphereGeometry(0.013, 8, 6);
    keep(lightGeo);
    const baubleCols = [0xc02a3a, 0xd8a53a, 0x2f6fa8, 0xd8d2c4];
    const bulbs: THREE.Mesh[] = [];

    for (let i = 0; i < 38; i++) {
      const tier = tiers[Math.floor(r() * tiers.length)];
      const a = r() * Math.PI * 2;
      const up = r();
      const rad = tier.r * (1 - up) * 0.92;
      const y = tier.y + up * tier.h;

      if (i % 3 === 0) {
        const m = new THREE.MeshStandardMaterial({
          color: baubleCols[Math.floor(r() * baubleCols.length)],
          roughness: 0.18,
          metalness: 0.75,
        });
        keep(m);
        const b = new THREE.Mesh(baubleGeo, m);
        b.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
        b.castShadow = true;
        tree.add(b);
      } else {
        const m = new THREE.MeshBasicMaterial({ color: r() > 0.5 ? 0xffd79a : 0xff8f6a });
        keep(m);
        const b = new THREE.Mesh(lightGeo, m);
        b.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
        b.userData.phase = r() * 6.28;
        tree.add(b);
        bulbs.push(b);
      }
    }

    // A star, built from two crossed tetrahedra rather than a
    // five-pointed cutout — reads better at this size.
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    keep(starMat);
    const starGeo = new THREE.OctahedronGeometry(0.055, 0);
    keep(starGeo);
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.y = 1.5;
    star.scale.set(1, 1.5, 1);
    tree.add(star);

    const treeLight = new THREE.PointLight(0xffb070, 1.4, 2.6, 2);
    treeLight.position.set(0, 0.8, 0.2);
    tree.add(treeLight);

    tree.userData = { bulbs, star, treeLight };
    tree.position.copy(anchors.corner);

    const hit = hitBox(0.9, 1.6, 0.9, "tree", keep);
    hit.position.copy(anchors.corner);
    hit.position.y += 0.8;
    hits.push(hit);
    group.add(hit);
  }
  group.add(tree);

  /* ── Pumpkin ──────────────────────────────────────────── */
  const pumpkin = new THREE.Group();
  {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd4681f, roughness: 0.72 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a5a28, roughness: 0.9 });
    keep(skin);
    keep(stemMat);

    // Ribs: overlapping squashed spheres, which is how a pumpkin
    // is actually shaped.
    const ribGeo = new THREE.SphereGeometry(0.055, 16, 12);
    keep(ribGeo);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rib = new THREE.Mesh(ribGeo, skin);
      rib.position.set(Math.cos(a) * 0.022, 0.05, Math.sin(a) * 0.022);
      rib.scale.set(1, 0.78, 1);
      rib.castShadow = true;
      pumpkin.add(rib);
    }
    const stemGeo = new THREE.CylinderGeometry(0.008, 0.013, 0.05, 8);
    keep(stemGeo);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.1;
    stem.rotation.z = 0.2;
    pumpkin.add(stem);

    // Carved face: emissive planes on the front, lit from inside.
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb13a });
    keep(glowMat);
    const eyeGeo = new THREE.CircleGeometry(0.014, 3);
    keep(eyeGeo);
    for (const ex of [-0.022, 0.022]) {
      const eye = new THREE.Mesh(eyeGeo, glowMat);
      eye.position.set(ex, 0.058, 0.073);
      eye.rotation.z = ex > 0 ? -0.3 : 0.3;
      pumpkin.add(eye);
    }
    const mouthGeo = new THREE.CircleGeometry(0.018, 3);
    keep(mouthGeo);
    const mouth = new THREE.Mesh(mouthGeo, glowMat);
    mouth.position.set(0, 0.026, 0.073);
    mouth.rotation.z = Math.PI;
    mouth.scale.set(1.5, 0.8, 1);
    pumpkin.add(mouth);

    const inner = new THREE.PointLight(0xff9a30, 0.9, 0.8, 2);
    inner.position.set(0, 0.05, 0.03);
    pumpkin.add(inner);
    pumpkin.userData = { inner };

    pumpkin.position.copy(anchors.desk);
    const hit = hitBox(0.16, 0.18, 0.16, "pumpkin", keep);
    hit.position.copy(anchors.desk);
    hit.position.y += 0.07;
    hits.push(hit);
    group.add(hit);
  }
  group.add(pumpkin);

  /* ── Spring flowers ───────────────────────────────────── */
  const flowers = new THREE.Group();
  {
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe0e8,
      transparent: true,
      opacity: 0.35,
      roughness: 0.08,
      transmission: 0.8,
    });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4e8a46, roughness: 0.8 });
    keep(glassMat);
    keep(stemMat);

    const vaseGeo = new THREE.CylinderGeometry(0.038, 0.028, 0.12, 20, 1, true);
    keep(vaseGeo);
    const vase = new THREE.Mesh(vaseGeo, glassMat);
    vase.position.y = 0.06;
    flowers.add(vase);

    const petalCols = [0xe8809f, 0xf0c05a, 0xd8d2e8, 0xe4675f];
    const heads: THREE.Group[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const lean = 0.1 + r() * 0.25;
      const len = 0.16 + r() * 0.1;

      const sGeo = new THREE.CylinderGeometry(0.0035, 0.0045, len, 6);
      keep(sGeo);
      const stem = new THREE.Mesh(sGeo, stemMat);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.1, 0);
      pivot.rotation.z = Math.cos(a) * lean;
      pivot.rotation.x = -Math.sin(a) * lean;
      stem.position.y = len / 2;
      pivot.add(stem);

      const headG = new THREE.Group();
      headG.position.y = len;
      const col = petalCols[i % petalCols.length];
      const pMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.68 });
      keep(pMat);
      const petalGeo = new THREE.SphereGeometry(0.016, 10, 8);
      keep(petalGeo);
      for (let p = 0; p < 6; p++) {
        const pa = (p / 6) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeo, pMat);
        petal.position.set(Math.cos(pa) * 0.016, 0, Math.sin(pa) * 0.016);
        petal.scale.set(1, 0.45, 1);
        headG.add(petal);
      }
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xf0d878, roughness: 0.6 });
      keep(coreMat);
      const coreGeo = new THREE.SphereGeometry(0.009, 10, 8);
      keep(coreGeo);
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.scale.y = 0.6;
      headG.add(core);

      pivot.add(headG);
      flowers.add(pivot);
      heads.push(pivot);
    }
    flowers.userData = { heads };
    flowers.position.copy(anchors.desk);

    const hit = hitBox(0.22, 0.34, 0.22, "flowers", keep);
    hit.position.copy(anchors.desk);
    hit.position.y += 0.16;
    hits.push(hit);
    group.add(hit);
  }
  group.add(flowers);

  /* ── Summer fan ───────────────────────────────────────── */
  const fan = new THREE.Group();
  {
    const shell = new THREE.MeshStandardMaterial({ color: 0xcdc6b8, roughness: 0.55 });
    const cage = new THREE.MeshStandardMaterial({
      color: 0x8a8578,
      roughness: 0.4,
      metalness: 0.7,
    });
    keep(shell);
    keep(cage);

    const baseGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.025, 20);
    keep(baseGeo);
    const base = new THREE.Mesh(baseGeo, shell);
    base.castShadow = true;
    fan.add(base);

    const poleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.19, 10);
    keep(poleGeo);
    const pole = new THREE.Mesh(poleGeo, cage);
    pole.position.y = 0.105;
    fan.add(pole);

    const headPivot = new THREE.Group();
    headPivot.position.y = 0.2;

    const hubGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.05, 16);
    keep(hubGeo);
    const hub = new THREE.Mesh(hubGeo, shell);
    hub.rotation.x = Math.PI / 2;
    headPivot.add(hub);

    const bladePivot = new THREE.Group();
    bladePivot.position.z = 0.03;
    const bladeGeo = new THREE.BoxGeometry(0.075, 0.034, 0.003);
    keep(bladeGeo);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(bladeGeo, shell);
      const a = (i / 4) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.042, Math.sin(a) * 0.042, 0);
      b.rotation.z = a;
      b.rotation.y = 0.4;
      bladePivot.add(b);
    }
    headPivot.add(bladePivot);

    const ringGeo = new THREE.TorusGeometry(0.082, 0.004, 8, 28);
    keep(ringGeo);
    const ring = new THREE.Mesh(ringGeo, cage);
    ring.position.z = 0.04;
    headPivot.add(ring);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const sGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 0.16, 4);
      keep(sGeo);
      const spoke = new THREE.Mesh(sGeo, cage);
      spoke.position.set(0, 0, 0.04);
      spoke.rotation.z = a;
      headPivot.add(spoke);
    }

    fan.add(headPivot);
    fan.userData = { bladePivot, headPivot };
    fan.position.copy(anchors.sill);

    const hit = hitBox(0.22, 0.3, 0.22, "fan", keep);
    hit.position.copy(anchors.sill);
    hit.position.y += 0.14;
    hits.push(hit);
    group.add(hit);
  }
  group.add(fan);

  /* ── Which of them is out ─────────────────────────────── */
  const show = (key: Decor) => {
    tree.visible = key === "christmas" || key === "newyear";
    pumpkin.visible = key === "halloween";
    flowers.visible = key === "spring";
    fan.visible = key === "summer";
    // Hit boxes follow their object, or you can hover a tree that
    // is not in the room.
    hits[0].visible = tree.visible;
    hits[1].visible = pumpkin.visible;
    hits[2].visible = flowers.visible;
    hits[3].visible = fan.visible;
    for (const h of hits) h.userData.inactive = !h.visible;
  };

  let fanSpin = 0;

  const update = ({ focus, t, dt, reduced }: LifeCtx) => {
    if (tree.visible) {
      const { bulbs, star, treeLight } = tree.userData as {
        bulbs: THREE.Mesh[];
        star: THREE.Mesh;
        treeLight: THREE.PointLight;
      };
      if (!reduced) {
        for (const b of bulbs) {
          const ph = b.userData.phase as number;
          const k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.6 + ph));
          b.scale.setScalar(k * (1 + focus * 0.5));
        }
        star.rotation.y += dt * 0.5;
      }
      treeLight.intensity = 1.4 + Math.sin(t * 1.1) * 0.25 + focus * 1.2;
    }

    if (pumpkin.visible) {
      const { inner } = pumpkin.userData as { inner: THREE.PointLight };
      // Candle flicker: a wobble, not a random, or it strobes.
      inner.intensity = 0.9 + wobble(t * 3, 1, 0.37) * 0.25 + focus * 0.8;
      if (!reduced) pumpkin.rotation.y = Math.sin(t * 0.4) * 0.05 + focus * 0.3;
    }

    if (flowers.visible && !reduced) {
      const { heads } = flowers.userData as { heads: THREE.Group[] };
      heads.forEach((h, i) => {
        const s = wobble(t * 0.8 + i, 1, 0.43);
        h.rotation.y = s * (0.05 + focus * 0.18);
      });
    }

    if (fan.visible) {
      const { bladePivot, headPivot } = fan.userData as {
        bladePivot: THREE.Group;
        headPivot: THREE.Group;
      };
      if (!reduced) {
        fanSpin += dt * (16 + focus * 22);
        bladePivot.rotation.z = fanSpin;
        headPivot.rotation.y = Math.sin(t * 0.35) * 0.5;
      }
    }
  };

  return { group, show, update, hits };
}
