import * as THREE from "three";
import {
  buildCat,
  buildClock,
  buildDecor,
  buildPlant,
  buildSteam,
  type DecorSet,
  type Life,
} from "./atelier-life";

/**
 * The room, as geometry.
 *
 * Everything here is built from primitives and canvas-drawn
 * textures. Nothing is downloaded, which is the constraint that
 * shaped the whole thing: no furniture models, no HDRIs, no
 * photographic maps. What carries it instead is light — real
 * shadow-casting lamps, emissive surfaces feeding a bloom pass,
 * and materials with honest roughness. A plain box lit properly
 * reads as a desk; a detailed model lit flatly reads as a toy.
 *
 * The things that move live in atelier-life. This file builds the
 * room they live in and hands back every handle the driver needs
 * to light it, point at it and animate it.
 *
 * Pure three.js. No React, so the scene can be built, measured and
 * torn down without a render cycle in the way.
 */

/* ── Procedural textures ───────────────────────────────────── */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d") as CanvasRenderingContext2D };
}

function finish(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Deterministic noise, so the room is the same room every load. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function woodTexture(): THREE.Texture {
  const { c, g } = canvas(512, 512);
  const r = rand(7);
  g.fillStyle = "#6b4a33";
  g.fillRect(0, 0, 512, 512);

  // Grain: long, low-contrast streaks along one axis. Wood is
  // mostly direction, not colour.
  for (let i = 0; i < 2600; i++) {
    const y = r() * 512;
    const len = 40 + r() * 260;
    const x = r() * 512;
    g.strokeStyle = `rgba(${30 + r() * 60},${18 + r() * 40},${8 + r() * 28},${0.05 + r() * 0.16})`;
    g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 7, x + len * 0.7, y + (r() - 0.5) * 7, x + len, y);
    g.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = r() * 512;
    const y = r() * 512;
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = `rgba(40,24,12,${0.3 - k * 0.035})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(x, y, 3 + k * 3.2, 2 + k * 2.1, r() * 3, 0, Math.PI * 2);
      g.stroke();
    }
  }
  return finish(c, 1);
}

function wallTexture(): THREE.Texture {
  const { c, g } = canvas(256, 256);
  const r = rand(19);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  // Plaster tooth. Very low contrast — it exists to break up the
  // specular, not to be seen.
  for (let i = 0; i < 24000; i++) {
    const v = 200 + r() * 55;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(r() * 256, r() * 256, 1.4, 1.4);
  }
  return finish(c, 3);
}

function rugTexture(): THREE.Texture {
  const { c, g } = canvas(256, 256);
  g.fillStyle = "#3a2440";
  g.fillRect(0, 0, 256, 256);
  const r = rand(31);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
    g.fillRect(r() * 256, r() * 256, 2, 1);
  }
  g.strokeStyle = "rgba(255,120,180,0.30)";
  g.lineWidth = 7;
  g.strokeRect(16, 16, 224, 224);
  g.strokeStyle = "rgba(90,220,255,0.18)";
  g.lineWidth = 3;
  g.strokeRect(34, 34, 188, 188);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? "rgba(255,120,180,0.13)" : "rgba(90,220,255,0.10)";
    g.fillRect(52, 54 + i * 13, 152, 6);
  }
  return finish(c, 1);
}

/**
 * A tower facade: dark concrete with lit windows, used as both the
 * colour map and the emissive map so the lit cells glow into the
 * bloom pass while the concrete stays dark.
 */
function facadeTexture(seed: number, lit: number): { map: THREE.Texture; emissive: THREE.Texture } {
  const COLS = 10;
  const ROWS = 16;
  const CW = 16;
  const CH = 16;
  const w = COLS * CW;
  const h = ROWS * CH;

  const base = canvas(w, h);
  const glow = canvas(w, h);
  const r = rand(seed);

  base.g.fillStyle = "#0d0a18";
  base.g.fillRect(0, 0, w, h);
  glow.g.fillStyle = "#000000";
  glow.g.fillRect(0, 0, w, h);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * CW + 4;
      const py = y * CH + 4;
      if (r() < lit) {
        const cold = r() < 0.22;
        const col = cold ? "#cfe4ff" : `rgb(255,${190 + r() * 50},${110 + r() * 70})`;
        base.g.fillStyle = col;
        base.g.fillRect(px, py, CW - 8, CH - 8);
        glow.g.fillStyle = col;
        glow.g.fillRect(px, py, CW - 8, CH - 8);
      } else {
        base.g.fillStyle = `rgba(40,36,64,${0.25 + r() * 0.3})`;
        base.g.fillRect(px, py, CW - 8, CH - 8);
      }
    }
  }

  return { map: finish(base.c, 1), emissive: finish(glow.c, 1) };
}

/* ── Shape of the room ─────────────────────────────────────── */

const ROOM = { w: 6, h: 3, d: 5, backZ: -2.6, leftX: -3, rightX: 3 };
const WIN = { x0: -1.7, x1: 1.9, y0: 1.05, y1: 2.45 };
const DESK_Y = 0.76;
const DESK_Z = ROOM.backZ + 0.52;

export type Built = {
  root: THREE.Group;
  screen: { position: THREE.Vector3; width: number; height: number };
  tv: { position: THREE.Vector3; width: number; height: number };
  /** Every mesh the raycaster tests, each with a .name. */
  targets: THREE.Object3D[];
  /** Objects with their own idle and reaction behaviour. */
  life: Life[];
  decor: DecorSet;
  lamps: {
    sun: THREE.DirectionalLight;
    windowFill: THREE.RectAreaLight;
    desk: THREE.PointLight;
    neon: THREE.PointLight;
    screen: THREE.PointLight;
    tv: THREE.PointLight;
    ambient: THREE.HemisphereLight;
  };
  props: {
    skyMat: THREE.ShaderMaterial;
    ships: THREE.Group;
    riftMat: THREE.ShaderMaterial;
    rift: THREE.Mesh;
    chair: THREE.Group;
    vinyl: THREE.Mesh;
    lampBulb: THREE.Mesh;
    lampHead: THREE.Group;
    neonSign: THREE.Group;
    neonMat: THREE.MeshBasicMaterial;
    screenGlow: THREE.Mesh;
    screenOff: THREE.Mesh;
    tvGlow: THREE.Mesh;
    tvOff: THREE.Mesh;
    speakerCones: THREE.Mesh[];
    posters: THREE.Mesh[];
    towerMats: THREE.MeshStandardMaterial[];
  };
  dispose: () => void;
};

export function buildRoom(): Built {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const targets: THREE.Object3D[] = [];
  const life: Life[] = [];

  const keep = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const hitBox = (w: number, h: number, d: number, name: string, pos: THREE.Vector3) => {
    const m = new THREE.Mesh(
      keep(new THREE.BoxGeometry(w, h, d)),
      keep(new THREE.MeshBasicMaterial({ visible: false })),
    );
    m.name = name;
    m.position.copy(pos);
    root.add(m);
    targets.push(m);
    return m;
  };

  const wallMap = keep(wallTexture());
  const woodMap = keep(woodTexture());
  const rugMap = keep(rugTexture());

  const wallMat = keep(new THREE.MeshStandardMaterial({ color: 0x6d6480, roughness: 0.94, map: wallMap }));
  const floorMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 0.62, map: woodMap, metalness: 0.02 }),
  );
  const deskMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x7a5538, roughness: 0.46, map: woodMap, metalness: 0.04 }),
  );
  const darkMetal = keep(new THREE.MeshStandardMaterial({ color: 0x1b1a22, roughness: 0.42, metalness: 0.68 }));
  const plastic = keep(new THREE.MeshStandardMaterial({ color: 0x24222c, roughness: 0.56, metalness: 0.08 }));

  const box = (w: number, h: number, d: number) => keep(new THREE.BoxGeometry(w, h, d));

  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    cast = true,
    receive = true,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    root.add(m);
    return m;
  };

  /* ══ Shell ═══════════════════════════════════════════════ */
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(ROOM.w, ROOM.d)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, ROOM.backZ + ROOM.d / 2);
  floor.receiveShadow = true;
  root.add(floor);

  const ceil = new THREE.Mesh(keep(new THREE.PlaneGeometry(ROOM.w, ROOM.d)), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.h, ROOM.backZ + ROOM.d / 2);
  ceil.receiveShadow = true;
  root.add(ceil);

  // Back wall, built around the window rather than through it.
  const T = 0.12;
  add(box(ROOM.w, WIN.y0, T), wallMat, 0, WIN.y0 / 2, ROOM.backZ - T / 2);
  add(box(ROOM.w, ROOM.h - WIN.y1, T), wallMat, 0, (ROOM.h + WIN.y1) / 2, ROOM.backZ - T / 2);
  add(
    box(WIN.x0 + ROOM.w / 2, WIN.y1 - WIN.y0, T),
    wallMat,
    (-ROOM.w / 2 + WIN.x0) / 2,
    (WIN.y0 + WIN.y1) / 2,
    ROOM.backZ - T / 2,
  );
  add(
    box(ROOM.w / 2 - WIN.x1, WIN.y1 - WIN.y0, T),
    wallMat,
    (WIN.x1 + ROOM.w / 2) / 2,
    (WIN.y0 + WIN.y1) / 2,
    ROOM.backZ - T / 2,
  );

  const sideGeo = keep(new THREE.PlaneGeometry(ROOM.d, ROOM.h));
  const leftWall = new THREE.Mesh(sideGeo, wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(ROOM.leftX, ROOM.h / 2, ROOM.backZ + ROOM.d / 2);
  leftWall.receiveShadow = true;
  root.add(leftWall);

  const rightWall = new THREE.Mesh(sideGeo, wallMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(ROOM.rightX, ROOM.h / 2, ROOM.backZ + ROOM.d / 2);
  rightWall.receiveShadow = true;
  root.add(rightWall);

  // Skirting. A wall meeting a floor at a hard seam is the single
  // clearest tell that a room was never built.
  const skirtMat = keep(new THREE.MeshStandardMaterial({ color: 0x3b3446, roughness: 0.7 }));
  add(box(ROOM.w, 0.1, 0.03), skirtMat, 0, 0.05, ROOM.backZ + 0.015);
  const skirtL = add(box(ROOM.d, 0.1, 0.03), skirtMat, 0, 0.05, 0);
  skirtL.rotation.y = Math.PI / 2;
  skirtL.position.set(ROOM.leftX + 0.015, 0.05, ROOM.backZ + ROOM.d / 2);

  /* ══ Window ══════════════════════════════════════════════ */
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: 0x15121d, roughness: 0.5, metalness: 0.3 }));
  const fw = WIN.x1 - WIN.x0;
  const fh = WIN.y1 - WIN.y0;
  const cx = (WIN.x0 + WIN.x1) / 2;
  const cy = (WIN.y0 + WIN.y1) / 2;
  add(box(fw + 0.12, 0.07, 0.14), frameMat, cx, WIN.y0 - 0.02, ROOM.backZ);
  add(box(fw + 0.12, 0.07, 0.14), frameMat, cx, WIN.y1 + 0.02, ROOM.backZ);
  add(box(0.07, fh, 0.14), frameMat, WIN.x0 - 0.02, cy, ROOM.backZ);
  add(box(0.07, fh, 0.14), frameMat, WIN.x1 + 0.02, cy, ROOM.backZ);
  for (const mx of [WIN.x0 + fw / 3, WIN.x0 + (2 * fw) / 3]) {
    add(box(0.05, fh, 0.1), frameMat, mx, cy, ROOM.backZ);
  }
  add(box(fw, 0.05, 0.1), frameMat, cx, cy, ROOM.backZ);
  add(box(fw + 0.3, 0.06, 0.3), deskMat, cx, WIN.y0 - 0.05, ROOM.backZ + 0.11);

  /* ══ Rug ═════════════════════════════════════════════════ */
  const rug = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(3.4, 2.2)),
    keep(new THREE.MeshStandardMaterial({ map: rugMap, roughness: 0.98 })),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.1, 0.004, -0.75);
  rug.receiveShadow = true;
  root.add(rug);

  /* ══ Desk ════════════════════════════════════════════════ */
  const deskW = 2.7;
  const deskD = 0.72;
  add(box(deskW, 0.045, deskD), deskMat, 0.1, DESK_Y, DESK_Z);
  for (const lx of [0.1 - deskW / 2 + 0.07, 0.1 + deskW / 2 - 0.07]) {
    for (const lz of [DESK_Z - deskD / 2 + 0.06, DESK_Z + deskD / 2 - 0.06]) {
      add(box(0.05, DESK_Y, 0.05), darkMetal, lx, DESK_Y / 2, lz);
    }
  }
  add(box(0.46, 0.6, 0.6), deskMat, 1.1, 0.3, DESK_Z);
  for (let i = 0; i < 3; i++) {
    add(box(0.4, 0.015, 0.02), darkMetal, 1.1, 0.12 + i * 0.18, DESK_Z + 0.31);
  }

  /* ══ Monitor ═════════════════════════════════════════════ */
  const SCREEN_W = 0.62;
  const SCREEN_H = SCREEN_W * (464 / 780);
  const screenY = DESK_Y + 0.055 + 0.03 + SCREEN_H / 2 + 0.03;
  const screenZ = DESK_Z - 0.19;

  const bodyMat = keep(new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.34, metalness: 0.55 }));
  add(box(SCREEN_W + 0.05, SCREEN_H + 0.09, 0.035), bodyMat, 0, screenY - 0.015, screenZ - 0.022);
  add(box(SCREEN_W + 0.05, 0.035, 0.04), bodyMat, 0, screenY - SCREEN_H / 2 - 0.042, screenZ - 0.02);
  add(box(0.09, 0.17, 0.05), bodyMat, 0, DESK_Y + 0.055 + 0.085, screenZ - 0.02);
  add(keep(new THREE.CylinderGeometry(0.16, 0.18, 0.016, 32)), bodyMat, 0, DESK_Y + 0.03, screenZ - 0.02);

  /**
   * The desktop is a CSS3D element composited over the WebGL
   * canvas, so it cannot bloom. This plane sits just behind it,
   * emissive, purely so the monitor throws light into the bloom
   * pass and onto the wall — the glow around a screen in a dark
   * room is doing most of the work of selling it.
   */
  const screenGlow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)),
    keep(new THREE.MeshBasicMaterial({ color: 0x7fb4e8, transparent: true, opacity: 0 })),
  );
  screenGlow.position.set(0, screenY, screenZ - 0.004);
  root.add(screenGlow);

  // Asleep, the panel is a dark mirror rather than a hole.
  const screenOff = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)),
    keep(new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.08, metalness: 0.9 })),
  );
  screenOff.position.set(0, screenY, screenZ);
  root.add(screenOff);
  hitBox(SCREEN_W + 0.1, SCREEN_H + 0.1, 0.1, "monitor", new THREE.Vector3(0, screenY, screenZ));

  /* ══ Desk things ═════════════════════════════════════════ */
  const kb = add(box(0.44, 0.015, 0.14), plastic, -0.06, DESK_Y + 0.03, DESK_Z + 0.19);
  kb.rotation.y = 0.045;
  const keyMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a3844, roughness: 0.8 }));
  const keyGeo = box(0.026, 0.006, 0.024);
  for (let rw = 0; rw < 4; rw++) {
    for (let k = 0; k < 13; k++) {
      const key = add(keyGeo, keyMat, -0.26 + k * 0.032, DESK_Y + 0.04, DESK_Z + 0.145 + rw * 0.03, false, false);
      key.rotation.y = 0.045;
    }
  }
  const mouse = add(keep(new THREE.SphereGeometry(0.035, 20, 14)), plastic, 0.3, DESK_Y + 0.032, DESK_Z + 0.2);
  mouse.scale.set(1, 0.5, 1.5);

  // Mug. The steam above it is a Life object.
  const mugMat = keep(
    new THREE.MeshStandardMaterial({ color: 0xbf5f7f, roughness: 0.32, side: THREE.DoubleSide }),
  );
  const MUG = new THREE.Vector3(-0.82, DESK_Y + 0.078, DESK_Z + 0.12);
  add(keep(new THREE.CylinderGeometry(0.043, 0.038, 0.1, 28, 1, true)), mugMat, MUG.x, MUG.y, MUG.z);
  add(keep(new THREE.CylinderGeometry(0.043, 0.043, 0.006, 28)), mugMat, MUG.x, DESK_Y + 0.031, MUG.z);
  add(
    keep(new THREE.CylinderGeometry(0.038, 0.038, 0.004, 24)),
    keep(new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.18 })),
    MUG.x,
    DESK_Y + 0.105,
    MUG.z,
    false,
  );
  const handle = add(keep(new THREE.TorusGeometry(0.028, 0.008, 10, 24, Math.PI)), mugMat, MUG.x + 0.04, MUG.y, MUG.z);
  handle.rotation.z = -Math.PI / 2;
  handle.rotation.y = Math.PI / 2;
  hitBox(0.16, 0.22, 0.16, "mug", new THREE.Vector3(MUG.x, DESK_Y + 0.11, MUG.z));

  // Books.
  [0x6f3550, 0x2f4a6b, 0x6b5a2f].forEach((col, i) => {
    const b = add(
      box(0.2, 0.032, 0.28),
      keep(new THREE.MeshStandardMaterial({ color: col, roughness: 0.82 })),
      -1.12,
      DESK_Y + 0.04 + i * 0.034,
      DESK_Z - 0.02,
    );
    b.rotation.y = (i - 1) * 0.07;
  });

  // Speaker, with cones that pulse when the music is on.
  add(box(0.11, 0.17, 0.1), plastic, 0.72, DESK_Y + 0.11, DESK_Z - 0.08);
  const speakerCones: THREE.Mesh[] = [];
  for (const [sy, sr] of [
    [0.145, 0.032],
    [0.072, 0.018],
  ] as const) {
    const cone = add(
      keep(new THREE.CylinderGeometry(sr, sr, 0.006, 20)),
      keep(new THREE.MeshStandardMaterial({ color: 0x100f16, roughness: 0.9 })),
      0.72,
      DESK_Y + sy,
      DESK_Z - 0.031,
      false,
      false,
    );
    cone.rotation.x = Math.PI / 2;
    speakerCones.push(cone);
  }
  hitBox(0.18, 0.24, 0.18, "speaker", new THREE.Vector3(0.72, DESK_Y + 0.11, DESK_Z - 0.06));

  // Headphones hooked under the desk edge.
  const hpMat = keep(new THREE.MeshStandardMaterial({ color: 0x18171f, roughness: 0.5 }));
  const band = add(keep(new THREE.TorusGeometry(0.075, 0.009, 10, 30, Math.PI)), hpMat, -1.2, DESK_Y - 0.08, DESK_Z + 0.2);
  band.rotation.x = Math.PI / 2;
  band.rotation.z = -0.35;
  for (const ex of [-0.055, 0.055]) {
    const cup = add(keep(new THREE.CylinderGeometry(0.035, 0.035, 0.022, 20)), hpMat, -1.2 + ex, DESK_Y - 0.145, DESK_Z + 0.2);
    cup.rotation.z = Math.PI / 2;
  }

  // Sticky notes on the bezel.
  [0xf2d479, 0xf2a0b5, 0x9fe0c4].forEach((col, i) => {
    const s = add(
      box(0.055, 0.055, 0.002),
      keep(new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 })),
      SCREEN_W / 2 + 0.055,
      screenY + 0.1 - i * 0.062,
      screenZ + 0.002,
      false,
    );
    s.rotation.z = (i - 1) * 0.12;
  });

  /**
   * Desk lamp.
   *
   * Built end to end rather than as parts placed by eye. The arm
   * was a rotated cylinder and the head was positioned separately,
   * and of course they did not meet — the shade floated twenty
   * centimetres off the end of its own arm, which in a dark room
   * reads as a black blob hanging over the desk. A strut between
   * two points cannot come apart.
   */
  const lampMat = keep(new THREE.MeshStandardMaterial({ color: 0x2a2833, roughness: 0.35, metalness: 0.6 }));

  const strut = (a: THREE.Vector3, b: THREE.Vector3, rad: number) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(rad, rad, len, 12)), lampMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    return m;
  };

  const lampGroup = new THREE.Group();
  lampGroup.position.set(0.92, DESK_Y + 0.023, DESK_Z - 0.16);

  const lampBase = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.075, 0.085, 0.02, 28)), lampMat);
  lampBase.castShadow = true;
  lampGroup.add(lampBase);

  const JOINT_A = new THREE.Vector3(0, 0.01, 0);
  const JOINT_B = new THREE.Vector3(-0.07, 0.52, 0.02);
  const JOINT_C = new THREE.Vector3(-0.3, 0.44, 0.19);
  lampGroup.add(strut(JOINT_A, JOINT_B, 0.012));
  lampGroup.add(strut(JOINT_B, JOINT_C, 0.011));
  const elbow = new THREE.Mesh(keep(new THREE.SphereGeometry(0.022, 14, 12)), lampMat);
  elbow.position.copy(JOINT_B);
  lampGroup.add(elbow);

  // Head: a cone whose open end points down the arm at the desk.
  const lampHead = new THREE.Group();
  lampHead.position.copy(JOINT_C);
  const shade = new THREE.Mesh(
    keep(new THREE.ConeGeometry(0.105, 0.14, 26, 1, true)),
    keep(
      new THREE.MeshStandardMaterial({
        color: 0x2a2833,
        roughness: 0.35,
        metalness: 0.6,
        side: THREE.DoubleSide,
      }),
    ),
  );
  // Apex to -Z, mouth to +Z, so lookAt aims the opening.
  shade.rotation.x = -Math.PI / 2;
  shade.castShadow = true;
  lampHead.add(shade);

  const lampBulb = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.026, 16, 12)),
    keep(new THREE.MeshBasicMaterial({ color: 0xffd9a0 })),
  );
  lampBulb.position.set(0, 0, 0.035);
  lampHead.add(lampBulb);
  lampGroup.add(lampHead);
  root.add(lampGroup);

  // Point the head at the near corner of the desk.
  const LAMP_AIM = new THREE.Vector3(0.24, DESK_Y, DESK_Z + 0.2);
  lampGroup.updateMatrixWorld(true);
  lampHead.lookAt(LAMP_AIM);

  const lampWorld = lampHead.getWorldPosition(new THREE.Vector3());
  hitBox(0.3, 0.3, 0.3, "lamp", lampWorld.clone());

  /* ══ Chair ═══════════════════════════════════════════════ */
  const chair = new THREE.Group();
  const chairMat = keep(new THREE.MeshStandardMaterial({ color: 0x23202e, roughness: 0.78 }));
  const seat = new THREE.Mesh(box(0.5, 0.07, 0.48), chairMat);
  seat.position.set(0, 0.46, 0);
  seat.castShadow = true;
  chair.add(seat);
  const backRest = new THREE.Mesh(box(0.48, 0.58, 0.06), chairMat);
  backRest.position.set(0, 0.78, -0.21);
  backRest.rotation.x = -0.14;
  backRest.castShadow = true;
  chair.add(backRest);
  const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 16)), darkMetal);
  post.position.set(0, 0.22, 0);
  post.castShadow = true;
  chair.add(post);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(box(0.26, 0.025, 0.04), darkMetal);
    leg.position.set(Math.cos(a) * 0.13, 0.04, Math.sin(a) * 0.13);
    leg.rotation.y = -a;
    leg.castShadow = true;
    chair.add(leg);
    const caster = new THREE.Mesh(keep(new THREE.SphereGeometry(0.025, 12, 10)), darkMetal);
    caster.position.set(Math.cos(a) * 0.25, 0.025, Math.sin(a) * 0.25);
    chair.add(caster);
  }
  // Pushed right and turned: dead centre it is a slab between
  // the camera and the one thing you are meant to click.
  chair.position.set(0.88, 0, DESK_Z + 0.95);
  chair.rotation.y = -0.5;
  root.add(chair);
  hitBox(0.6, 1.1, 0.6, "chair", new THREE.Vector3(0.88, 0.6, DESK_Z + 0.95));

  /* ══ Shelf, books, vinyl ═════════════════════════════════ */
  const shelfY = 1.62;
  add(box(0.3, 0.035, 1.1), deskMat, ROOM.leftX + 0.16, shelfY, -1.2);
  const r2 = rand(53);
  for (let i = 0; i < 11; i++) {
    const hgt = 0.2 + r2() * 0.08;
    const b = add(
      box(0.17, hgt, 0.035),
      keep(new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(r2(), 0.32, 0.36), roughness: 0.88 })),
      ROOM.leftX + 0.16,
      shelfY + 0.018 + hgt / 2,
      -1.68 + i * 0.045,
    );
    if (i > 8) b.rotation.x = 0.3;
  }

  // A record on the shelf, which spins when you look at it.
  const vinyl = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.14, 0.14, 0.006, 40)),
    keep(new THREE.MeshStandardMaterial({ color: 0x121019, roughness: 0.3 })),
  );
  vinyl.position.set(ROOM.leftX + 0.2, shelfY + 0.17, -0.8);
  vinyl.rotation.z = Math.PI / 2;
  vinyl.rotation.x = 0.16;
  vinyl.castShadow = true;
  root.add(vinyl);
  const label = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 24)),
    keep(new THREE.MeshStandardMaterial({ color: 0xff2f86, roughness: 0.6 })),
  );
  label.position.copy(vinyl.position);
  label.rotation.copy(vinyl.rotation);
  root.add(label);
  hitBox(0.3, 0.32, 0.32, "vinyl", vinyl.position.clone());

  /* ══ Posters ═════════════════════════════════════════════ */
  const posters: THREE.Mesh[] = [];
  const p1 = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(0.52, 0.72)),
    keep(
      new THREE.MeshStandardMaterial({
        color: 0x7b2250,
        roughness: 0.92,
        emissive: 0x2a0a1c,
        emissiveIntensity: 0.4,
      }),
    ),
  );
  p1.rotation.y = Math.PI / 2;
  p1.position.set(ROOM.leftX + 0.02, 2.1, -1.5);
  root.add(p1);
  posters.push(p1);
  hitBox(0.1, 0.78, 0.58, "poster", p1.position.clone());

  const p2 = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(0.44, 0.34)),
    keep(new THREE.MeshStandardMaterial({ color: 0x2a3f5c, roughness: 0.92 })),
  );
  p2.rotation.y = Math.PI / 2;
  p2.position.set(ROOM.leftX + 0.02, 1.2, -0.3);
  root.add(p2);
  posters.push(p2);

  /* ══ Neon sign ═══════════════════════════════════════════ */
  const neonSign = new THREE.Group();
  const neonMat = keep(new THREE.MeshBasicMaterial({ color: 0xff2f86 }));
  // An abstract mark of its own: two arcs and a bar.
  const arc1 = new THREE.Mesh(keep(new THREE.TorusGeometry(0.16, 0.012, 10, 40, Math.PI * 1.35)), neonMat);
  arc1.rotation.z = -0.5;
  neonSign.add(arc1);
  const arc2 = new THREE.Mesh(keep(new THREE.TorusGeometry(0.09, 0.011, 10, 32, Math.PI * 1.1)), neonMat);
  arc2.rotation.z = 2.3;
  arc2.position.set(0.03, -0.02, 0.012);
  neonSign.add(arc2);
  const bar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 10)), neonMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, -0.2, 0);
  neonSign.add(bar);
  neonSign.position.set(ROOM.leftX + 0.08, 1.95, 0.35);
  neonSign.rotation.y = Math.PI / 2;
  root.add(neonSign);
  hitBox(0.2, 0.6, 0.5, "neon", new THREE.Vector3(ROOM.leftX + 0.12, 1.9, 0.35));

  /* ══ Television ══════════════════════════════════════════ */
  const TV_W = 0.56;
  const TV_H = TV_W * (3 / 4);
  const tvX = ROOM.leftX + 0.62;
  const tvY = 1.78;
  const tvZ = ROOM.backZ + 0.34;

  add(box(0.72, 0.05, 0.5), deskMat, tvX, 1.46, tvZ);
  for (const lz of [tvZ - 0.2, tvZ + 0.2]) {
    for (const lx of [tvX - 0.3, tvX + 0.3]) {
      add(box(0.04, 1.44, 0.04), darkMetal, lx, 0.72, lz);
    }
  }

  const tvShell = keep(new THREE.MeshStandardMaterial({ color: 0x4e4234, roughness: 0.78 }));
  add(box(TV_W + 0.16, 0.07, 0.42), tvShell, tvX, tvY + TV_H / 2 + 0.035, tvZ);
  add(box(TV_W + 0.16, 0.07, 0.42), tvShell, tvX, tvY - TV_H / 2 - 0.035, tvZ);
  add(box(0.08, TV_H, 0.42), tvShell, tvX - TV_W / 2 - 0.04, tvY, tvZ);
  add(box(0.22, TV_H, 0.42), tvShell, tvX + TV_W / 2 + 0.11, tvY, tvZ);
  add(box(TV_W + 0.3, TV_H + 0.14, 0.04), tvShell, tvX + 0.07, tvY, tvZ - 0.21);

  for (let i = 0; i < 3; i++) {
    const d = add(
      keep(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 20)),
      darkMetal,
      tvX + TV_W / 2 + 0.11,
      tvY + 0.1 - i * 0.1,
      tvZ + 0.21,
    );
    d.rotation.x = Math.PI / 2;
  }
  // Rooted on the cabinet top, not hovering above it.
  for (const sign of [-1, 1]) {
    const ant = add(
      keep(new THREE.CylinderGeometry(0.003, 0.005, 0.4, 8)),
      darkMetal,
      tvX + sign * 0.115,
      tvY + TV_H / 2 + 0.24,
      tvZ - 0.08,
    );
    ant.rotation.z = sign * 0.52;
  }
  add(keep(new THREE.SphereGeometry(0.022, 12, 10)), darkMetal, tvX, tvY + TV_H / 2 + 0.07, tvZ - 0.08);

  const tvOff = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(TV_W, TV_H)),
    keep(new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.12, metalness: 0.8 })),
  );
  tvOff.position.set(tvX, tvY, tvZ + 0.212);
  root.add(tvOff);

  const tvGlow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(TV_W, TV_H)),
    keep(new THREE.MeshBasicMaterial({ color: 0x89c8ff, transparent: true, opacity: 0 })),
  );
  tvGlow.position.set(tvX, tvY, tvZ + 0.208);
  root.add(tvGlow);
  hitBox(TV_W + 0.1, TV_H + 0.1, 0.1, "tv", new THREE.Vector3(tvX, tvY, tvZ + 0.21));

  // The deck under it, with a standby light.
  add(box(TV_W + 0.2, 0.1, 0.34), keep(new THREE.MeshStandardMaterial({ color: 0x2a2832, roughness: 0.5 })), tvX, 1.54, tvZ);
  add(box(0.2, 0.025, 0.01), keep(new THREE.MeshBasicMaterial({ color: 0x4ad8a0 })), tvX - 0.12, 1.54, tvZ + 0.18, false);

  /* ══ Outside ═════════════════════════════════════════════ */
  const outside = new THREE.Group();

  const skyMat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x07061a) },
      uMid: { value: new THREE.Color(0x241048) },
      uBot: { value: new THREE.Color(0x6d1f5c) },
      uStars: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot;
      uniform float uStars; uniform float uTime;
      varying vec2 vUv;

      // ALU-only hash. A sin-based one costs a transcendental per
      // star per fragment, which a phone notices.
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 col = mix(uBot, uMid, smoothstep(0.0, 0.52, vUv.y));
        col = mix(col, uTop, smoothstep(0.45, 1.0, vUv.y));

        vec2 cell = floor(vUv * vec2(420.0, 260.0));
        float h = hash(cell);
        float star = step(0.9965, h) * smoothstep(0.25, 0.8, vUv.y);
        float tw = 0.65 + 0.35 * sin(uTime * 1.7 + h * 90.0);
        col += vec3(0.85, 0.9, 1.0) * star * tw * uStars;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  disposables.push(skyMat);
  const sky = new THREE.Mesh(keep(new THREE.PlaneGeometry(260, 150)), skyMat);
  sky.position.set(0, 30, -90);
  outside.add(sky);

  const rC = rand(131);
  /** Every tower's material, so daylight can switch the city off. */
  const towerMats: THREE.MeshStandardMaterial[] = [];
  const facades = Array.from({ length: 6 }, (_, i) => {
    const f = facadeTexture(200 + i, 0.3 + i * 0.07);
    disposables.push(f.map, f.emissive);
    return f;
  });

  /**
   * The skyline.
   *
   * Two things had to be right and both were wrong first time.
   *
   * The facade texture is one whole building — ten windows across,
   * sixteen floors up — so it tiles ONCE. Scaling the repeat by
   * the tower's size instead put six hundred rows of windows on a
   * forty-metre building, which at this distance stops being a
   * city and becomes patterned wallpaper hung behind the glass.
   *
   * And they have to be far away. Parked at fifteen metres a
   * tower fills the whole window and there is no sky left to read
   * the silhouette against. Real towers outside a real window are
   * a long way off; the depth is most of what makes it a view
   * rather than a wall.
   */
  for (let i = 0; i < 70; i++) {
    const f = facades[Math.floor(rC() * facades.length)];
    const w = 4 + rC() * 9;
    const d = 4 + rC() * 8;
    const hgt = 9 + rC() * rC() * 54;
    const x = (rC() - 0.5) * 200;
    const z = -26 - rC() * 120;

    const map = f.map.clone();
    const emi = f.emissive.clone();
    map.needsUpdate = true;
    emi.needsUpdate = true;
    disposables.push(map, emi);

    const mat = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emi,
      emissive: 0xffffff,
      emissiveIntensity: 0.85,
      roughness: 0.9,
      color: 0x3a3650,
    });
    disposables.push(mat);
    towerMats.push(mat);

    const tower = new THREE.Mesh(box(w, hgt, d), mat);
    tower.position.set(x, hgt / 2 - 2, z);
    outside.add(tower);

    if (hgt > 32 && rC() > 0.4) {
      const beacon = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.22, 10, 8)),
        keep(new THREE.MeshBasicMaterial({ color: 0xff3b3b })),
      );
      // Towers now sit two metres lower, so the roof is hgt - 2.
      beacon.position.set(x, hgt - 2.2, z);
      outside.add(beacon);
    }
  }

  /* ── Ships ─────────────────────────────────────────────── */
  const ships = new THREE.Group();
  const hullMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a3358, roughness: 0.45, metalness: 0.5 }));
  const thrustMat = keep(new THREE.MeshBasicMaterial({ color: 0x8feaff }));
  const thrustWarm = keep(new THREE.MeshBasicMaterial({ color: 0xffb060 }));
  const winMat = keep(new THREE.MeshBasicMaterial({ color: 0xbfe8ff }));

  const makeShip = (kind: 0 | 1 | 2) => {
    const g = new THREE.Group();
    if (kind === 0) {
      g.add(new THREE.Mesh(box(5.4, 0.5, 0.8), hullMat));
      const fin = new THREE.Mesh(box(1.2, 0.55, 0.1), hullMat);
      fin.position.set(-0.6, 0.5, 0);
      g.add(fin);
      const wGeo = box(0.12, 0.07, 0.02);
      for (let i = 0; i < 16; i++) {
        const win = new THREE.Mesh(wGeo, winMat);
        win.position.set(-2.2 + i * 0.3, 0.06, 0.41);
        g.add(win);
      }
      for (const tz of [-0.22, 0.22]) {
        const t = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.17, 0.2, 0.3, 14)), thrustMat);
        t.rotation.z = Math.PI / 2;
        t.position.set(-2.8, 0, tz);
        g.add(t);
      }
    } else if (kind === 1) {
      const hull = new THREE.Mesh(keep(new THREE.ConeGeometry(0.22, 1.5, 10)), hullMat);
      hull.rotation.z = -Math.PI / 2;
      g.add(hull);
      const wing = new THREE.Mesh(box(0.5, 0.05, 1.3), hullMat);
      wing.position.set(-0.3, 0, 0);
      g.add(wing);
      const t = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.14, 0.1, 0.26, 12)), thrustMat);
      t.rotation.z = Math.PI / 2;
      t.position.set(-0.82, 0, 0);
      g.add(t);
    } else {
      g.add(new THREE.Mesh(box(3, 0.7, 1), hullMat));
      const cGeo = box(0.8, 0.5, 0.8);
      const cMat = keep(new THREE.MeshStandardMaterial({ color: 0x4a3f6a, roughness: 0.9 }));
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(cGeo, cMat);
        c.position.set(-0.9 + i * 0.9, -0.6, 0);
        g.add(c);
      }
      const bridge = new THREE.Mesh(box(0.6, 0.35, 0.7), hullMat);
      bridge.position.set(1.0, 0.5, 0);
      g.add(bridge);
      const t = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 14)), thrustWarm);
      t.rotation.z = Math.PI / 2;
      t.position.set(-1.6, 0, 0);
      g.add(t);
    }
    return g;
  };

  const SHIP_PLAN = [
    { kind: 0 as const, y: 17, z: -40, speed: 1.5, t: 0.1, s: 1.6 },
    { kind: 1 as const, y: 11, z: -22, speed: -7.5, t: 0.4, s: 1 },
    { kind: 1 as const, y: 22, z: -34, speed: 5.2, t: 0.75, s: 0.8 },
    { kind: 2 as const, y: 7.5, z: -17, speed: -2.6, t: 0.6, s: 1 },
    { kind: 1 as const, y: 5, z: -13, speed: 9, t: 0.2, s: 0.7 },
  ];

  for (const plan of SHIP_PLAN) {
    const s = makeShip(plan.kind);
    s.position.set(0, plan.y, plan.z);
    s.scale.setScalar(plan.s);
    if (plan.speed < 0) s.rotation.y = Math.PI;
    s.userData = { ...plan };
    ships.add(s);
  }
  outside.add(ships);

  /* ── The fold ──────────────────────────────────────────── */
  const riftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(0xff2f86) } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uTint;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;

        float a = atan(p.y, p.x);

        /**
         * The fold. Space inside the disc is remapped so that
         * travelling outward takes you inward: the radius is
         * inverted and wound. Rings pile up toward the rim
         * instead of the centre, which is the wrong way round
         * for anything physical, and that wrongness is the
         * whole effect.
         */
        float inv = 1.0 / max(r, 0.08);
        float wind = a * 1.6 + inv * 2.2 - uTime * 0.25;
        float rings = sin(wind * 3.0) * 0.5 + 0.5;
        rings *= sin(inv * 5.0 - uTime * 0.4) * 0.5 + 0.5;

        vec3 deep = vec3(0.03, 0.01, 0.08);
        vec3 cold = vec3(0.16, 0.82, 0.74);
        vec3 col = mix(deep, cold, rings * smoothstep(1.0, 0.25, r));

        float rim = smoothstep(0.86, 0.99, r);
        col = mix(col, uTint, rim * 0.85);
        col += cold * smoothstep(0.93, 1.0, r) * 0.6;

        float alpha = smoothstep(1.0, 0.94, r) * 0.94 + rim * 0.5;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
  disposables.push(riftMat);
  const rift = new THREE.Mesh(keep(new THREE.PlaneGeometry(13, 13)), riftMat);
  rift.position.set(5.5, 13, -27);
  outside.add(rift);

  root.add(outside);

  /* ══ Living things ═══════════════════════════════════════ */
  const cat = buildCat(keep);
  cat.group.position.set(WIN.x0 + 0.62, WIN.y0 - 0.02, ROOM.backZ + 0.16);
  cat.group.rotation.y = -0.55;
  root.add(cat.group);
  life.push(cat);
  if (cat.hit) targets.push(cat.hit);

  const plantSpecs: Array<[Parameters<typeof buildPlant>[0], number, THREE.Vector3]> = [
    ["monstera", 71, new THREE.Vector3(2.25, 0, DESK_Z + 0.35)],
    ["snake", 83, new THREE.Vector3(-2.55, 0, -2.05)],
    ["pothos", 97, new THREE.Vector3(ROOM.leftX + 0.17, shelfY + 0.018, -0.45)],
    ["succulent", 113, new THREE.Vector3(-0.5, DESK_Y + 0.025, DESK_Z - 0.14)],
  ];
  for (const [kind, seed, pos] of plantSpecs) {
    const p = buildPlant(kind, seed, keep);
    p.group.position.copy(pos);
    root.add(p.group);
    life.push(p);
    if (p.hit) targets.push(p.hit);
  }

  const steam = buildSteam(keep);
  steam.group.position.set(MUG.x, DESK_Y + 0.13, MUG.z);
  root.add(steam.group);
  life.push(steam);

  const clock = buildClock(keep);
  clock.group.position.set(-1.15, 2.62, ROOM.backZ + 0.03);
  root.add(clock.group);
  life.push(clock);
  if (clock.hit) targets.push(clock.hit);

  const decor = buildDecor(keep, {
    corner: new THREE.Vector3(-1.95, 0, -1.98),
    desk: new THREE.Vector3(-0.5, DESK_Y + 0.025, DESK_Z + 0.08),
    sill: new THREE.Vector3(WIN.x1 - 0.45, WIN.y0 - 0.02, ROOM.backZ + 0.13),
  });
  root.add(decor.group);
  for (const h of decor.hits) targets.push(h);

  /* ══ Light ═══════════════════════════════════════════════ */
  const ambient = new THREE.HemisphereLight(0x5a6ea8, 0x201828, 0.5);
  root.add(ambient);

  const sun = new THREE.DirectionalLight(0xbfd4ff, 0.7);
  sun.position.set(-3, 7, -6);
  sun.target.position.set(0, 0.9, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 24;
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -3;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.022;
  root.add(sun);
  root.add(sun.target);

  // Soft fill across the glass. No shadows, but it is what stops
  // the window reading as a hole with a light behind it.
  const windowFill = new THREE.RectAreaLight(0x8ab0ff, 2.4, fw, fh);
  windowFill.position.set(cx, cy, ROOM.backZ + 0.05);
  windowFill.lookAt(cx, 1.2, 2);
  root.add(windowFill);

  const deskLamp = new THREE.PointLight(0xffc98a, 2.2, 3.4, 2);
  // Just in front of the shade's mouth, so the pool lands where
  // the head is actually pointing.
  deskLamp.position.set(0.56, DESK_Y + 0.43, DESK_Z + 0.1);
  deskLamp.castShadow = true;
  deskLamp.shadow.mapSize.set(1024, 1024);
  deskLamp.shadow.bias = -0.004;
  root.add(deskLamp);

  const neonLight = new THREE.PointLight(0xff2f86, 1.5, 2.6, 2);
  neonLight.position.set(ROOM.leftX + 0.25, 1.95, 0.35);
  root.add(neonLight);

  const screenLight = new THREE.PointLight(0x7fb4e8, 0, 2.2, 2);
  screenLight.position.set(0, screenY, screenZ + 0.3);
  root.add(screenLight);

  const tvLight = new THREE.PointLight(0x89c8ff, 0, 2.6, 2);
  tvLight.position.set(tvX, tvY, tvZ + 0.5);
  root.add(tvLight);

  return {
    root,
    screen: {
      position: new THREE.Vector3(0, screenY, screenZ + 0.002),
      width: SCREEN_W,
      height: SCREEN_H,
    },
    tv: { position: new THREE.Vector3(tvX, tvY, tvZ + 0.214), width: TV_W, height: TV_H },
    targets,
    life,
    decor,
    lamps: { sun, windowFill, desk: deskLamp, neon: neonLight, screen: screenLight, tv: tvLight, ambient },
    props: {
      skyMat,
      ships,
      riftMat,
      rift,
      chair,
      vinyl,
      lampBulb,
      lampHead,
      neonSign,
      neonMat,
      screenGlow,
      screenOff,
      tvGlow,
      tvOff,
      speakerCones,
      posters,
      towerMats,
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export { ROOM, WIN, DESK_Y, DESK_Z };
