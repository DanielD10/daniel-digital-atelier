import * as THREE from "three";

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
 * Pure three.js. No React in this file, so the scene can be built,
 * measured and torn down without a render cycle in the way.
 */

/* ── Procedural textures ───────────────────────────────────────
   Drawn once into a canvas at module level and shared. Each is a
   few kilobytes of ImageData rather than a network request, and
   the grain is what stops the surfaces reading as plastic. */

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
  // A few knots.
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
  // Border and a simple woven band — enough pattern to read as a
  // rug rather than a painted rectangle.
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
 * A tower facade: dark concrete with lit windows.
 *
 * Used as both the colour map and the emissive map, so the lit
 * cells glow and feed the bloom pass while the concrete stays
 * dark. One texture, varied per building by UV repeat, which is
 * what keeps a skyline from looking stamped.
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
      const on = r() < lit;
      const px = x * CW + 4;
      const py = y * CH + 4;
      if (on) {
        // Warm sodium, with a few cold fluorescent offices.
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

/* ── Materials ─────────────────────────────────────────────── */

export type Built = {
  root: THREE.Group;
  /** Where the CSS3D desktop goes, in world space. */
  screen: { position: THREE.Vector3; width: number; height: number };
  /** Where the CSS3D television picture goes. */
  tv: { position: THREE.Vector3; width: number; height: number };
  /** Hit targets for pointer interaction, by name. */
  targets: THREE.Object3D[];
  lamps: {
    sun: THREE.DirectionalLight;
    windowFill: THREE.RectAreaLight;
    desk: THREE.PointLight;
    neon: THREE.PointLight;
    screen: THREE.PointLight;
    tv: THREE.PointLight;
    ambient: THREE.HemisphereLight;
  };
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  ships: THREE.Group;
  rift: THREE.Mesh;
  riftMat: THREE.ShaderMaterial;
  cat: { group: THREE.Group; blush: THREE.Mesh[]; tail: THREE.Object3D };
  neonSign: THREE.Group;
  screenGlow: THREE.Mesh;
  tvGlow: THREE.Mesh;
  dispose: () => void;
};

const ROOM = {
  w: 6,
  h: 3,
  d: 5,
  backZ: -2.6,
  leftX: -3,
  rightX: 3,
};

const WIN = { x0: -1.7, x1: 1.9, y0: 1.05, y1: 2.45 };

/* The desk surface everything else is measured from. */
const DESK_Y = 0.76;

export function buildRoom(): Built {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const targets: THREE.Object3D[] = [];

  const keep = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const wallMap = keep(wallTexture());
  const woodMap = keep(woodTexture());
  const rugMap = keep(rugTexture());

  const wallMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x6d6480, roughness: 0.94, map: wallMap }),
  );
  const floorMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 0.62, map: woodMap, metalness: 0.02 }),
  );
  const deskMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x7a5538, roughness: 0.46, map: woodMap, metalness: 0.04 }),
  );
  const darkMetal = keep(
    new THREE.MeshStandardMaterial({ color: 0x1b1a22, roughness: 0.42, metalness: 0.68 }),
  );
  const plastic = keep(
    new THREE.MeshStandardMaterial({ color: 0x24222c, roughness: 0.56, metalness: 0.08 }),
  );
  const potMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x9a5f3e, roughness: 0.85 }),
  );
  const soilMat = keep(new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 1 }));

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

  /* ── Shell ─────────────────────────────────────────────── */
  const floorGeo = keep(new THREE.PlaneGeometry(ROOM.w, ROOM.d));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, ROOM.backZ + ROOM.d / 2);
  floor.receiveShadow = true;
  root.add(floor);

  const ceilGeo = keep(new THREE.PlaneGeometry(ROOM.w, ROOM.d));
  const ceil = new THREE.Mesh(ceilGeo, wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.h, ROOM.backZ + ROOM.d / 2);
  ceil.receiveShadow = true;
  root.add(ceil);

  // Back wall, built around the window rather than through it.
  const T = 0.12;
  add(box(ROOM.w, WIN.y0, T), wallMat, 0, WIN.y0 / 2, ROOM.backZ - T / 2);
  add(box(ROOM.w, ROOM.h - WIN.y1, T), wallMat, 0, (ROOM.h + WIN.y1) / 2, ROOM.backZ - T / 2);
  add(
    box(WIN.x0 - -ROOM.w / 2, WIN.y1 - WIN.y0, T),
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

  // Side walls.
  const sideGeo = keep(new THREE.PlaneGeometry(ROOM.d, ROOM.h));
  const left = new THREE.Mesh(sideGeo, wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(ROOM.leftX, ROOM.h / 2, ROOM.backZ + ROOM.d / 2);
  left.receiveShadow = true;
  root.add(left);

  const right = new THREE.Mesh(sideGeo, wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(ROOM.rightX, ROOM.h / 2, ROOM.backZ + ROOM.d / 2);
  right.receiveShadow = true;
  root.add(right);

  // Skirting, because a wall meeting a floor at a hard seam is the
  // single clearest tell that a room was never built.
  const skirtMat = keep(new THREE.MeshStandardMaterial({ color: 0x3b3446, roughness: 0.7 }));
  add(box(ROOM.w, 0.1, 0.03), skirtMat, 0, 0.05, ROOM.backZ + 0.015);
  const skirtL = add(box(ROOM.d, 0.1, 0.03), skirtMat, 0, 0.05, 0);
  skirtL.rotation.y = Math.PI / 2;
  skirtL.position.set(ROOM.leftX + 0.015, 0.05, ROOM.backZ + ROOM.d / 2);

  // Window frame and sill.
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: 0x15121d, roughness: 0.5, metalness: 0.3 }));
  const fw = WIN.x1 - WIN.x0;
  const fh = WIN.y1 - WIN.y0;
  add(box(fw + 0.12, 0.07, 0.14), frameMat, (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.02, ROOM.backZ);
  add(box(fw + 0.12, 0.07, 0.14), frameMat, (WIN.x0 + WIN.x1) / 2, WIN.y1 + 0.02, ROOM.backZ);
  add(box(0.07, fh, 0.14), frameMat, WIN.x0 - 0.02, (WIN.y0 + WIN.y1) / 2, ROOM.backZ);
  add(box(0.07, fh, 0.14), frameMat, WIN.x1 + 0.02, (WIN.y0 + WIN.y1) / 2, ROOM.backZ);
  // Mullions.
  for (const mx of [WIN.x0 + fw / 3, WIN.x0 + (2 * fw) / 3]) {
    add(box(0.05, fh, 0.1), frameMat, mx, (WIN.y0 + WIN.y1) / 2, ROOM.backZ);
  }
  add(box(fw, 0.05, 0.1), frameMat, (WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, ROOM.backZ);
  // Sill, deep enough for a cat.
  const sill = add(box(fw + 0.3, 0.06, 0.3), deskMat, (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.05, ROOM.backZ + 0.11);

  /* ── Rug ───────────────────────────────────────────────── */
  const rugGeo = keep(new THREE.PlaneGeometry(3.4, 2.2));
  const rugMat = keep(new THREE.MeshStandardMaterial({ map: rugMap, roughness: 0.98 }));
  const rug = new THREE.Mesh(rugGeo, rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.1, 0.004, -0.75);
  rug.receiveShadow = true;
  root.add(rug);

  /* ── Desk ──────────────────────────────────────────────── */
  const deskW = 2.7;
  const deskD = 0.72;
  const deskZ = ROOM.backZ + 0.52;
  add(box(deskW, 0.045, deskD), deskMat, 0.1, DESK_Y, deskZ);
  // Legs.
  for (const lx of [0.1 - deskW / 2 + 0.07, 0.1 + deskW / 2 - 0.07]) {
    for (const lz of [deskZ - deskD / 2 + 0.06, deskZ + deskD / 2 - 0.06]) {
      add(box(0.05, DESK_Y, 0.05), darkMetal, lx, DESK_Y / 2, lz);
    }
  }
  // Drawer unit.
  const drawer = add(box(0.46, 0.6, 0.6), deskMat, 1.1, 0.3, deskZ);
  for (let i = 0; i < 3; i++) {
    add(box(0.4, 0.015, 0.02), darkMetal, 1.1, 0.12 + i * 0.18, deskZ + 0.31);
  }
  void drawer;

  /* ── Monitor ───────────────────────────────────────────── */
  const SCREEN_W = 0.62;
  const SCREEN_H = SCREEN_W * (464 / 780);
  const screenY = DESK_Y + 0.055 + 0.03 + SCREEN_H / 2 + 0.03;
  const screenZ = deskZ - 0.19;

  // Body, a hair behind the picture.
  const bodyMat = keep(new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.34, metalness: 0.55 }));
  add(box(SCREEN_W + 0.05, SCREEN_H + 0.09, 0.035), bodyMat, 0, screenY - 0.015, screenZ - 0.022);
  // Chin.
  add(box(SCREEN_W + 0.05, 0.035, 0.04), bodyMat, 0, screenY - SCREEN_H / 2 - 0.042, screenZ - 0.02);
  // Neck and foot.
  add(box(0.09, 0.17, 0.05), bodyMat, 0, DESK_Y + 0.055 + 0.085, screenZ - 0.02);
  const footGeo = keep(new THREE.CylinderGeometry(0.16, 0.18, 0.016, 32));
  add(footGeo, bodyMat, 0, DESK_Y + 0.03, screenZ - 0.02);

  /**
   * The screen is a CSS3D element, which composites over the WebGL
   * canvas and therefore cannot bloom. This plane sits just behind
   * it, emissive, purely so the monitor throws light into the
   * bloom pass and onto the wall — the glow you see around a
   * screen in a dark room is doing most of the work of selling it.
   */
  const screenGlowMat = keep(
    new THREE.MeshBasicMaterial({ color: 0x7fb4e8, transparent: true, opacity: 0.0 }),
  );
  const screenGlow = new THREE.Mesh(keep(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)), screenGlowMat);
  screenGlow.position.set(0, screenY, screenZ - 0.004);
  root.add(screenGlow);

  // Asleep, the panel is a dark mirror rather than a hole.
  const offMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.08, metalness: 0.9 }),
  );
  const offPanel = new THREE.Mesh(keep(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)), offMat);
  offPanel.position.set(0, screenY, screenZ);
  offPanel.name = "monitor";
  root.add(offPanel);
  targets.push(offPanel);

  /* ── Desk things ───────────────────────────────────────── */
  // Keyboard, on a slight angle because nobody squares theirs up.
  const kb = add(box(0.44, 0.015, 0.14), plastic, -0.06, DESK_Y + 0.03, deskZ + 0.19);
  kb.rotation.y = 0.045;
  for (let rw = 0; rw < 4; rw++) {
    for (let k = 0; k < 13; k++) {
      const key = add(
        box(0.026, 0.006, 0.024),
        keep(new THREE.MeshStandardMaterial({ color: 0x3a3844, roughness: 0.8 })),
        -0.06 - 0.2 + k * 0.032,
        DESK_Y + 0.04,
        deskZ + 0.145 + rw * 0.03,
        false,
        false,
      );
      key.rotation.y = 0.045;
    }
  }
  // Mouse.
  const mouse = add(keep(new THREE.SphereGeometry(0.035, 20, 14)), plastic, 0.3, DESK_Y + 0.032, deskZ + 0.2);
  mouse.scale.set(1, 0.5, 1.5);

  // Mug.
  const mugMat = keep(new THREE.MeshStandardMaterial({ color: 0xbf5f7f, roughness: 0.32 }));
  const mug = add(keep(new THREE.CylinderGeometry(0.043, 0.038, 0.1, 28, 1, true)), mugMat, -0.78, DESK_Y + 0.078, deskZ + 0.1);
  mug.material = keep(new THREE.MeshStandardMaterial({ color: 0xbf5f7f, roughness: 0.32, side: THREE.DoubleSide }));
  add(keep(new THREE.CylinderGeometry(0.043, 0.043, 0.006, 28)), mugMat, -0.78, DESK_Y + 0.031, deskZ + 0.1);
  // Coffee.
  add(
    keep(new THREE.CylinderGeometry(0.038, 0.038, 0.004, 24)),
    keep(new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.18 })),
    -0.78,
    DESK_Y + 0.105,
    deskZ + 0.1,
    false,
  );
  const handle = add(keep(new THREE.TorusGeometry(0.028, 0.008, 10, 24, Math.PI)), mugMat, -0.74, DESK_Y + 0.078, deskZ + 0.1);
  handle.rotation.z = -Math.PI / 2;
  handle.rotation.y = Math.PI / 2;

  // Books, stacked slightly out of true.
  const bookCols = [0x6f3550, 0x2f4a6b, 0x6b5a2f];
  bookCols.forEach((col, i) => {
    const b = add(
      box(0.2, 0.032, 0.28),
      keep(new THREE.MeshStandardMaterial({ color: col, roughness: 0.82 })),
      -1.08,
      DESK_Y + 0.04 + i * 0.034,
      deskZ - 0.02,
    );
    b.rotation.y = (i - 1) * 0.07;
  });

  // Speaker.
  const spk = add(box(0.11, 0.17, 0.1), plastic, 0.72, DESK_Y + 0.11, deskZ - 0.08);
  void spk;
  for (const [sy, sr] of [
    [0.145, 0.032],
    [0.072, 0.018],
  ] as const) {
    const cone = add(
      keep(new THREE.CylinderGeometry(sr, sr, 0.006, 20)),
      keep(new THREE.MeshStandardMaterial({ color: 0x100f16, roughness: 0.9 })),
      0.72,
      DESK_Y + sy,
      deskZ - 0.031,
      false,
      false,
    );
    cone.rotation.x = Math.PI / 2;
  }

  // Headphones hooked under the desk edge.
  const hpMat = keep(new THREE.MeshStandardMaterial({ color: 0x18171f, roughness: 0.5 }));
  const band = add(keep(new THREE.TorusGeometry(0.075, 0.009, 10, 30, Math.PI)), hpMat, -1.18, DESK_Y - 0.08, deskZ + 0.2);
  band.rotation.x = Math.PI / 2;
  band.rotation.z = -0.35;
  for (const ex of [-0.055, 0.055]) {
    const cup = add(keep(new THREE.CylinderGeometry(0.035, 0.035, 0.022, 20)), hpMat, -1.18 + ex, DESK_Y - 0.145, deskZ + 0.2);
    cup.rotation.z = Math.PI / 2;
  }

  // Sticky notes on the monitor bezel.
  const stickyCols = [0xf2d479, 0xf2a0b5, 0x9fe0c4];
  stickyCols.forEach((col, i) => {
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

  /* ── Desk lamp ─────────────────────────────────────────── */
  const lampMat = keep(new THREE.MeshStandardMaterial({ color: 0x2a2833, roughness: 0.35, metalness: 0.6 }));
  add(keep(new THREE.CylinderGeometry(0.075, 0.085, 0.018, 28)), lampMat, 0.86, DESK_Y + 0.035, deskZ - 0.12);
  const arm = add(keep(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 12)), lampMat, 0.86, DESK_Y + 0.26, deskZ - 0.12);
  arm.rotation.z = 0.28;
  const armB = add(keep(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 12)), lampMat, 0.73, DESK_Y + 0.5, deskZ - 0.04);
  armB.rotation.z = -0.9;
  armB.rotation.x = 0.5;
  const shade = add(keep(new THREE.ConeGeometry(0.1, 0.13, 26, 1, true)), lampMat, 0.57, DESK_Y + 0.5, deskZ + 0.05);
  shade.rotation.x = 2.1;
  shade.rotation.z = 0.3;
  shade.material = keep(
    new THREE.MeshStandardMaterial({ color: 0x2a2833, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }),
  );
  // The bulb itself — emissive, so the bloom pass finds it.
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  const bulb = new THREE.Mesh(keep(new THREE.SphereGeometry(0.03, 16, 12)), bulbMat);
  bulb.position.set(0.56, DESK_Y + 0.46, deskZ + 0.07);
  root.add(bulb);

  /* ── Chair ─────────────────────────────────────────────── */
  const chair = new THREE.Group();
  const chairMat = keep(new THREE.MeshStandardMaterial({ color: 0x23202e, roughness: 0.78 }));
  const seat = new THREE.Mesh(box(0.5, 0.07, 0.48), chairMat);
  seat.position.set(0, 0.46, 0);
  seat.castShadow = true;
  chair.add(seat);
  const back = new THREE.Mesh(box(0.48, 0.58, 0.06), chairMat);
  back.position.set(0, 0.78, -0.21);
  back.rotation.x = -0.14;
  back.castShadow = true;
  chair.add(back);
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
  chair.position.set(-0.05, 0, deskZ + 0.92);
  chair.rotation.y = 0.22;
  root.add(chair);

  /* ── Shelf on the left wall ────────────────────────────── */
  const shelfY = 1.62;
  const shelf = add(box(0.05, 0.04, 1.1), deskMat, ROOM.leftX + 0.17, shelfY, -1.2);
  shelf.rotation.y = Math.PI / 2;
  shelf.scale.set(1, 1, 1);
  const shelfTop = add(box(0.3, 0.035, 1.1), deskMat, ROOM.leftX + 0.16, shelfY, -1.2);
  void shelfTop;
  // Books on it, leaning.
  const r2 = rand(53);
  for (let i = 0; i < 11; i++) {
    const hgt = 0.2 + r2() * 0.08;
    const b = add(
      box(0.17, hgt, 0.035),
      keep(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(r2(), 0.32, 0.36),
          roughness: 0.88,
        }),
      ),
      ROOM.leftX + 0.16,
      shelfY + 0.018 + hgt / 2,
      -1.68 + i * 0.045,
    );
    if (i > 8) b.rotation.x = 0.3;
  }
  // A record, propped.
  const sleeve = add(
    box(0.3, 0.3, 0.012),
    keep(new THREE.MeshStandardMaterial({ color: 0x191325, roughness: 0.7 })),
    ROOM.leftX + 0.2,
    shelfY + 0.17,
    -0.82,
  );
  sleeve.rotation.y = Math.PI / 2;
  sleeve.rotation.x = 0.16;

  /* ── Posters ───────────────────────────────────────────── */
  const posterGeo = keep(new THREE.PlaneGeometry(0.52, 0.72));
  const p1 = new THREE.Mesh(
    posterGeo,
    keep(new THREE.MeshStandardMaterial({ color: 0x7b2250, roughness: 0.92, emissive: 0x2a0a1c, emissiveIntensity: 0.4 })),
  );
  p1.rotation.y = Math.PI / 2;
  p1.position.set(ROOM.leftX + 0.02, 2.1, -1.5);
  root.add(p1);

  const p2 = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(0.44, 0.34)),
    keep(new THREE.MeshStandardMaterial({ color: 0x2a3f5c, roughness: 0.92 })),
  );
  p2.rotation.y = Math.PI / 2;
  p2.position.set(ROOM.leftX + 0.02, 1.2, -0.3);
  root.add(p2);

  /* ── Wall clock ────────────────────────────────────────── */
  const clock = new THREE.Group();
  const face = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 36)),
    keep(new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.6 })),
  );
  face.rotation.x = Math.PI / 2;
  face.castShadow = true;
  clock.add(face);
  const rim = new THREE.Mesh(
    keep(new THREE.TorusGeometry(0.112, 0.012, 10, 36)),
    keep(new THREE.MeshStandardMaterial({ color: 0x241f2e, roughness: 0.5 })),
  );
  clock.add(rim);
  clock.position.set(-1.1, 2.62, ROOM.backZ + 0.02);
  root.add(clock);

  /* ── Neon sign ─────────────────────────────────────────── */
  const neonSign = new THREE.Group();
  const neonMat = keep(new THREE.MeshBasicMaterial({ color: 0xff2f86 }));
  // An abstract mark of Claude's own invention: two arcs and a
  // bar. No wordmark, nothing borrowed.
  const arc1 = new THREE.Mesh(keep(new THREE.TorusGeometry(0.16, 0.012, 10, 40, Math.PI * 1.35)), neonMat);
  arc1.rotation.z = -0.5;
  neonSign.add(arc1);
  const arc2 = new THREE.Mesh(keep(new THREE.TorusGeometry(0.09, 0.011, 10, 32, Math.PI * 1.1)), neonMat);
  arc2.rotation.z = 2.3;
  arc2.position.set(0.03, -0.02, 0.012);
  neonSign.add(arc2);
  const barGeo = keep(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 10));
  const bar = new THREE.Mesh(barGeo, neonMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, -0.2, 0);
  neonSign.add(bar);
  neonSign.position.set(ROOM.leftX + 0.08, 1.9, 0.35);
  neonSign.rotation.y = Math.PI / 2;
  root.add(neonSign);

  /* ── Plants ────────────────────────────────────────────── */
  /** A leaf as real geometry: a closed outline, extruded thin. */
  function leafShape(len: number, wide: number, notches: number): THREE.Shape {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const span = Math.sin(t * Math.PI) * wide * (1 - t * 0.25);
      const cut = notches > 0 && i % 3 === 0 ? 0.42 : 1;
      s.lineTo(-span * cut, t * len);
    }
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      const span = Math.sin(t * Math.PI) * wide * (1 - t * 0.25);
      const cut = notches > 0 && i % 3 === 0 ? 0.42 : 1;
      s.lineTo(span * cut, t * len);
    }
    s.lineTo(0, 0);
    return s;
  }

  const leafGeoCache = new Map<string, THREE.ExtrudeGeometry>();
  const leafGeo = (len: number, wide: number, notches: number) => {
    const k = `${len}:${wide}:${notches}`;
    let g = leafGeoCache.get(k);
    if (!g) {
      g = new THREE.ExtrudeGeometry(leafShape(len, wide, notches), {
        depth: 0.004,
        bevelEnabled: true,
        bevelThickness: 0.002,
        bevelSize: 0.003,
        bevelSegments: 1,
        curveSegments: 4,
      });
      leafGeoCache.set(k, g);
      disposables.push(g);
    }
    return g;
  };

  function plantPot(x: number, z: number, radius: number, height: number) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(radius, radius * 0.78, height, 28)),
      potMat,
    );
    pot.position.y = height / 2;
    pot.castShadow = true;
    pot.receiveShadow = true;
    g.add(pot);
    const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(radius, radius * 0.07, 8, 28)), potMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = height;
    g.add(lip);
    const soil = new THREE.Mesh(keep(new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, 0.02, 24)), soilMat);
    soil.position.y = height - 0.012;
    g.add(soil);
    g.position.set(x, 0, z);
    return g;
  }

  // Monstera: big notched leaves on stems, floor right.
  const monstera = plantPot(1.95, deskZ + 0.45, 0.22, 0.3);
  const rM = rand(71);
  const leafMatA = keep(new THREE.MeshStandardMaterial({ color: 0x3f7a42, roughness: 0.62, side: THREE.DoubleSide }));
  const leafMatB = keep(new THREE.MeshStandardMaterial({ color: 0x55984f, roughness: 0.62, side: THREE.DoubleSide }));
  for (let i = 0; i < 9; i++) {
    const stemLen = 0.3 + rM() * 0.34;
    const a = (i / 9) * Math.PI * 2 + rM() * 0.5;
    const tilt = 0.4 + rM() * 0.45;
    const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.009, 0.012, stemLen, 8)), leafMatA);
    stem.position.set(Math.cos(a) * 0.05, 0.3 + stemLen / 2, Math.sin(a) * 0.05);
    stem.rotation.z = Math.cos(a) * tilt;
    stem.rotation.x = -Math.sin(a) * tilt;
    stem.castShadow = true;
    monstera.add(stem);

    const lf = new THREE.Mesh(leafGeo(0.3 + rM() * 0.1, 0.14, 1), i % 2 ? leafMatA : leafMatB);
    lf.position.set(
      Math.cos(a) * (0.05 + Math.sin(tilt) * stemLen),
      0.3 + Math.cos(tilt) * stemLen,
      Math.sin(a) * (0.05 + Math.sin(tilt) * stemLen),
    );
    lf.rotation.set(-1.0 - rM() * 0.5, a + rM(), rM() * 0.6 - 0.3);
    lf.castShadow = true;
    monstera.add(lf);
  }
  root.add(monstera);

  // Snake plant: stiff blades, floor left.
  const snake = plantPot(-2.2, deskZ + 0.5, 0.17, 0.26);
  const rS = rand(83);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rS();
    const len = 0.46 + rS() * 0.4;
    const blade = new THREE.Mesh(leafGeo(len, 0.038, 0), i % 3 ? leafMatA : leafMatB);
    blade.position.set(Math.cos(a) * 0.055 * rS(), 0.25, Math.sin(a) * 0.055 * rS());
    blade.rotation.set(-0.08 + rS() * 0.16, a, Math.cos(a) * (0.08 + rS() * 0.2));
    blade.castShadow = true;
    snake.add(blade);
  }
  root.add(snake);

  // Trailing pothos on the shelf.
  const pothos = plantPot(ROOM.leftX + 0.17, -0.45, 0.085, 0.11);
  pothos.position.y = shelfY + 0.018;
  const rP = rand(97);
  for (let v = 0; v < 4; v++) {
    const dir = v - 1.5;
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const lf = new THREE.Mesh(leafGeo(0.07, 0.045, 0), i % 2 ? leafMatA : leafMatB);
      lf.position.set(
        dir * 0.035 + Math.sin(t * 5 + v) * 0.05,
        0.11 - t * (0.5 + v * 0.14),
        Math.cos(t * 4 + v) * 0.05,
      );
      lf.rotation.set(-1.4 + rP() * 0.6, rP() * 6, rP() * 6);
      pothos.add(lf);
    }
  }
  root.add(pothos);

  // Small succulent on the desk.
  const succ = plantPot(-0.52, deskZ - 0.12, 0.05, 0.065);
  succ.position.y = DESK_Y + 0.025;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const lf = new THREE.Mesh(leafGeo(0.07, 0.025, 0), i % 2 ? leafMatA : leafMatB);
    lf.position.set(Math.cos(a) * 0.018, 0.065, Math.sin(a) * 0.018);
    lf.rotation.set(-0.7, a, 0);
    succ.add(lf);
  }
  root.add(succ);

  // Sill plant, by the cat.
  const sillPlant = plantPot(WIN.x1 - 0.3, ROOM.backZ + 0.11, 0.07, 0.1);
  sillPlant.position.y = WIN.y0 - 0.02;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const lf = new THREE.Mesh(leafGeo(0.17, 0.028, 0), i % 2 ? leafMatA : leafMatB);
    lf.position.set(Math.cos(a) * 0.02, 0.1, Math.sin(a) * 0.02);
    lf.rotation.set(-0.2, a, Math.cos(a) * 0.3);
    sillPlant.add(lf);
  }
  root.add(sillPlant);

  /* ── The cat ───────────────────────────────────────────── */
  const catGroup = new THREE.Group();
  const furMat = keep(new THREE.MeshStandardMaterial({ color: 0x1d1a26, roughness: 0.92 }));
  const body = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.085, 0.1, 8, 20)), furMat);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.085, 0);
  body.castShadow = true;
  catGroup.add(body);

  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.068, 24, 18)), furMat);
  head.position.set(0.1, 0.17, 0);
  head.castShadow = true;
  catGroup.add(head);

  const earGeo = keep(new THREE.ConeGeometry(0.03, 0.055, 10));
  const earL = new THREE.Mesh(earGeo, furMat);
  earL.position.set(0.09, 0.225, -0.04);
  earL.rotation.z = -0.2;
  catGroup.add(earL);
  const earR = new THREE.Mesh(earGeo, furMat);
  earR.position.set(0.09, 0.225, 0.04);
  earR.rotation.z = -0.2;
  catGroup.add(earR);

  const eyeMat = keep(new THREE.MeshBasicMaterial({ color: 0xc8f05a }));
  const eyeGeo = keep(new THREE.SphereGeometry(0.011, 12, 10));
  for (const ez of [-0.028, 0.028]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.158, 0.182, ez);
    catGroup.add(eye);
  }

  // Blush, hidden until she is noticed.
  const blushMat = keep(
    new THREE.MeshBasicMaterial({ color: 0xff6f9d, transparent: true, opacity: 0 }),
  );
  const blush: THREE.Mesh[] = [];
  for (const bz of [-0.042, 0.042]) {
    const b = new THREE.Mesh(keep(new THREE.SphereGeometry(0.019, 14, 10)), blushMat);
    b.position.set(0.138, 0.158, bz);
    b.scale.set(0.5, 0.75, 1);
    catGroup.add(b);
    blush.push(b);
  }

  // Tail on its own pivot so it can swing from the base.
  const tailPivot = new THREE.Object3D();
  tailPivot.position.set(-0.11, 0.1, 0);
  const tail = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.016, 0.17, 6, 12)), furMat);
  tail.position.set(-0.05, 0.05, 0);
  tail.rotation.z = 0.9;
  tail.castShadow = true;
  tailPivot.add(tail);
  catGroup.add(tailPivot);

  // One generous hit box, because raycasting a dozen small parts
  // makes a cat that is hard to pet.
  const catHit = new THREE.Mesh(
    box(0.42, 0.34, 0.3),
    keep(new THREE.MeshBasicMaterial({ visible: false })),
  );
  catHit.position.set(0, 0.16, 0);
  catHit.name = "cat";
  catGroup.add(catHit);
  targets.push(catHit);

  catGroup.position.set(WIN.x0 + 0.55, WIN.y0 - 0.02, ROOM.backZ + 0.14);
  catGroup.rotation.y = -0.5;
  root.add(catGroup);

  /* ── Television ────────────────────────────────────────── */
  const TV_W = 0.56;
  const TV_H = TV_W * (3 / 4);
  const tvX = ROOM.leftX + 0.62;
  const tvY = 1.78;
  const tvZ = ROOM.backZ + 0.34;

  const tvStand = add(box(0.72, 0.05, 0.5), deskMat, tvX, 1.46, tvZ);
  void tvStand;
  for (const lz of [tvZ - 0.2, tvZ + 0.2]) {
    for (const lx of [tvX - 0.3, tvX + 0.3]) {
      add(box(0.04, 1.44, 0.04), darkMetal, lx, 0.72, lz);
    }
  }

  const tvShell = keep(new THREE.MeshStandardMaterial({ color: 0x9a8f7a, roughness: 0.72 }));
  // Cabinet, built as a frame around the picture so the CSS3D
  // element sits in a recess rather than floating on a slab.
  add(box(TV_W + 0.16, 0.07, 0.42), tvShell, tvX, tvY + TV_H / 2 + 0.035, tvZ);
  add(box(TV_W + 0.16, 0.07, 0.42), tvShell, tvX, tvY - TV_H / 2 - 0.035, tvZ);
  add(box(0.08, TV_H, 0.42), tvShell, tvX - TV_W / 2 - 0.04, tvY, tvZ);
  add(box(0.22, TV_H, 0.42), tvShell, tvX + TV_W / 2 + 0.11, tvY, tvZ);
  add(box(TV_W + 0.3, TV_H + 0.14, 0.04), tvShell, tvX + 0.07, tvY, tvZ - 0.21);

  // Dials on the fascia.
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
  // Rabbit ears.
  for (const sign of [-1, 1]) {
    const ant = add(keep(new THREE.CylinderGeometry(0.004, 0.006, 0.52, 8)), darkMetal, tvX, tvY + TV_H / 2 + 0.3, tvZ);
    ant.rotation.z = sign * 0.6;
    ant.position.x += sign * 0.12;
  }

  // Dark glass when it is off.
  const tvOffMat = keep(new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.12, metalness: 0.8 }));
  const tvPanel = new THREE.Mesh(keep(new THREE.PlaneGeometry(TV_W, TV_H)), tvOffMat);
  tvPanel.position.set(tvX, tvY, tvZ + 0.212);
  tvPanel.name = "tv";
  root.add(tvPanel);
  targets.push(tvPanel);

  const tvGlowMat = keep(
    new THREE.MeshBasicMaterial({ color: 0x89c8ff, transparent: true, opacity: 0 }),
  );
  const tvGlow = new THREE.Mesh(keep(new THREE.PlaneGeometry(TV_W, TV_H)), tvGlowMat);
  tvGlow.position.set(tvX, tvY, tvZ + 0.208);
  root.add(tvGlow);

  // The deck under it.
  add(box(TV_W + 0.2, 0.1, 0.34), keep(new THREE.MeshStandardMaterial({ color: 0x2a2832, roughness: 0.5 })), tvX, 1.54, tvZ);
  add(
    box(0.2, 0.025, 0.01),
    keep(new THREE.MeshBasicMaterial({ color: 0x4ad8a0 })),
    tvX - 0.12,
    1.54,
    tvZ + 0.18,
    false,
  );

  /* ── Outside ───────────────────────────────────────────── */
  const outside = new THREE.Group();

  // Sky: a shader plane rather than a texture, so the phase change
  // is a uniform lerp instead of four images.
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

        // Stars only in the upper sky, and only after dark.
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
  const skyGeo = keep(new THREE.PlaneGeometry(260, 150));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.set(0, 30, -90);
  outside.add(sky);

  // City: real towers, each with its own facade.
  const rC = rand(131);
  const facades = Array.from({ length: 6 }, (_, i) => {
    const f = facadeTexture(200 + i, 0.3 + i * 0.07);
    disposables.push(f.map, f.emissive);
    return f;
  });

  for (let i = 0; i < 64; i++) {
    const f = facades[Math.floor(rC() * facades.length)];
    const w = 1.6 + rC() * 4.2;
    const d = 1.6 + rC() * 3.4;
    const hgt = 4 + rC() * rC() * 38;
    const x = (rC() - 0.5) * 76;
    const z = -11 - rC() * 52;

    const map = f.map.clone();
    const emi = f.emissive.clone();
    map.needsUpdate = true;
    emi.needsUpdate = true;
    const ru = Math.max(1, Math.round(w / 1.1));
    const rv = Math.max(1, Math.round(hgt / 1.1));
    map.repeat.set(ru, rv);
    emi.repeat.set(ru, rv);
    disposables.push(map, emi);

    const mat = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emi,
      emissive: 0xffffff,
      emissiveIntensity: 1,
      roughness: 0.86,
      color: 0x565068,
    });
    disposables.push(mat);

    const tower = new THREE.Mesh(box(w, hgt, d), mat);
    tower.position.set(x, hgt / 2 - 1.2, z);
    outside.add(tower);

    // A roof light on the taller ones.
    if (hgt > 24 && rC() > 0.4) {
      const beacon = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.22, 10, 8)),
        keep(new THREE.MeshBasicMaterial({ color: 0xff3b3b })),
      );
      beacon.position.set(x, hgt - 1.0, z);
      outside.add(beacon);
    }
  }

  /* ── Ships ─────────────────────────────────────────────── */
  const ships = new THREE.Group();
  const hullMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a3358, roughness: 0.45, metalness: 0.5 }));
  const thrustMat = keep(new THREE.MeshBasicMaterial({ color: 0x8feaff }));
  const thrustWarm = keep(new THREE.MeshBasicMaterial({ color: 0xffb060 }));

  const makeShip = (kind: 0 | 1 | 2) => {
    const g = new THREE.Group();
    if (kind === 0) {
      // Liner: long, slab-sided, lit windows along the flank.
      const hull = new THREE.Mesh(box(5.4, 0.5, 0.8), hullMat);
      hull.castShadow = false;
      g.add(hull);
      const fin = new THREE.Mesh(box(1.2, 0.55, 0.1), hullMat);
      fin.position.set(-0.6, 0.5, 0);
      g.add(fin);
      for (let i = 0; i < 16; i++) {
        const win = new THREE.Mesh(
          box(0.12, 0.07, 0.02),
          keep(new THREE.MeshBasicMaterial({ color: 0xbfe8ff })),
        );
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
      // Darter: small, fast, one bright engine.
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
      // Hauler: boxy, slung containers, amber exhaust.
      const hull = new THREE.Mesh(box(3, 0.7, 1), hullMat);
      g.add(hull);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(
          box(0.8, 0.5, 0.8),
          keep(new THREE.MeshStandardMaterial({ color: 0x4a3f6a, roughness: 0.9 })),
        );
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

  const SHIP_PLAN: Array<{ kind: 0 | 1 | 2; y: number; z: number; speed: number; t: number; s: number }> = [
    { kind: 0, y: 17, z: -40, speed: 1.5, t: 0.1, s: 1.6 },
    { kind: 1, y: 11, z: -22, speed: -7.5, t: 0.4, s: 1 },
    { kind: 1, y: 22, z: -34, speed: 5.2, t: 0.75, s: 0.8 },
    { kind: 2, y: 7.5, z: -17, speed: -2.6, t: 0.6, s: 1 },
    { kind: 1, y: 5, z: -13, speed: 9, t: 0.2, s: 0.7 },
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
         * travelling outward takes you inward — the radius is
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

        // Rim: a hard chromatic edge where the fold meets the sky.
        float rim = smoothstep(0.86, 0.99, r);
        col = mix(col, uTint, rim * 0.85);
        col += cold * smoothstep(0.93, 1.0, r) * 0.6;

        float alpha = smoothstep(1.0, 0.94, r) * 0.94 + rim * 0.5;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
  disposables.push(riftMat);
  const riftGeo = keep(new THREE.PlaneGeometry(13, 13));
  const rift = new THREE.Mesh(riftGeo, riftMat);
  rift.position.set(5.5, 13, -27);
  outside.add(rift);

  root.add(outside);

  /* ── Light ─────────────────────────────────────────────── */
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
  const windowFill = new THREE.RectAreaLight(0x8ab0ff, 2.4, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0);
  windowFill.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, ROOM.backZ + 0.05);
  windowFill.lookAt((WIN.x0 + WIN.x1) / 2, 1.2, 2);
  root.add(windowFill);

  const deskLamp = new THREE.PointLight(0xffc98a, 2.2, 3.4, 2);
  deskLamp.position.set(0.56, DESK_Y + 0.44, deskZ + 0.08);
  deskLamp.castShadow = true;
  deskLamp.shadow.mapSize.set(1024, 1024);
  deskLamp.shadow.bias = -0.004;
  root.add(deskLamp);

  const neonLight = new THREE.PointLight(0xff2f86, 1.5, 2.6, 2);
  neonLight.position.set(ROOM.leftX + 0.25, 1.9, 0.35);
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
      position: new THREE.Vector3(0, screenY, screenZ + 0.001),
      width: SCREEN_W,
      height: SCREEN_H,
    },
    tv: {
      position: new THREE.Vector3(tvX, tvY, tvZ + 0.213),
      width: TV_W,
      height: TV_H,
    },
    targets,
    lamps: {
      sun,
      windowFill,
      desk: deskLamp,
      neon: neonLight,
      screen: screenLight,
      tv: tvLight,
      ambient,
    },
    sky,
    skyMat,
    ships,
    rift,
    riftMat,
    cat: { group: catGroup, blush, tail: tailPivot },
    neonSign,
    screenGlow,
    tvGlow,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export { ROOM, WIN, DESK_Y };
