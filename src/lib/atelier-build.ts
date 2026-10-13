import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildGamingChair } from "./atelier-chair";
import { buildVistas, VISTA_SPECS, type VistaSet } from "./atelier-vista";
import {
  buildCat,
  buildWalkingCat,
  buildClock,
  buildDecor,
  buildMotes,
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

/**
 * Book spines, as one atlas.
 *
 * A shelf of plain coloured blocks is the clearest tell that a
 * room was built rather than furnished. Real spines have a
 * cloth, two rules stamped near the head and tail, a title
 * running up the length and a publisher's mark at the foot — and
 * crucially they are all slightly different heights, colours and
 * typographic habits.
 *
 * One canvas with every spine side by side, so twenty books cost
 * one texture upload; each book takes its slice by offsetting
 * the map. The titles are legible only up close, which is
 * correct: from across the room you should read "a shelf of
 * books with writing on them", not a list.
 */
const SPINE_TITLES: Array<[string, string]> = [
  // What someone actually builds a shelf out of: how to work,
  // how to think, and something to read when neither is going
  // well.
  ["MEDITATIONS", "AURELIUS"],
  ["LETTERS FROM A STOIC", "SENECA"],
  ["THE ENCHIRIDION", "EPICTETUS"],
  ["MAN'S SEARCH FOR MEANING", "FRANKL"],
  ["BEYOND GOOD AND EVIL", "NIETZSCHE"],
  ["TAO TE CHING", "LAO TZU"],
  ["THE REPUBLIC", "PLATO"],
  ["THINK AND GROW RICH", "HILL"],
  ["ATOMIC HABITS", "CLEAR"],
  ["THE 48 LAWS OF POWER", "GREENE"],
  ["MASTERY", "GREENE"],
  ["DEEP WORK", "NEWPORT"],
  ["THE OBSTACLE IS THE WAY", "HOLIDAY"],
  ["RICH DAD POOR DAD", "KIYOSAKI"],
  ["LEAVES OF GRASS", "WHITMAN"],
  ["THE PROPHET", "GIBRAN"],
  ["COLLECTED POEMS", "YEATS"],
  ["SELECTED POEMS", "RUMI"],
];

const SPINE_COLS = SPINE_TITLES.length;
const SPINE_W = 72;
const SPINE_H = 460;

function spineAtlas(): THREE.Texture {
  const { c, g } = canvas(SPINE_W * SPINE_COLS, SPINE_H);
  const r = rand(4411);

  SPINE_TITLES.forEach(([title, author], i) => {
    const x0 = i * SPINE_W;
    const hue = r();
    /* Mostly dark cloth with bright foil. A book is about
       fifteen pixels wide from where the camera stands, and at
       fifteen pixels the only thing that survives is contrast —
       pale cloth with dark type averages out to a grey smear,
       dark cloth with light bands still reads as a bound book. */
    const dark = r() < 0.78;
    const base = new THREE.Color().setHSL(hue, 0.3 + r() * 0.34, dark ? 0.1 + r() * 0.08 : 0.62 + r() * 0.14);
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(x0, 0, SPINE_W, SPINE_H);

    // Cloth tooth, so it is not a flat fill.
    for (let n = 0; n < 900; n++) {
      g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.07})`;
      g.fillRect(x0 + r() * SPINE_W, r() * SPINE_H, 1, 1 + r());
    }
    // A little wear down both folded edges.
    const edge = g.createLinearGradient(x0, 0, x0 + SPINE_W, 0);
    edge.addColorStop(0, "rgba(0,0,0,0.38)");
    edge.addColorStop(0.14, "rgba(0,0,0,0)");
    edge.addColorStop(0.86, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(0,0,0,0.42)");
    g.fillStyle = edge;
    g.fillRect(x0, 0, SPINE_W, SPINE_H);

    // Foil: warm on dark cloth, near-black on pale.
    const ink = dark ? `rgba(244,220,160,0.96)` : `rgba(18,14,12,0.92)`;

    /* Rules at head and tail. Thick, because a two-pixel rule on
       a 460-tall canvas is a third of a pixel on screen. */
    g.fillStyle = ink;
    for (const y of [46, 64, SPINE_H - 104, SPINE_H - 86]) g.fillRect(x0 + 9, y, SPINE_W - 18, 7);

    /* A panel behind the title, the way half the books on a real
       shelf are stamped. This is the single feature that reads
       at any distance. */
    if (r() < 0.55) {
      g.fillStyle = dark ? `rgba(244,220,160,0.16)` : `rgba(18,14,12,0.14)`;
      g.fillRect(x0 + 7, 84, SPINE_W - 14, SPINE_H - 200);
    }

    // Title, running up the spine.
    g.save();
    g.translate(x0 + SPINE_W / 2, SPINE_H - 128);
    g.rotate(-Math.PI / 2);
    g.fillStyle = ink;
    g.textAlign = "left";
    g.textBaseline = "middle";
    let size = 38;
    g.font = `700 ${size}px Georgia, "Times New Roman", serif`;
    // Shrink until the longest titles fit between the rules.
    const room = SPINE_H - 128 - 80;
    while (g.measureText(title).width > room && size > 12) {
      size -= 1;
      g.font = `700 ${size}px Georgia, "Times New Roman", serif`;
    }
    g.fillText(title, 0, 0);
    g.restore();

    // Author at the foot, smaller and across.
    g.save();
    g.translate(x0 + SPINE_W / 2, SPINE_H - 48);
    g.rotate(-Math.PI / 2);
    g.fillStyle = ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    let asz = 22;
    g.font = `600 ${asz}px Georgia, serif`;
    while (g.measureText(author).width > 150 && asz > 8) {
      asz -= 1;
      g.font = `600 ${asz}px Georgia, serif`;
    }
    g.fillText(author, 0, 0);
    g.restore();
  });

  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
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
  // Broad, very faint patches. Painted plaster is never one value,
  // and a wall that is reads instantly as a polygon.
  for (let i = 0; i < 90; i++) {
    const rad = 20 + r() * 70;
    const grad = g.createRadialGradient(r() * 256, r() * 256, 0, 128, 128, rad);
    grad.addColorStop(0, `rgba(255,250,240,${0.05 + r() * 0.06})`);
    grad.addColorStop(1, "rgba(255,250,240,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  return finish(c, 3);
}

/**
 * Woven cloth.
 *
 * A warp and a weft at right angles, plus slub — the slight
 * thickening and thinning along a real thread. At this scale you
 * never consciously see the weave; what you see is that the
 * surface stops being a flat colour, which is the whole
 * difference between upholstery and a painted box.
 */
function fabricTexture(): THREE.Texture {
  const { c, g } = canvas(256, 256);
  const r = rand(211);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 2) {
    g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.07})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`;
    g.beginPath();
    g.moveTo(0, i + 1);
    g.lineTo(256, i + 1);
    g.stroke();
  }
  // Slub: a few hundred short thick threads.
  for (let i = 0; i < 400; i++) {
    const x = r() * 256;
    const y = r() * 256;
    g.strokeStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.05)`;
    g.lineWidth = 1 + r();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() > 0.5 ? 6 + r() * 10 : 0), y + (r() > 0.5 ? 0 : 6 + r() * 10));
    g.stroke();
  }
  return finish(c, 1);
}

/** Greyscale break-up, used as a roughness map so highlights are
 *  never a single clean sheen across a whole surface. */
function roughTexture(seed: number, contrast: number): THREE.Texture {
  const { c, g } = canvas(256, 256);
  const r = rand(seed);
  const mid = 150;
  g.fillStyle = `rgb(${mid},${mid},${mid})`;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = mid + (r() - 0.5) * 2 * contrast;
    g.fillStyle = `rgb(${v},${v},${v})`;
    const w = 2 + r() * 22;
    g.fillRect(r() * 256, r() * 256, w, w * (0.3 + r()));
  }
  return finish(c, 1, false);
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
  tv: { position: THREE.Vector3; width: number; height: number; rotationY: number };
  flat: { position: THREE.Vector3; width: number; height: number; rotationY: number };
  /** Every mesh the raycaster tests, each with a .name. */
  targets: THREE.Object3D[];
  /** Objects with their own idle and reaction behaviour. */
  life: Life[];
  decor: DecorSet;
  /** Photographic window scenes, when their files are present. */
  vistas: VistaSet;
  lamps: {
    sun: THREE.DirectionalLight;
    windowFill: THREE.RectAreaLight;
    desk: THREE.SpotLight;
    neon: THREE.PointLight;
    screen: THREE.PointLight;
    tv: THREE.PointLight;
    flat: THREE.PointLight;
    fire: THREE.PointLight;
    candle: THREE.PointLight;
    ambient: THREE.HemisphereLight;
  };
  props: {
    skyMat: THREE.ShaderMaterial;
    ships: THREE.Group;
    riftMat: THREE.ShaderMaterial;
    rift: THREE.Mesh;
    chair: THREE.Group;
    chairGlowRing: THREE.Mesh;
    vinyl: THREE.Mesh;
    lampBulb: THREE.Mesh;
    lampHead: THREE.Group;
    neonSign: THREE.Group;
    neonBase: THREE.Color;
    neonMat: THREE.MeshBasicMaterial;
    screenGlow: THREE.Mesh;
    screenOff: THREE.Mesh;
    tvGlow: THREE.Mesh;
    tvOff: THREE.Mesh;
    flatGlow: THREE.Mesh;
    flatOff: THREE.Mesh;
    flatLed: THREE.Mesh;
    fireMats: THREE.ShaderMaterial[];
    coalMat: THREE.ShaderMaterial;
    sparkMat: THREE.ShaderMaterial;
    candleMat: THREE.ShaderMaterial;
    speakerCones: THREE.Mesh[];
    posters: THREE.Mesh[];
    towerMats: THREE.MeshStandardMaterial[];
    rainMat: THREE.ShaderMaterial;
    signs: THREE.Mesh[];
    ledGlowA: THREE.PointLight;
    ledGlowB: THREE.PointLight;
    cityGroup: THREE.Group;
    vista: THREE.Mesh;
    vistaMat: THREE.ShaderMaterial;
    ceiling: THREE.Mesh;
    leftWall: THREE.Mesh;
    rightWall: THREE.Mesh;
    plinth: THREE.Group;
    modelFill: THREE.SpotLight;
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
  const clothMap = keep(fabricTexture());
  const woodRough = keep(roughTexture(301, 46));
  const clothRough = keep(roughTexture(409, 30));
  clothMap.repeat.set(5, 5);
  woodRough.repeat.set(2, 2);
  clothRough.repeat.set(4, 4);

  const wallMat = keep(new THREE.MeshStandardMaterial({ color: 0x6d6480, roughness: 0.94, map: wallMap }));
  const floorMat = keep(
    // Low roughness so the neon and the window smear across it.
    // A dry matte floor throws none of the colour back.
    new THREE.MeshStandardMaterial({ color: 0x6d5440, roughness: 0.24, map: woodMap, metalness: 0.22 }),
  );
  const deskMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 0.5, map: woodMap, roughnessMap: woodRough, metalness: 0.05 }),
  );
  const darkMetal = keep(new THREE.MeshStandardMaterial({ color: 0x23222c, roughness: 0.38, roughnessMap: woodRough, metalness: 0.72 }));
  const plastic = keep(new THREE.MeshStandardMaterial({ color: 0x24222c, roughness: 0.56, metalness: 0.08 }));
  /* Warm metal, for the few places a room has any: lamp joints,
     the dials on the set. Everything else being cold metal is
     part of what made the place feel like one material. */
  const brass = keep(new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.3, metalness: 0.85 }));

  const box = (w: number, h: number, d: number) => keep(new THREE.BoxGeometry(w, h, d));

  /* One atlas for every spine in the room; a book takes its
     slice by offsetting the map, so a shelf of twenty costs one
     texture. */
  const spineMap = keep(spineAtlas());
  let spineTurn = 0;

  /**
   * The six faces of a book.
   *
   * Only the spine is printed. The fore-edge is paper, the
   * boards are the cloth again but plain, and the head and tail
   * are the page block — which is what stops a shelf looking
   * like a row of identically wrapped bricks.
   */
  const bookFaces = (r: () => number): THREE.Material[] => {
    const i = spineTurn++ % SPINE_COLS;
    const spine = keep(
      new THREE.MeshStandardMaterial({ roughness: 0.86, map: spineMap.clone() }),
    );
    spine.map!.repeat.set(1 / SPINE_COLS, 1);
    spine.map!.offset.set(i / SPINE_COLS, 0);
    spine.map!.needsUpdate = true;
    keep(spine.map!);

    const cloth = keep(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(r(), 0.24, 0.2 + r() * 0.16),
        roughness: 0.9,
      }),
    );
    const paper = keep(
      new THREE.MeshStandardMaterial({ color: 0xcfc4ad, roughness: 0.95 }),
    );
    /* Spine on BOTH ends. The shelf stands against the right
       wall and that wall is cut away in the overview, so the
       shot people see most looks at it from behind — where a
       strictly correct book would show its fore-edge and the
       titles would never be visible at all. Head and tail stay
       page block, the boards stay cloth. */
    return [spine, spine, paper, paper, cloth, cloth];
  };

  /**
   * A box with its edges taken off.
   *
   * Nothing made by a person has a perfectly sharp arris, and a
   * room built entirely from ones that do reads as a stack of
   * primitives no matter how well it is lit — a bevel a couple of
   * millimetres wide catches a highlight along every edge and the
   * whole thing stops looking like geometry. Radius is clamped so
   * a thin panel cannot invert itself.
   */
  const rbox = (w: number, h: number, d: number, radius = 0.014) => {
    const r2 = Math.min(radius, Math.min(w, h, d) * 0.45);
    return keep(new RoundedBoxGeometry(w, h, d, 2, r2));
  };

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

  /**
   * A cutaway model, not a room you stand in.
   *
   * The ceiling and whichever side wall is between you and the
   * furniture get hidden by the driver as the view moves around —
   * which is the whole trick of a dollhouse render. Both are kept
   * as handles rather than deleted, because from the low desk
   * framings you want the room closed again.
   */
  const ceil = new THREE.Mesh(keep(new THREE.PlaneGeometry(ROOM.w, ROOM.d)), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.h, ROOM.backZ + ROOM.d / 2);
  ceil.receiveShadow = true;
  root.add(ceil);

  // Back wall, built around the window rather than through it.
  const T = 0.12;
  /* Wider than the room. The facade carries on past the cutaway in
     both directions, because otherwise an overview angle looks
     straight past the end of the wall into open sky, and the room
     stops reading as part of a building. */
  const FW = 6.4;
  add(box(FW, WIN.y0, T), wallMat, 0, WIN.y0 / 2, ROOM.backZ - T / 2);
  const FACADE_TOP = ROOM.h;
  add(box(FW, FACADE_TOP - WIN.y1, T), wallMat, 0, (FACADE_TOP + WIN.y1) / 2, ROOM.backZ - T / 2);
  add(
    box(WIN.x0 + FW / 2, WIN.y1 - WIN.y0, T),
    wallMat,
    (-FW / 2 + WIN.x0) / 2,
    (WIN.y0 + WIN.y1) / 2,
    ROOM.backZ - T / 2,
  );
  add(
    box(FW / 2 - WIN.x1, WIN.y1 - WIN.y0, T),
    wallMat,
    (WIN.x1 + FW / 2) / 2,
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

  /* The slab the whole model sits on. Thick enough to read as a
     solid object with the lights off around it. */
  const slabMat = keep(new THREE.MeshStandardMaterial({ color: 0x1a1726, roughness: 0.85 }));
  const slab = new THREE.Mesh(box(ROOM.w + 0.3, 0.26, ROOM.d + 0.3), slabMat);
  slab.position.set(0, -0.135, ROOM.backZ + ROOM.d / 2);
  slab.receiveShadow = true;
  root.add(slab);
  /* A lit edge around the base. Four bars, not a slab — as a
     single box the size of the floor it simply rendered as a
     glowing cyan floor with the actual room sitting on top of
     it. An edge is made of edges. */
  const plinthMat = keep(new THREE.MeshBasicMaterial({ color: 0x49e8ff }));
  const plinth = new THREE.Group();
  const PW = ROOM.w + 0.3;
  const PD = ROOM.d + 0.3;
  const PZ = ROOM.backZ + ROOM.d / 2;
  for (const [bw, bd, bx, bz] of [
    [PW, 0.035, 0, PZ - PD / 2],
    [PW, 0.035, 0, PZ + PD / 2],
    [0.035, PD, -PW / 2, PZ],
    [0.035, PD, PW / 2, PZ],
  ] as const) {
    const bar = new THREE.Mesh(box(bw, 0.016, bd), plinthMat);
    bar.position.set(bx, 0.004, bz);
    plinth.add(bar);
  }
  root.add(plinth);

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

  /**
   * The void behind the room.
   *
   * Making the wall itself enormous did hide the sky, but a wall
   * that large is lit like a wall, so instead of a dark backdrop
   * the overview filled with a pale grey slab. This is a separate
   * shell: unlit, near-black, built around the same window
   * opening so the view through the glass survives. It is the
   * only thing behind the room from outside, which is what lets
   * the model read as floating in the dark.
   */
  const voidMat = keep(new THREE.MeshBasicMaterial({ color: 0x06050e }));
  const VZ = ROOM.backZ - 0.3;
  const VW = 400;
  const addVoid = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(box(w, h, 0.2), voidMat);
    m.position.set(x, y, VZ);
    root.add(m);
  };
  addVoid(VW, 120 + WIN.y0, 0, WIN.y0 - (120 + WIN.y0) / 2);
  addVoid(VW, 160, 0, WIN.y1 + 80);
  addVoid(VW / 2 + WIN.x0, WIN.y1 - WIN.y0, (-VW / 2 + WIN.x0) / 2, (WIN.y0 + WIN.y1) / 2);
  addVoid(VW / 2 - WIN.x1, WIN.y1 - WIN.y0, (WIN.x1 + VW / 2) / 2, (WIN.y0 + WIN.y1) / 2);

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
  add(rbox(deskW, 0.045, deskD, 0.009), deskMat, 0.1, DESK_Y, DESK_Z);
  for (const lx of [0.1 - deskW / 2 + 0.07, 0.1 + deskW / 2 - 0.07]) {
    for (const lz of [DESK_Z - deskD / 2 + 0.06, DESK_Z + deskD / 2 - 0.06]) {
      add(box(0.05, DESK_Y, 0.05), darkMetal, lx, DESK_Y / 2, lz);
    }
  }
  add(rbox(0.46, 0.6, 0.6, 0.012), deskMat, 1.1, 0.3, DESK_Z);
  for (let i = 0; i < 3; i++) {
    add(box(0.4, 0.015, 0.02), darkMetal, 1.1, 0.12 + i * 0.18, DESK_Z + 0.31);
  }

  /* Bias lighting. Two strips, emissive, feeding the bloom pass:
     one under the front lip of the desk and one behind the
     monitor. This is most of what makes the room read as lit from
     inside rather than only from the window. */
  const ledA = keep(new THREE.MeshBasicMaterial({ color: 0xff2f86 }));
  const ledB = keep(new THREE.MeshBasicMaterial({ color: 0x49e8ff }));
  const underLed = add(box(deskW - 0.3, 0.012, 0.012), ledA, 0.1, DESK_Y - 0.03, DESK_Z + deskD / 2 - 0.01, false, false);
  void underLed;
  const backLed = add(box(1.5, 0.012, 0.012), ledB, 0, DESK_Y + 0.07, ROOM.backZ + 0.08, false, false);
  void backLed;
  const ledGlowA = new THREE.PointLight(0xff2f86, 0.9, 1.8, 2);
  ledGlowA.position.set(0.1, DESK_Y - 0.1, DESK_Z + deskD / 2);
  root.add(ledGlowA);
  const ledGlowB = new THREE.PointLight(0x49e8ff, 0.8, 1.6, 2);
  ledGlowB.position.set(0, DESK_Y + 0.14, ROOM.backZ + 0.2);
  root.add(ledGlowB);

  /* ══ Monitor ═════════════════════════════════════════════ */
  const SCREEN_W = 0.62;
  const SCREEN_H = SCREEN_W * (464 / 780);
  const screenY = DESK_Y + 0.055 + 0.03 + SCREEN_H / 2 + 0.03;
  const screenZ = DESK_Z - 0.19;

  const bodyMat = keep(new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.34, metalness: 0.55 }));
  add(rbox(SCREEN_W + 0.05, SCREEN_H + 0.09, 0.035, 0.008), bodyMat, 0, screenY - 0.015, screenZ - 0.022);
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
  const kb = add(rbox(0.44, 0.015, 0.14, 0.004), plastic, -0.06, DESK_Y + 0.03, DESK_Z + 0.19);
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
  add(rbox(0.11, 0.17, 0.1, 0.008), plastic, 0.72, DESK_Y + 0.11, DESK_Z - 0.08);
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
  const elbow = new THREE.Mesh(keep(new THREE.SphereGeometry(0.022, 14, 12)), brass);
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
  /* Modelled properly in its own module — see atelier-chair.ts.
     The materials come from here so it shares the room's palette
     rather than bringing its own. */
  const hide = keep(
    new THREE.MeshStandardMaterial({
      color: 0x1b1926,
      roughness: 0.42,
      metalness: 0.06,
      map: clothMap,
      roughnessMap: clothRough,
    }),
  );
  const chairAccent = keep(
    new THREE.MeshStandardMaterial({ color: 0xff2f86, roughness: 0.46, metalness: 0.1 }),
  );
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0x3a3844, roughness: 0.26, metalness: 0.88 }));
  const chairGlow = keep(new THREE.MeshBasicMaterial({ color: 0xff2f86, transparent: true, opacity: 0.85 }));
  const built = buildGamingChair(keep, {
    hide,
    accent: chairAccent,
    metal: chrome,
    plastic,
    glow: chairGlow,
  });
  const chair = built.group;
  const chairGlowRing = built.glowRing;
  // Pushed right and turned: dead centre it is a slab between
  // the camera and the one thing you are meant to click.
  chair.position.set(0.88, 0, DESK_Z + 0.95);
  chair.rotation.y = -0.5;
  root.add(chair);
  hitBox(0.6, 1.1, 0.6, "chair", new THREE.Vector3(0.88, 0.6, DESK_Z + 0.95));

  /* ══ Record, vinyl ═══════════════════════════════════════
     The little floating shelf that used to carry this, eleven
     paperbacks and the pothos is gone: the big screen owns the
     left wall from the floor to nearly the ceiling, and the
     shelf was standing inside it. The record and the plant
     moved onto the top of the bookcase instead, which is
     where they would be in a real room anyway. */
  const WALL_X = ROOM.rightX;
  /* The bookcase on the right wall, declared here because its
     top is a surface two other things sit on. */
  const CASE_X = 2.78;
  const CASE_Z = -1.25;
  const CASE_H = 1.95;

  // A record on top of the case, which spins when you look at it.
  const vinyl = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.14, 0.14, 0.006, 40)),
    keep(new THREE.MeshStandardMaterial({ color: 0x121019, roughness: 0.3 })),
  );
  vinyl.position.set(CASE_X + 0.02, CASE_H + 0.155, CASE_Z + 0.52);
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
  p1.rotation.y = -Math.PI / 2;
  p1.position.set(WALL_X - 0.02, 1.8, 1.55);
  root.add(p1);
  posters.push(p1);
  hitBox(0.1, 0.78, 0.58, "poster", p1.position.clone());

  const p2 = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(0.44, 0.34)),
    keep(new THREE.MeshStandardMaterial({ color: 0x2a3f5c, roughness: 0.92 })),
  );
  p2.rotation.y = -Math.PI / 2;
  p2.position.set(WALL_X - 0.02, 2.3, 0.5);
  root.add(p2);
  posters.push(p2);

  /* ══ Neon sign ═══════════════════════════════════════════
     One letter, bent out of glass tube.

     Real neon is a continuous run per colour, so the D is built
     the way a bender would build it: the straight back is one
     tube with rounded caps and the bowl is a half torus meeting
     it top and bottom. Rounded ends matter — a tube cut square
     reads as a stick, and the whole point of neon is that it has
     no ends. */
  const NEON_HUE = 0x2fd0ff;
  const neonSign = new THREE.Group();
  const neonMat = keep(new THREE.MeshBasicMaterial({ color: NEON_HUE }));
  const TUBE = 0.016;
  const LETTER_H = 0.34;

  const stem = new THREE.Mesh(
    keep(new THREE.CapsuleGeometry(TUBE, LETTER_H, 6, 14)),
    neonMat,
  );
  stem.position.set(-0.085, 0, 0);
  neonSign.add(stem);

  const bowl = new THREE.Mesh(
    keep(new THREE.TorusGeometry(LETTER_H / 2, TUBE, 10, 34, Math.PI)),
    neonMat,
  );
  bowl.position.set(-0.085, 0, 0);
  bowl.rotation.z = -Math.PI / 2;
  neonSign.add(bowl);

  /* The bar the tube is clipped to. A sign with nothing behind
     it floats; a sign on a bracket is fixed to a wall. */
  const backBar = new THREE.Mesh(
    keep(new THREE.BoxGeometry(0.3, 0.014, 0.014)),
    keep(new THREE.MeshStandardMaterial({ color: 0x1a1822, roughness: 0.7 })),
  );
  backBar.position.set(-0.02, -LETTER_H / 2 - 0.045, -0.014);
  neonSign.add(backBar);

  /* Over the bookcase on the right wall, which is the corner
     that had no light of its own. */
  neonSign.position.set(ROOM.rightX - 0.07, 2.32, -1.25);
  neonSign.rotation.y = -Math.PI / 2;
  root.add(neonSign);
  hitBox(0.5, 0.6, 0.2, "neon", new THREE.Vector3(ROOM.rightX - 0.12, 2.3, -1.25));

  /* ══ Television ══════════════════════════════════════════
     Wall-mounted on a short bracket and turned toward the room,
     rather than standing on legs facing the back wall where
     nobody could see the picture. The whole set is one group so
     the cabinet, the glass and the CSS3D picture all share the
     same angle. */
  const TV_W = 0.62;
  const TV_H = TV_W * (3 / 4);
  const TV_YAW = 0.92;
  // Back toward the window, to leave the long wall free.
  const TV_ANCHOR = new THREE.Vector3(ROOM.leftX + 0.46, 1.74, -2.05);

  const tvSet = new THREE.Group();
  tvSet.position.copy(TV_ANCHOR);
  tvSet.rotation.y = TV_YAW;

  const tvShell = keep(new THREE.MeshStandardMaterial({ color: 0x594a38, roughness: 0.7, metalness: 0.08 }));
  const tvTrim = keep(new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.42, metalness: 0.35 }));

  const addTo = (g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // Cabinet: a frame around the picture, deeper at the back the
  // way a tube set is.
  addTo(tvSet, rbox(TV_W + 0.18, 0.08, 0.34, 0.016), tvShell, 0, TV_H / 2 + 0.04, -0.1);
  addTo(tvSet, rbox(TV_W + 0.18, 0.08, 0.34, 0.016), tvShell, 0, -TV_H / 2 - 0.04, -0.1);
  addTo(tvSet, rbox(0.09, TV_H, 0.34, 0.016), tvShell, -TV_W / 2 - 0.045, 0, -0.1);
  addTo(tvSet, rbox(0.26, TV_H, 0.34, 0.016), tvShell, TV_W / 2 + 0.13, 0, -0.1);
  addTo(tvSet, box(TV_W + 0.44, TV_H + 0.16, 0.05), tvShell, 0.07, 0, -0.26);
  // The back taper.
  const taper = addTo(tvSet, rbox(TV_W * 0.6, TV_H * 0.6, 0.18, 0.03), tvShell, 0, 0, -0.36);
  void taper;

  // Dials and a speaker grille on the fascia.
  for (let i = 0; i < 3; i++) {
    const d = addTo(tvSet, keep(new THREE.CylinderGeometry(0.028, 0.028, 0.024, 20)), brass, TV_W / 2 + 0.13, 0.11 - i * 0.105, 0.075);
    d.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 5; i++) {
    addTo(tvSet, box(0.17, 0.012, 0.006), tvTrim, TV_W / 2 + 0.13, -0.14 - i * 0.022, 0.075);
  }

  // Bracket back to the wall, so the angle has something holding it.
  const bracket = new THREE.Group();
  bracket.position.copy(TV_ANCHOR);
  const plate = new THREE.Mesh(box(0.05, 0.3, 0.3), darkMetal);
  plate.position.set(ROOM.leftX + 0.03 - TV_ANCHOR.x, 0, 0);
  plate.castShadow = true;
  bracket.add(plate);
  const armBar = new THREE.Mesh(box(0.42, 0.05, 0.05), darkMetal);
  armBar.position.set((ROOM.leftX + 0.05 - TV_ANCHOR.x) / 2, 0, -0.05);
  armBar.castShadow = true;
  bracket.add(armBar);
  root.add(bracket);

  const tvOff = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(TV_W, TV_H)),
    keep(new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.1, metalness: 0.85 })),
  );
  tvOff.position.set(0, 0, 0.072);
  tvSet.add(tvOff);

  const tvGlow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(TV_W, TV_H)),
    keep(new THREE.MeshBasicMaterial({ color: 0x89c8ff, transparent: true, opacity: 0 })),
  );
  tvGlow.position.set(0, 0, 0.068);
  tvSet.add(tvGlow);

  root.add(tvSet);

  // Hit box in world space, matching the set's angle.
  {
    const hm = new THREE.Mesh(
      keep(new THREE.BoxGeometry(TV_W + 0.2, TV_H + 0.2, 0.3)),
      keep(new THREE.MeshBasicMaterial({ visible: false })),
    );
    hm.name = "tv";
    hm.position.copy(TV_ANCHOR);
    hm.rotation.y = TV_YAW;
    root.add(hm);
    targets.push(hm);
  }

  // Where the CSS3D picture goes, in world space.
  const tvScreenPos = new THREE.Vector3(0, 0, 0.076).applyAxisAngle(new THREE.Vector3(0, 1, 0), TV_YAW).add(TV_ANCHOR);

  /* ══ The flat screen ═════════════════════════════════════
     A modern panel on the long wall, facing the sofa — the
     retro set is a thing in the corner you glance at, this is
     the one you sit down in front of. It takes the wall the
     neon used to have, which was the largest blank surface in
     the room.

     A flat television is almost entirely a question of how thin
     you can make the edge, so: a panel barely thicker than its
     own bezel, a slightly deeper box behind the middle where
     the electronics actually live, and a bracket you can see
     under it. */
  /* Two and a half times the first one, which is 3.25m across
     and does not share a wall with anything. Two things moved to
     make room: the retro set slid back into the window corner,
     and the crates came off this wall entirely. A screen this
     size is also high enough off the floor to clear the snake
     plant standing under it. */
  const FLAT_W = 3.25;
  const FLAT_H = (FLAT_W * 9) / 16;
  const FLAT_YAW = Math.PI / 2;
  const FLAT_ANCHOR = new THREE.Vector3(ROOM.leftX + 0.07, 1.85, 0.02);

  const flatSet = new THREE.Group();
  flatSet.position.copy(FLAT_ANCHOR);
  flatSet.rotation.y = FLAT_YAW;

  const flatShell = keep(
    new THREE.MeshStandardMaterial({ color: 0x15151b, roughness: 0.34, metalness: 0.6 }),
  );

  // The bezel, barely proud of the glass.
  addTo(flatSet, rbox(FLAT_W + 0.022, FLAT_H + 0.022, 0.028, 0.006), flatShell, 0, 0, -0.012);
  // The deeper housing, which only covers the middle third.
  addTo(flatSet, rbox(FLAT_W * 0.42, FLAT_H * 0.52, 0.042, 0.01), flatShell, 0, -0.03, -0.045);
  // Wall plate and the short arm down to it.
  addTo(flatSet, box(0.5, 0.42, 0.02), darkMetal, 0, 0, -0.072);

  /* A switched-off screen is not black, it is a mirror of
     whatever is lit in front of it. There is no env map here to
     reflect with and a metalness of 0.9 with nothing to reflect
     renders as a void, so the fire's light is painted on
     instead: the emissive is driven from the hearth each frame,
     which puts a warm wash across the panel that moves as the
     fire moves. */
  const flatOff = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(FLAT_W, FLAT_H)),
    keep(
      new THREE.MeshStandardMaterial({
        color: 0x07080b,
        roughness: 0.22,
        metalness: 0.45,
        emissive: new THREE.Color(0x3a1c08),
        emissiveIntensity: 0,
      }),
    ),
  );
  flatOff.position.set(0, 0, 0.004);
  flatSet.add(flatOff);

  const flatGlow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(FLAT_W, FLAT_H)),
    keep(new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0 })),
  );
  flatGlow.position.set(0, 0, 0.002);
  flatSet.add(flatGlow);

  // Standby lamp, bottom centre, the way every set has one.
  const flatLed = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.008, 8, 6)),
    keep(new THREE.MeshBasicMaterial({ color: 0xff5a4a })),
  );
  flatLed.position.set(0, -FLAT_H / 2 - 0.016, 0.006);
  flatSet.add(flatLed);

  root.add(flatSet);

  {
    const hm = new THREE.Mesh(
      keep(new THREE.BoxGeometry(FLAT_W + 0.1, FLAT_H + 0.1, 0.24)),
      keep(new THREE.MeshBasicMaterial({ visible: false })),
    );
    hm.name = "flat";
    hm.position.copy(FLAT_ANCHOR);
    hm.rotation.y = FLAT_YAW;
    root.add(hm);
    targets.push(hm);
  }

  const flatScreenPos = new THREE.Vector3(0, 0, 0.008)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), FLAT_YAW)
    .add(FLAT_ANCHOR);

  const flatLight = new THREE.PointLight(0x9fd0ff, 0, 3.4, 2);
  flatLight.position.copy(flatScreenPos).add(new THREE.Vector3(0.45, 0, 0));
  root.add(flatLight);

  /* ══ Fireplace media unit ════════════════════════════════
     A long low cabinet under the screen with a linear burner
     cut into it — the thing that actually anchors a wall this
     size. Without it the television floats and the wall below
     it is three metres of nothing.

     The flame is a shader rather than sprites. Fire is the one
     effect where sprites always lose: a real flame is a field
     that rises, pinches and detaches, and it never repeats. The
     fragment shader builds that out of noise scrolling upward
     with the sample point sheared toward the centre, so the
     tongues lean in and narrow as they climb, then takes a
     colour ramp through the hot core. Daniel asked for it to
     change colour, so the ramp's hue drifts on a slow cycle
     that never lands twice in the same place.

     Two details decide whether it reads as fire at all. The
     first is the aspect: the burner is five times wider than
     it is tall, so sampling the noise in UV space stretches
     every tongue into a horizontal smear — the frequency has
     to be scaled back up by that ratio. The second is depth.
     One plane is a sticker from any angle off the normal, so
     there are three, staggered through the firebox at
     different rise rates and seeds, adding together. */
  const FIRE_W = 1.62;
  const FIRE_H = 0.46;
  /* How much wider than tall, which is the factor the noise
     frequency has to be corrected by. */
  const FIRE_AR = FIRE_W / FIRE_H;
  const hearth = new THREE.Group();
  hearth.position.set(ROOM.leftX + 0.22, 0, FLAT_ANCHOR.z);
  hearth.rotation.y = Math.PI / 2;

  const caseMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x191720, roughness: 0.42, metalness: 0.3 }),
  );
  const stoneMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x2b2932, roughness: 0.86, map: wallMap }),
  );

  const UNIT_W = 2.9;
  const UNIT_H = 0.78;
  const UNIT_D = 0.42;
  // Carcass, built as a surround rather than one slab so the
  // burner sits in a recess with a shadow line round it.
  addTo(hearth, rbox(UNIT_W, 0.05, UNIT_D, 0.01), stoneMat, 0, UNIT_H, 0);
  addTo(hearth, rbox(UNIT_W, 0.07, UNIT_D, 0.01), caseMat, 0, 0.035, 0);
  addTo(hearth, box(UNIT_W, UNIT_H, 0.04), caseMat, 0, UNIT_H / 2, -UNIT_D / 2 + 0.02);
  for (const sx of [-1, 1]) {
    addTo(hearth, rbox((UNIT_W - FIRE_W) / 2, UNIT_H - 0.07, UNIT_D, 0.012), caseMat,
      sx * (FIRE_W + (UNIT_W - FIRE_W) / 2) / 2, UNIT_H / 2, 0);
  }
  addTo(hearth, rbox(FIRE_W, UNIT_H - FIRE_H - 0.11, UNIT_D, 0.01), caseMat,
    0, UNIT_H - (UNIT_H - FIRE_H - 0.11) / 2 - 0.02, 0);

  /* The firebox. Dark, but lit — a MeshBasic void behind the
     flame takes none of its light and reads as a hole cut in
     the wall. A rough dark metal catches the point light in
     front of it and gives the fire something to sit against. */
  const boxMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x1c1310, roughness: 0.62, metalness: 0.45 }),
  );
  addTo(hearth, box(FIRE_W, FIRE_H + 0.02, 0.02), boxMat, 0, 0.1 + FIRE_H / 2, -0.1);

  const FIRE_VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const FIRE_FRAG = `
    uniform float uTime; uniform float uHue; uniform float uLevel;
    uniform float uSeed; uniform float uRise; uniform float uGain; uniform float uAR;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.55;
      for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = vUv;
      // Shear toward the middle as it rises: a flame narrows
      // and leans in, it does not go straight up.
      float lean = (uv.x - 0.5) * uv.y * 1.3;
      /* uAR is the plane's width over its height. Without it the
         noise cells are as wide as the burner and every tongue
         comes out as a horizontal streak. */
      float fx = (uv.x - lean) * 1.7 * uAR + uSeed;
      vec2 p = vec2(fx, uv.y * 1.7 - uTime * uRise);

      float n = fbm(p) * 0.62 + fbm(p * 2.1 + 17.0) * 0.38;
      /* Each column breathes on its own clock, which is what
         makes tongues pinch off instead of the whole sheet
         going up and down together. */
      float col1 = vnoise(vec2(uv.x * 9.0 + uSeed, uTime * 0.85));
      n *= 0.5 + 0.75 * col1;

      // Wide at the bed, narrow at the tip.
      float taper = 1.0 - smoothstep(0.15, 1.15, uv.y);
      float sides = smoothstep(0.5, 0.2, abs(uv.x - 0.5));
      float body = n * taper * sides * uLevel * 1.95;
      body -= uv.y * 0.42;
      /* Deliberately short of saturation over most of the
         sheet. Three of these add together and the bloom pass
         threshold is 0.82, so a flame that reaches 1.0
         everywhere floods the whole room with haze. Only the
         hottest cores are meant to cross it. */
      float f = smoothstep(0.12, 1.0, body);
      if (f <= 0.002) discard;

      /* Hot core to cool tip, with the whole ramp drifting
         round the wheel so it is never the same fire twice. */
      float h = fract(uHue);
      vec3 deep = vec3(0.62, 0.08, 0.02);
      vec3 mid  = vec3(1.0, 0.45, 0.06);
      vec3 hot  = vec3(1.0, 0.82, 0.42);
      vec3 tint = vec3(
        0.5 + 0.5 * cos(6.2831 * (h + 0.0)),
        0.5 + 0.5 * cos(6.2831 * (h + 0.33)),
        0.5 + 0.5 * cos(6.2831 * (h + 0.66))
      );
      vec3 c = mix(deep, mid, smoothstep(0.1, 0.5, f));
      c = mix(c, hot, smoothstep(0.62, 1.0, f));
      // Only the cooler part takes the colour; the core stays
      // white-hot, which is what keeps it reading as fire.
      c = mix(c, c * 0.55 + tint * 0.7, (1.0 - smoothstep(0.45, 0.92, f)) * 0.5);
      gl_FragColor = vec4(c, f * uGain);
    }
  `;

  /* Three sheets staggered through the depth of the firebox,
     each with its own seed and rise rate. Additive, so where
     they overlap the core goes white and where only one
     reaches, the tip stays thin. */
  const fireMats: THREE.ShaderMaterial[] = [];
  const FIRE_LAYERS: Array<[seed: number, rise: number, z: number, gain: number, w: number]> = [
    [0.0, 1.05, -0.07, 0.34, 1.0],
    [23.7, 1.5, -0.025, 0.52, 0.97],
    [51.3, 1.95, 0.025, 0.3, 0.9],
  ];
  for (const [seed, rise, fz, gain, wScale] of FIRE_LAYERS) {
    const m = keep(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: FIRE_VERT,
        fragmentShader: FIRE_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uHue: { value: 0 },
          uLevel: { value: 1 },
          uSeed: { value: seed },
          uRise: { value: rise },
          uGain: { value: gain },
          uAR: { value: FIRE_AR },
        },
      }),
    );
    fireMats.push(m);
    const sheet = new THREE.Mesh(
      keep(new THREE.PlaneGeometry((FIRE_W - 0.06) * wScale, FIRE_H)),
      m,
    );
    sheet.position.set(0, 0.105 + FIRE_H / 2, fz);
    sheet.renderOrder = 4;
    hearth.add(sheet);
  }

  /* ── The bed ──────────────────────────────────────────────
     Cold, dark lumps of glass media, lit only by what is above
     them, with a separate additive layer of coals breathing
     underneath. A fire bed that does not have its own slow
     pulse reads as a painted strip however good the flame is. */
  const mediaMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.35, metalness: 0.1 }),
  );
  {
    const rb = rand(911);
    // Four shapes, scaled — not forty-six geometries.
    const shapes = [0, 1, 2, 3].map(() => keep(new THREE.DodecahedronGeometry(1, 0)));
    for (let i = 0; i < 46; i++) {
      const sz = 0.022 + rb() * 0.028;
      const lump = new THREE.Mesh(shapes[i & 3], mediaMat);
      lump.scale.set(sz, sz * 0.7, sz);
      lump.position.set(
        (rb() - 0.5) * (FIRE_W - 0.14),
        0.102 + rb() * 0.016,
        -0.06 + (rb() - 0.5) * 0.11,
      );
      lump.rotation.set(rb() * 3, rb() * 3, rb() * 3);
      hearth.add(lump);
    }
  }

  /* Coals. Same noise machinery as the flame, but squat and
     almost static — it glows through the gaps in the media
     rather than rising. */
  const coalMat = keep(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uLevel: { value: 1 } },
      vertexShader: FIRE_VERT,
      fragmentShader: `
        uniform float uTime; uniform float uLevel;
        varying vec2 vUv;
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i), b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        void main() {
          vec2 uv = vUv;
          /* Barely moving. Coals brighten and dim in patches;
             they do not flow. */
          float n = vnoise(vec2(uv.x * 26.0, uv.y * 4.0 + uTime * 0.07));
          n = n * 0.7 + vnoise(vec2(uv.x * 61.0 + 9.0, uv.y * 7.0 - uTime * 0.05)) * 0.3;
          float breathe = 0.72 + 0.28 * sin(uTime * 0.6 + uv.x * 9.0);
          float edge = smoothstep(0.0, 0.3, uv.y) * smoothstep(1.0, 0.72, uv.y)
                     * smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x);
          float f = smoothstep(0.42, 0.95, n * breathe) * edge * uLevel;
          if (f <= 0.002) discard;
          vec3 c = mix(vec3(0.5, 0.06, 0.01), vec3(1.0, 0.46, 0.1), smoothstep(0.1, 0.9, f));
          gl_FragColor = vec4(c, f * 0.55);
        }
      `,
    }),
  );
  {
    const coals = new THREE.Mesh(keep(new THREE.PlaneGeometry(FIRE_W - 0.1, 0.17)), coalMat);
    /* Tilted toward the opening rather than flat. A fire bed
       lying dead level is edge-on from anywhere you would
       actually stand. */
    coals.rotation.x = -1.12;
    coals.position.set(0, 0.122, -0.045);
    coals.renderOrder = 3;
    hearth.add(coals);
  }

  /* ── Sparks ───────────────────────────────────────────────
     Two dozen embers lifting off the bed and going out. They do
     more for the realism than another flame sheet would: fire
     is a thing that throws pieces of itself upward, and nothing
     static ever looks like one. */
  const sparkMat = keep(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uLevel: { value: 1 } },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime; uniform float uLevel;
        varying float vFade;
        void main() {
          float sp = 0.1 + aSeed * 0.13;
          float life = fract(uTime * sp + aSeed * 7.13);
          vec3 p = position;
          p.y += life * (0.3 + aSeed * 0.5);
          // Sideways wander that grows as it loses its heat.
          p.x += sin(life * 7.0 + aSeed * 31.0) * 0.09 * life;
          p.z += cos(life * 5.3 + aSeed * 17.0) * 0.03 * life;
          /* Up fast, out slow — and the whole thing scaled by
             how hard the fire is burning, so blowing it out
             takes the sparks with it. */
          vFade = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.25, 1.0, life)) * uLevel;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.4 + aSeed * 2.2) * (10.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vFade;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.05, length(d));
          gl_FragColor = vec4(vec3(1.0, 0.56, 0.16), a * vFade * 0.9);
        }
      `,
    }),
  );
  {
    const N = 26;
    const sp = new Float32Array(N * 3);
    const ss = new Float32Array(N);
    const rs = rand(337);
    for (let i = 0; i < N; i++) {
      sp[i * 3] = (rs() - 0.5) * (FIRE_W - 0.2);
      sp[i * 3 + 1] = 0.12;
      sp[i * 3 + 2] = -0.05 + (rs() - 0.5) * 0.06;
      ss[i] = rs();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(ss, 1));
    keep(g);
    const pts = new THREE.Points(g, sparkMat);
    pts.renderOrder = 5;
    hearth.add(pts);
  }


  /* No glass pane across the opening. A transmissive material
     is rendered from a backbuffer of the opaque scene only, so
     everything additive behind it — which is the entire flame —
     disappears into it. A slim metal reveal round the opening
     does the same job of making it look like a fitted unit and
     costs nothing per frame. */
  const trimMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x3a3542, roughness: 0.3, metalness: 0.75 }),
  );
  for (const sy of [-1, 1]) {
    addTo(hearth, box(FIRE_W + 0.05, 0.022, 0.03), trimMat,
      0, 0.1 + FIRE_H / 2 + sy * (FIRE_H / 2 + 0.011), 0.205);
  }
  for (const sx of [-1, 1]) {
    addTo(hearth, box(0.022, FIRE_H + 0.05, 0.03), trimMat,
      sx * (FIRE_W / 2 + 0.011), 0.1 + FIRE_H / 2, 0.205);
  }

  const fireLight = new THREE.PointLight(0xff7a2a, 0, 3.0, 2);
  fireLight.position.set(ROOM.leftX + 0.5, 0.42, FLAT_ANCHOR.z);
  root.add(fireLight);

  /* ── What lives on top of it ──────────────────────────────
     An empty 2.9m slab under a television is a plinth, not
     furniture. A candle at one end, a short stack of books at
     the other, a dish between them: the things that are
     actually on a media unit in a room somebody uses. */

  // Candle. Wax body, a dark wick, and a real flame.
  const waxMat = keep(
    new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.72, emissive: 0x3a2410, emissiveIntensity: 0.5 }),
  );
  /* The hearth group is turned a quarter turn, so its local x
     runs along the 2.9m length of the unit and its local z is
     the 0.42m depth. Everything placed on top is positioned in
     those axes, not world ones. */
  const CANDLE_X = 1.02;
  const CANDLE_Y = UNIT_H + 0.075;
  addTo(hearth, keep(new THREE.CylinderGeometry(0.052, 0.055, 0.15, 20)), waxMat, CANDLE_X, CANDLE_Y, 0.02);
  addTo(hearth, keep(new THREE.CylinderGeometry(0.054, 0.054, 0.006, 20)),
    keep(new THREE.MeshStandardMaterial({ color: 0x1a1218, roughness: 0.9 })),
    CANDLE_X, CANDLE_Y + 0.075, 0.02);

  /* The flame is the same shader as the fire, handed a tall
     narrow aspect instead of a wide one — which is the whole
     difference between a hearth and a candle. */
  const candleMat = keep(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: FIRE_VERT,
      fragmentShader: FIRE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uHue: { value: 0.04 },
        uLevel: { value: 1 },
        uSeed: { value: 88.2 },
        uRise: { value: 0.75 },
        uGain: { value: 0.8 },
        uAR: { value: 0.42 },
      },
    }),
  );
  {
    const cf = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.055, 0.1)), candleMat);
    cf.position.set(CANDLE_X, CANDLE_Y + 0.128, 0.02);
    cf.renderOrder = 5;
    hearth.add(cf);
  }
  const candleLight = new THREE.PointLight(0xffb15e, 0, 1.5, 2);
  candleLight.position.set(ROOM.leftX + 0.4, CANDLE_Y + 0.14, FLAT_ANCHOR.z - CANDLE_X);
  root.add(candleLight);

  // A stack of books, lying flat, each one a little out of true.
  {
    const rk = rand(1207);
    let by = UNIT_H + 0.02;
    for (let i = 0; i < 4; i++) {
      const th = 0.028 + rk() * 0.018;
      const bk = new THREE.Mesh(box(0.2 - i * 0.008, th, 0.15 - i * 0.006), bookFaces(rk));
      bk.position.set(-1.02 + (rk() - 0.5) * 0.02, by + th / 2, (rk() - 0.5) * 0.03);
      bk.rotation.y = (rk() - 0.5) * 0.22;
      bk.castShadow = true;
      hearth.add(bk);
      by += th + 0.002;
    }
    // A shallow dish, because flat surfaces collect small things.
    addTo(hearth, keep(new THREE.CylinderGeometry(0.075, 0.055, 0.035, 20, 1, true)),
      keep(new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.62, side: THREE.DoubleSide })),
      -0.42, UNIT_H + 0.018, 0.0);
  }

  /* A warm strip tucked under the plinth, washing the floor.
     The desk corner already speaks in LED strips; the living
     half had none, which is most of why it read as the unlit
     end of the room. */
  addTo(hearth, box(UNIT_W - 0.3, 0.012, 0.02),
    keep(new THREE.MeshBasicMaterial({ color: 0xff9a4e })), 0, 0.012, 0.19);
  const hearthWash = new THREE.PointLight(0xff8a44, 0.5, 1.9, 2);
  hearthWash.position.set(ROOM.leftX + 0.45, 0.07, FLAT_ANCHOR.z);
  root.add(hearthWash);

  root.add(hearth);
  hitBox(0.5, 0.8, 2.9, "hearth", new THREE.Vector3(ROOM.leftX + 0.25, 0.38, FLAT_ANCHOR.z));

  /* ══ Living half ═════════════════════════════════════════
     The room had one occupied corner and three empty walls,
     which is why it read as a diorama of a desk rather than
     somewhere anyone lives. Everything below is built from the
     same primitives and designed here — no borrowed forms. */

  /* Teal, deliberately. The room had gone monochrome purple and
     upholstery is the largest single surface available to argue
     with it. */
  const fabric = keep(
    new THREE.MeshStandardMaterial({
      color: 0x2f5f64,
      roughness: 0.96,
      map: clothMap,
      roughnessMap: clothRough,
    }),
  );
  const fabricB = keep(
    new THREE.MeshStandardMaterial({
      color: 0x3d7a7e,
      roughness: 0.96,
      map: clothMap,
      roughnessMap: clothRough,
    }),
  );
  const paleWood = keep(
    new THREE.MeshStandardMaterial({
      color: 0xa07d55,
      roughness: 0.58,
      map: woodMap,
      roughnessMap: woodRough,
    }),
  );


  /* Sofa, back to the right wall, facing into the room. */
  const sofa = new THREE.Group();
  {
    const baseM = new THREE.Mesh(rbox(0.9, 0.26, 1.9, 0.04), fabric);
    baseM.position.y = 0.26;
    baseM.castShadow = true;
    baseM.receiveShadow = true;
    sofa.add(baseM);
    const backM = new THREE.Mesh(rbox(0.22, 0.52, 1.9, 0.05), fabric);
    backM.position.set(0.34, 0.5, 0);
    backM.castShadow = true;
    sofa.add(backM);
    for (const az of [-0.86, 0.86]) {
      const arm = new THREE.Mesh(rbox(0.9, 0.2, 0.18, 0.055), fabricB);
      arm.position.set(0, 0.48, az);
      arm.castShadow = true;
      sofa.add(arm);
    }
    for (const cz of [-0.46, 0.46]) {
      const cushion = new THREE.Mesh(rbox(0.84, 0.14, 0.82, 0.05), fabricB);
      cushion.position.set(-0.02, 0.45, cz);
      cushion.castShadow = true;
      sofa.add(cushion);
    }
    // Throw cushions, tipped over as they always are.
    const cols = [0xff6f9d, 0x49e8ff, 0xf0c05a];
    cols.forEach((c, i) => {
      const m = keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
      const cu = new THREE.Mesh(rbox(0.3, 0.3, 0.1, 0.045), m);
      cu.position.set(0.12, 0.66, -0.62 + i * 0.6);
      cu.rotation.x = 0.4 + i * 0.2;
      cu.castShadow = true;
      sofa.add(cu);
    });
    /* A throw over the near arm.
       The arm is 0.9 along x, 0.2 tall, 0.18 deep, with its top
       at y 0.58. So: a panel lying across it, a short fall down
       the outside, a longer one down the inside, and a tail
       pooling on the seat. Four thin slabs rather than cloth
       simulation — from any angle you can stand at, that is
       what a thrown blanket looks like. */
    {
      const throwMat = keep(
        new THREE.MeshStandardMaterial({ color: 0xb8683f, roughness: 0.97 }),
      );
      const AZ = 0.86;
      const drape: Array<[number, number, number, number, number, number]> = [
        // w, h, d, x, y, z
        [0.44, 0.035, 0.235, 0.12, 0.596, AZ],
        [0.42, 0.24, 0.03, 0.12, 0.47, AZ + 0.105],
        [0.42, 0.33, 0.03, 0.12, 0.43, AZ - 0.105],
        [0.4, 0.035, 0.2, 0.1, 0.535, AZ - 0.26],
      ];
      for (const [w, hh, d, x, y, z] of drape) {
        const panel = new THREE.Mesh(rbox(w, hh, d, 0.014), throwMat);
        panel.position.set(x, y, z);
        panel.castShadow = true;
        sofa.add(panel);
      }
    }

    for (const lz of [-0.78, 0.78]) {
      for (const lx of [-0.34, 0.34]) {
        const leg = new THREE.Mesh(box(0.06, 0.14, 0.06), darkMetal);
        leg.position.set(lx, 0.07, lz);
        sofa.add(leg);
      }
    }
    /* The same strip under the sofa, so the floor between the
       two of them is lit from both ends rather than being the
       dead middle of the room. */
    const glow = new THREE.Mesh(
      box(0.02, 0.012, 1.7),
      keep(new THREE.MeshBasicMaterial({ color: 0xff9a4e })),
    );
    glow.position.set(-0.3, 0.025, 0);
    sofa.add(glow);

    sofa.position.set(2.2, 0, 0.5);
    root.add(sofa);
    const sofaWash = new THREE.PointLight(0xff8a44, 0.45, 2.1, 2);
    sofaWash.position.set(1.8, 0.1, 0.5);
    root.add(sofaWash);
    hitBox(1.1, 0.9, 2.1, "sofa", new THREE.Vector3(2.2, 0.45, 0.5));
  }

  /* Shelving against the right wall, behind the sofa. This is
     the one the library opens from — it stays. */
  {
    const shelfUnit = new THREE.Group();
    const H = CASE_H;
    const WD = 1.6;
    for (const uz of [-WD / 2, WD / 2]) {
      const upright = new THREE.Mesh(rbox(0.33, H, 0.05, 0.008), paleWood);
      upright.position.set(0, H / 2, uz);
      upright.castShadow = true;
      shelfUnit.add(upright);
    }
    const rS = rand(601);
    for (let i = 0; i < 5; i++) {
      const y = 0.18 + i * 0.42;
      const plank = new THREE.Mesh(rbox(0.33, 0.035, WD, 0.007), paleWood);
      plank.position.y = y;
      plank.castShadow = true;
      plank.receiveShadow = true;
      shelfUnit.add(plank);

      // What is on the shelf: books, a box, sometimes a bowl.
      let z = -WD / 2 + 0.12;
      while (z < WD / 2 - 0.16) {
        const roll = rS();
        if (roll < 0.55) {
          const n = 3 + Math.floor(rS() * 6);
          for (let k = 0; k < n && z < WD / 2 - 0.12; k++) {
            const bh = 0.17 + rS() * 0.13;
            // Fatter, so each one gets more pixels to show itself in.
            const thick = 0.038 + rS() * 0.03;
            /* The spine is the -x face: the shelf stands against
               the right wall, so that is the one pointing into
               the room. Only that face gets the printed slice;
               the rest is the page block and the boards. */
            const bk = new THREE.Mesh(box(0.16, bh, thick), bookFaces(rS));
            bk.position.set(0, y + 0.018 + bh / 2, z);
            // Nothing on a real shelf is perfectly upright.
            bk.rotation.x = (rS() - 0.5) * 0.03;
            bk.castShadow = true;
            shelfUnit.add(bk);
            z += thick + 0.004;
          }
          z += 0.07;
        } else if (roll < 0.8) {
          const bx = new THREE.Mesh(
            box(0.24, 0.18, 0.3),
            keep(new THREE.MeshStandardMaterial({ color: 0x6a5f7f, roughness: 0.9 })),
          );
          bx.position.set(0, y + 0.108, z + 0.15);
          bx.castShadow = true;
          shelfUnit.add(bx);
          z += 0.4;
        } else {
          const bowl = new THREE.Mesh(
            keep(new THREE.CylinderGeometry(0.09, 0.06, 0.09, 18, 1, true)),
            keep(new THREE.MeshStandardMaterial({ color: 0xc08a5a, roughness: 0.5, side: THREE.DoubleSide })),
          );
          bowl.position.set(0, y + 0.063, z + 0.11);
          shelfUnit.add(bowl);
          z += 0.3;
        }
      }
    }
    /* A cap across the top. It used to end on the uprights,
       which left nowhere to put anything — and the record and
       the pothos now live up here. */
    const cap = new THREE.Mesh(rbox(0.36, 0.04, WD + 0.06, 0.008), paleWood);
    cap.position.y = H + 0.02;
    cap.castShadow = true;
    cap.receiveShadow = true;
    shelfUnit.add(cap);

    shelfUnit.position.set(CASE_X, 0, CASE_Z);
    root.add(shelfUnit);
    hitBox(0.5, 2, 1.7, "shelf", new THREE.Vector3(CASE_X, 1, CASE_Z));
  }

  /* Coffee table, with the things that live on one. */
  {
    const top = add(rbox(0.62, 0.04, 1.0, 0.009), paleWood, 1.0, 0.38, 0.62);
    void top;
    for (const lz of [0.24, 1.0]) {
      for (const lx of [0.78, 1.22]) {
        add(box(0.05, 0.38, 0.05), darkMetal, lx, 0.19, lz);
      }
    }
    // A tray, two cups and a short stack of magazines.
    add(box(0.3, 0.02, 0.22), keep(new THREE.MeshStandardMaterial({ color: 0x2a2436, roughness: 0.6 })), 1.0, 0.41, 0.4);
    for (const cz of [0.34, 0.46]) {
      add(keep(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 18)), keep(new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.3 })), 0.96, 0.46, cz);
    }
    [0xb4476a, 0x3f6ea8, 0xd8a53a].forEach((c, i) => {
      const mag = add(
        box(0.26, 0.012, 0.34),
        keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })),
        1.02,
        0.41 + i * 0.014,
        0.88,
      );
      mag.rotation.y = (i - 1) * 0.12;
    });
    hitBox(0.8, 0.5, 1.1, "table", new THREE.Vector3(1.0, 0.3, 0.62));
  }

  /* Floor lamp in the corner behind the sofa. */
  {
    const lampG = new THREE.Group();
    const foot = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 24)), darkMetal);
    foot.castShadow = true;
    lampG.add(foot);
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 12)), darkMetal);
    pole.position.y = 0.76;
    pole.castShadow = true;
    lampG.add(pole);
    /* A pale shade lit from the inside at point-blank range, with
       a bloom pass on top, is not a lamp — it is a white hole in
       the middle of the room. The shade is dark and single-sided
       so you never see its lit interior, and the light is a spot
       pointing at the floor, which is what a shade is for. */
    const dome = new THREE.Mesh(
      keep(new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
      keep(new THREE.MeshStandardMaterial({ color: 0x332f42, roughness: 0.55, metalness: 0.3 })),
    );
    dome.rotation.x = Math.PI;
    dome.position.y = 1.52;
    dome.castShadow = true;
    lampG.add(dome);

    /* The shade is dark from outside, which is right, but it
       left no sign the lamp was on at all from across the room.
       A disc of light across its mouth fixes that without
       turning the shade itself into a white hole. */
    const mouth = new THREE.Mesh(
      keep(new THREE.CircleGeometry(0.175, 24)),
      /* Dim. A full-brightness disc under a bloom pass is a
         flare, not a lamp — this only has to say "lit". */
      keep(new THREE.MeshBasicMaterial({ color: 0x6b3f1c })),
    );
    mouth.rotation.x = Math.PI / 2;
    mouth.position.y = 1.515;
    lampG.add(mouth);

    const warm = new THREE.SpotLight(0xffc98a, 2.4, 3.6, 0.9, 0.7, 1.4);
    warm.position.set(0, 1.42, 0);
    warm.target.position.set(0, 0, 0.15);
    lampG.add(warm);
    lampG.add(warm.target);
    lampG.position.set(2.62, 0, 1.75);
    root.add(lampG);
    hitBox(0.44, 1.7, 0.44, "floorlamp", new THREE.Vector3(2.62, 0.85, 1.75));
  }

  /* Crates by the left wall, and a board leaning on them. */
  {
    const crateMat = keep(new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 0.92, map: woodMap }));
    /* Moved forward off the screen wall — a metre of stacked
       crates in front of a 3.25m television is a metre of
       television you cannot see. */
    const stack = [
      [0.46, 0.34, 0.4, -2.5, 0.17, 1.95, 0.1],
      [0.42, 0.3, 0.38, -2.46, 0.49, 1.89, -0.18],
      [0.3, 0.24, 0.3, -2.56, 0.76, 2.01, 0.3],
    ] as const;
    for (const [cw, ch, cd, cx2, cy2, cz2, rot] of stack) {
      const c = add(rbox(cw, ch, cd, 0.012), crateMat, cx2, cy2, cz2);
      c.rotation.y = rot;
    }
    const board = add(box(0.22, 0.9, 0.035), keep(new THREE.MeshStandardMaterial({ color: 0x2f3a58, roughness: 0.6 })), -2.82, 0.45, 1.52);
    board.rotation.z = 0.16;
    board.rotation.y = 0.5;
    hitBox(0.7, 1.1, 0.7, "crates", new THREE.Vector3(-2.45, 0.5, 1.95));
  }

  /* A pouffe, because the floor needs something soft on it. */
  {
    const pouf = add(keep(new THREE.SphereGeometry(0.26, 20, 14)), fabricB, 0.2, 0.19, 1.25);
    pouf.scale.set(1, 0.72, 1);
  }

  /* A second rug under the sitting half. */
  {
    const rug2 = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(1.9, 2.4)),
      keep(new THREE.MeshStandardMaterial({ color: 0x2c2440, roughness: 0.98 })),
    );
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(1.5, 0.003, 0.7);
    rug2.receiveShadow = true;
    root.add(rug2);
  }

  /* A cluster of small frames, above the sofa on the right wall.
     Abstract colour fields of their own — nothing reproduced. */
  {
    const frames: Array<[number, number, number, number, number]> = [
      [0.3, 0.22, 1.62, 0.42, 0x4a6f8a],
      [0.22, 0.3, 1.95, 0.24, 0x8a4a6f],
      [0.26, 0.2, 1.42, 0.78, 0x6f8a4a],
    ];
    for (const [fwid, fhgt, fy, fz, col] of frames) {
      const fr = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(fwid, fhgt)),
        keep(new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, emissive: col, emissiveIntensity: 0.12 })),
      );
      fr.rotation.y = -Math.PI / 2;
      fr.position.set(WALL_X - 0.02, fy, fz);
      root.add(fr);
    }
  }

  /* Wastebasket under the desk, and a cable reaching the wall. */
  {
    const bin = add(
      keep(new THREE.CylinderGeometry(0.11, 0.09, 0.26, 18, 1, true)),
      keep(new THREE.MeshStandardMaterial({ color: 0x2a2634, roughness: 0.6, side: THREE.DoubleSide })),
      -0.95,
      0.13,
      DESK_Z + 0.1,
    );
    void bin;
  }

  /* ══ Outside ═════════════════════════════════════════════ */
  const outside = new THREE.Group();

  /**
   * What is outside the window.
   *
   * Ten scenes, all generated in the shader rather than fetched
   * as images — same reason as everything else here, and it means
   * each one animates and none of them cost a download.
   *
   * The window is a small aperture onto a plane a long way back,
   * so only a sliver of the plane is ever visible through it.
   * uZoom pulls the scene's coordinates in to match that sliver,
   * which is what lets a horizon land where a horizon should
   * rather than somewhere off past the frame.
   */
  const skyMat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x07061a) },
      uMid: { value: new THREE.Color(0x241048) },
      uBot: { value: new THREE.Color(0x6d1f5c) },
      uStars: { value: 1 },
      uTime: { value: 0 },
      uScene: { value: 0 },
      uZoom: { value: 7.0 },
      uMode: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      varying vec2 vUv;
      void main() {
        vDir = normalize(position);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot;
      uniform float uStars; uniform float uTime;
      uniform float uScene; uniform float uZoom; uniform float uMode;
      varying vec3 vDir;
      varying vec2 vUv;

      // The pane's own proportions, for anything that has to
      // come out round on it.
      const float PANE_A = 13.0 / 5.6;

      // ALU-only hash. A sin-based one costs a transcendental per
      // sample, which a phone notices.
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float hash11(float x) { return fract(sin(x * 91.3458) * 47453.5453); }

      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      /**
       * Stars, the way the globe on the home page draws them.
       *
       * A star used to be a step() threshold on a 300x200 grid
       * — a single hard pixel, every one the same size and the
       * same colour, which at any zoom reads as grid noise rather
       * than as a sky.
       *
       * This places one jittered point per cell and gives it a
       * smooth core, a magnitude and a tint, which is what the
       * home page's point sprites do. The cool/warm scatter is
       * the part that matters most: a field of identical white
       * dots looks printed on.
       *
       * Neighbouring cells are sampled too, or a star sitting near
       * a cell edge gets cut in half by it.
       */
      vec3 starField(vec2 uv, float scale, float density, float sizeMul, float seed, float time) {
        /* The pane is a good deal wider than it is tall, and its
           uv runs 0..1 on both axes, so a square grid in uv space
           is a stretched grid in the world — which came out as a
           sky full of horizontal ovals. PANE_A squares the cells
           up again. */
        vec2 g = vec2(uv.x * PANE_A, uv.y) * scale;
        vec2 id = floor(g);
        vec2 f = fract(g);
        vec3 acc = vec3(0.0);
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 cid = id + o;
            float h = hash21(cid + seed);
            if (h > density) continue;
            vec2 at = o + vec2(hash21(cid + seed + 11.7), hash21(cid + seed + 27.3));
            float mag = hash21(cid + seed + 53.1);
            float r = length(f - at);
            // Most stars faint and small, a few bright and wide.
            float size = (0.035 + pow(mag, 3.0) * 0.30) * sizeMul;
            float core = smoothstep(size, 0.0, r);
            float tw = 0.70 + 0.30 * sin(time * 1.6 + mag * 41.0);
            vec3 tint = mix(vec3(0.72, 0.80, 1.00), vec3(1.00, 0.93, 0.82), fract(mag * 7.3));
            acc += tint * core * core * tw * (0.25 + mag * 0.95);
          }
        }
        return acc;
      }

      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.02; a *= 0.5; }
        return v;
      }

      /* A ridgeline: one value per column, used as a horizon. */
      float ridge(float x, float seed, float amp, float base) {
        return base + amp * (fbm(vec2(x * 2.2 + seed * 11.0, seed)) - 0.5);
      }

      void main() {
        /**
         * Angles, not texture coordinates.
         *
         * This was a flat plane a long way back, and the window is
         * a small aperture onto it — so each camera angle looked at
         * a different patch of it, and the patch the overview found
         * was far below every scene's horizon. Every vista came out
         * as the colour of the ground.
         *
         * On a dome the horizon is an elevation rather than a
         * texture row, so it sits where a horizon belongs from any
         * angle, and moving the camera pans across the view the way
         * looking out of a window actually does.
         */
        /**
         * Two mountings, one shader.
         *
         * On the dome the coordinates come from the viewing angle,
         * which is right for a sky but means the scene's horizon
         * lands wherever the camera happens to be pointing — and
         * through a window the size of this one, that was reliably
         * somewhere underground.
         *
         * The vistas therefore live on a panel directly behind the
         * glass and use its own surface coordinates, so the horizon
         * is always across the middle of the window no matter where
         * you are standing. The dome keeps the sky for the city,
         * where the skyline is real geometry a long way back.
         */
        vec2 uv;
        if (uMode > 0.5) {
          uv = vUv;
        } else {
          float el = asin(clamp(vDir.y, -1.0, 1.0));
          uv = vec2(atan(vDir.z, vDir.x) / 6.2831853 + 0.5, el / 1.5707963 * 0.5 + 0.5);
        }
        float h = uv.y;
        vec3 col = mix(uBot, uMid, smoothstep(0.42, 0.62, h));
        col = mix(col, uTop, smoothstep(0.6, 1.0, h));

        float s = uScene;

        /**
         * 0 — CITY.
         *
         * Painted, like the other nine, and it has to be. The
         * skyline used to be real geometry out past the glass,
         * which looks superb from a chair at the desk and falls
         * apart the moment the camera lifts: from up there the
         * line of sight through the window passes under the
         * towers entirely — thirty metres out it is already five
         * metres below their bases — so the window filled with
         * bare horizon. A view on the pane is framed the same way
         * from everywhere in the room.
         */
        if (s < 0.5) {
          // Only above the skyline, and thinner near it.
          float sky = smoothstep(0.52, 0.82, h);
          col += starField(uv, 46.0, 0.30, 1.0, 3.0, uTime) * sky * uStars * 0.9;
          col += starField(uv, 92.0, 0.22, 0.7, 61.0, uTime) * sky * uStars * 0.5;

          // Moon.
          float moon = smoothstep(0.022, 0.0, length((uv - vec2(0.76, 0.72)) * vec2(PANE_A, 1.0)));
          col += vec3(0.86, 0.9, 1.0) * moon * 1.1 * uStars;

          // Three ranks of towers, nearest last and darkest.
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            // Far rank many and small, near rank few and wide.
            float cols = 13.0 - fi * 4.0;
            float gx = uv.x * cols;
            float id = floor(gx);
            float fx = fract(gx);
            float top = 0.5 + (0.05 + fi * 0.09) * (0.3 + hash11(id + fi * 23.0) * 1.4);
            if (fx > 0.08 && fx < 0.92 && h < top) {
              vec3 slab = mix(vec3(0.13, 0.12, 0.22), vec3(0.03, 0.03, 0.07), fi / 2.0);
              col = slab;
              // Lit windows, on a grid, most of them out.
              vec2 wcell = vec2(floor(fx * (2.0 + fi)), floor((top - h) * (62.0 - fi * 13.0)));
              float wh = hash21(wcell + id * 17.0 + fi * 101.0);
              if (wh > 0.68) {
                vec3 warm = wh > 0.93 ? vec3(0.62, 0.86, 1.0) : vec3(1.0, 0.78, 0.45);
                col += warm * (0.42 + 0.38 * step(0.7, hash11(floor(uTime * 0.4) + wh * 50.0))) * (0.62 - fi * 0.14);
              }
              // Roof beacon on some of them.
              if (hash11(id + fi * 7.0) > 0.72 && abs(h - top) < 0.004 && abs(fx - 0.5) < 0.08) {
                col += vec3(1.0, 0.2, 0.2) * (0.4 + 0.6 * step(0.5, fract(uTime * 0.6)));
              }
            }
          }

          // Signage: tall thin bars on the near rank.
          for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float sx = 0.12 + hash11(fi * 13.0) * 0.76;
            float sy = 0.52 + hash11(fi * 29.0) * 0.1;
            vec2 d = (uv - vec2(sx, sy)) / vec2(0.006, 0.05);
            if (abs(d.x) < 1.0 && abs(d.y) < 1.0) {
              vec3 neon = fi < 1.0 ? vec3(1.0, 0.18, 0.52)
                        : fi < 2.0 ? vec3(0.29, 0.91, 1.0)
                        : fi < 3.0 ? vec3(0.70, 0.30, 1.0)
                                   : vec3(1.0, 0.76, 0.28);
              float fail = hash11(fi * 3.0) > 0.7 ? step(0.5, fract(uTime * 7.0 + fi)) : 1.0;
              col = mix(col, neon, 0.9 * fail);
            }
          }

          // Traffic: craft crossing above the roofline, each a hull
          // and a light, wrapping round on its own clock.
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float sp = 0.035 + fi * 0.02;
            float cx2 = fract(uTime * sp + hash11(fi * 41.0));
            float cy2 = 0.68 + fi * 0.055;
            vec2 d = (uv - vec2(cx2, cy2)) / vec2(0.022, 0.0035);
            if (dot(d, d) < 1.0) col = vec3(0.1, 0.11, 0.2);
            float lamp = smoothstep(0.004, 0.0, length((uv - vec2(cx2 - 0.021, cy2)) * vec2(1.0, 2.2)));
            col += vec3(0.6, 0.92, 1.0) * lamp * 1.4;
          }

          // The fold, still out there.
          vec2 rp = (uv - vec2(0.3, 0.74)) / vec2(0.07, 0.075);
          float rr = length(rp);
          if (rr < 1.0) {
            float inv = 1.0 / max(rr, 0.1);
            float rings = sin(atan(rp.y, rp.x) * 1.6 + inv * 2.4 - uTime * 0.3) * 0.5 + 0.5;
            col = mix(vec3(0.02, 0.01, 0.06), vec3(0.16, 0.82, 0.74), rings * smoothstep(1.0, 0.3, rr));
            col = mix(col, vec3(1.0, 0.18, 0.52), smoothstep(0.84, 1.0, rr) * 0.9);
          }
        }

        /* 1 — SPACE. Nebula banding, a dense star field and one
           ringed planet low on the left. */
        else if (s < 1.5) {
          col = vec3(0.012, 0.008, 0.035);
          float n1 = fbm(uv * 2.4 + vec2(uTime * 0.012, 0.0));
          float n2 = fbm(uv * 4.1 - vec2(0.0, uTime * 0.008));
          col += vec3(0.42, 0.10, 0.52) * pow(n1, 2.2) * 0.85;
          col += vec3(0.08, 0.30, 0.62) * pow(n2, 2.6) * 0.7;
          // Denser out here, and in two ranks so it has depth.
          col += starField(uv, 40.0, 0.46, 1.15, 7.0, uTime) * 1.15;
          col += starField(uv, 88.0, 0.34, 0.75, 131.0, uTime) * 0.65;
          // The planet.
          vec2 pc = uv - vec2(0.27, 0.34);
          pc.x *= PANE_A;
          float pr = length(pc);
          if (pr < 0.14) {
            vec3 pn = normalize(vec3(pc / 0.14, sqrt(max(0.0, 1.0 - pow(pr / 0.14, 2.0)))));
            float lit = max(0.0, dot(pn, normalize(vec3(0.7, 0.5, 0.5))));
            float bands = fbm(vec2(pc.x * 6.0, pc.y * 22.0));
            col = mix(vec3(0.5, 0.26, 0.14), vec3(0.78, 0.6, 0.38), bands) * (0.12 + lit);
          }
          float ring = abs(pc.y * 3.6) + abs(pr - 0.21) * 2.0;
          if (pr > 0.145 && ring < 0.07) col += vec3(0.7, 0.6, 0.45) * (0.07 - ring) * 6.0;
        }

        /* 2 — MOUNTAINS. Four ridgelines, hazier and paler with
           distance, snow above the line on the near ones. */
        else if (s < 2.5) {
          col = mix(vec3(0.82, 0.86, 0.93), vec3(0.24, 0.42, 0.68), smoothstep(0.5, 1.0, h));
          for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float y = ridge(uv.x * 5.0, fi * 3.7, 0.1 - fi * 0.014, 0.56 - fi * 0.028);
            if (h < y) {
              vec3 rock = mix(vec3(0.30, 0.33, 0.45), vec3(0.09, 0.11, 0.2), fi / 3.0);
              float snow = smoothstep(y - 0.05, y, h) * (fi < 2.0 ? 1.0 : 0.0);
              col = mix(rock, vec3(0.93, 0.95, 1.0), snow * 0.85);
            }
          }
        }

        /* 3 — OCEAN. A flat horizon, a sun, and a glitter path
           under it that breaks up with distance. */
        else if (s < 3.5) {
          float hor = 0.5;
          col = mix(vec3(0.98, 0.72, 0.45), vec3(0.22, 0.45, 0.75), smoothstep(hor, 1.0, h));
          float sun = smoothstep(0.045, 0.0, length((uv - vec2(0.56, hor + 0.05)) * vec2(0.6, 1.4)));
          col += vec3(1.0, 0.75, 0.42) * sun;
          if (h < hor) {
            float d = (hor - h);
            vec3 sea = mix(vec3(0.05, 0.14, 0.26), vec3(0.03, 0.09, 0.18), smoothstep(0.0, 0.12, d));
            float glint = fbm(vec2(uv.x * 300.0, (hor - h) * 900.0 - uTime * 1.4));
            glint = pow(glint, 5.0) * smoothstep(0.08, 0.0, abs(uv.x - 0.56)) * smoothstep(0.0, 0.015, d);
            col = sea + vec3(1.0, 0.82, 0.55) * glint * 2.2;
          }
        }

        /* 4 — FOREST. Layered conifer silhouettes in mist. */
        else if (s < 4.5) {
          col = mix(vec3(0.76, 0.80, 0.74), vec3(0.42, 0.56, 0.58), smoothstep(0.5, 1.0, h));
          for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float sp = 26.0 + fi * 16.0;
            float x = uv.x * sp * 5.0 + fi * 7.0;
            float tooth = abs(fract(x) - 0.5) * 2.0;
            float top = 0.53 - fi * 0.022 - tooth * (0.05 - fi * 0.008) * (0.6 + 0.4 * hash11(floor(x)));
            if (h < top) col = mix(vec3(0.16, 0.26, 0.2), vec3(0.03, 0.08, 0.07), fi / 3.0);
          }
        }

        /* 5 — DESERT. Smooth dunes and a low heavy sun. */
        else if (s < 5.5) {
          col = mix(vec3(0.98, 0.78, 0.52), vec3(0.42, 0.56, 0.82), smoothstep(0.5, 1.0, h));
          float sun = smoothstep(0.04, 0.0, length((uv - vec2(0.42, 0.53)) * vec2(0.6, 1.4)));
          col += vec3(1.0, 0.72, 0.38) * sun * 1.2;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float y = 0.50 - fi * 0.022 + 0.014 * sin(uv.x * (14.0 + fi * 9.0) + fi * 2.1);
            if (h < y) col = mix(vec3(0.86, 0.64, 0.38), vec3(0.42, 0.27, 0.16), fi / 2.0);
          }
        }

        /* 6 — AURORA. Ribbons over a dark ridge. */
        else if (s < 6.5) {
          col = mix(vec3(0.04, 0.07, 0.16), vec3(0.01, 0.02, 0.07), smoothstep(0.2, 1.0, h));
          vec2 cell = floor(uv * vec2(340.0, 240.0));
          float hh = hash21(cell);
          col += vec3(0.9) * step(0.991, hh) * smoothstep(0.5, 0.75, h);
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float band = fbm(vec2(uv.x * 2.4 + fi * 5.0 + uTime * 0.05, fi));
            float centre = 0.56 + fi * 0.035 + band * 0.08;
            float d = abs(h - centre);
            float glow = smoothstep(0.06, 0.0, d) * smoothstep(0.48, 0.56, h);
            vec3 tint = mix(vec3(0.20, 0.95, 0.55), vec3(0.45, 0.30, 0.95), fi / 2.0);
            col += tint * glow * 0.42;
          }
          float y = ridge(uv.x * 5.0, 1.3, 0.025, 0.5);
          if (h < y) col = vec3(0.015, 0.02, 0.045);
        }

        /* 7 — SNOWFIELD. Pale overcast, rolling hills, falling
           snow in the air. */
        else if (s < 7.5) {
          col = mix(vec3(0.86, 0.89, 0.95), vec3(0.62, 0.70, 0.84), smoothstep(0.5, 1.0, h));
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float y = ridge(uv.x * 5.0, 5.0 + fi * 2.0, 0.018, 0.51 - fi * 0.016);
            if (h < y) col = mix(vec3(0.95, 0.96, 0.99), vec3(0.72, 0.78, 0.88), fi / 2.0);
          }
          vec2 sp = uv * vec2(600.0, 160.0);
          sp.y += uTime * 1.2;
          sp.x += sin(sp.y * 0.6) * 0.5;
          float flake = step(0.982, hash21(floor(sp)));
          col = mix(col, vec3(1.0), flake * 0.8);
        }

        /* 8 — SUNSET. Banded cloud over a burning horizon. */
        else if (s < 8.5) {
          col = mix(vec3(1.0, 0.52, 0.26), vec3(0.22, 0.17, 0.44), smoothstep(0.5, 0.95, h));
          float sun = smoothstep(0.04, 0.0, length((uv - vec2(0.5, 0.52)) * vec2(0.6, 1.4)));
          col += vec3(1.0, 0.78, 0.4) * sun * 1.4;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float cy = 0.52 + fi * 0.028;
            float band = fbm(vec2(uv.x * 3.0 + fi * 4.0 + uTime * 0.02, fi * 2.0));
            float d = abs(h - (cy + band * 0.012));
            col = mix(col, vec3(0.5, 0.22, 0.3), smoothstep(0.008, 0.0, d) * 0.65);
          }
          if (h < 0.5) col = mix(vec3(0.12, 0.08, 0.2), col, smoothstep(0.4, 0.5, h));
        }

        /* 9 — STORM. Heavy cloud with lightning behind it. */
        else {
          col = mix(vec3(0.16, 0.18, 0.24), vec3(0.05, 0.06, 0.1), smoothstep(0.5, 1.0, h));
          float cloud = fbm(uv * 3.2 + vec2(uTime * 0.03, 0.0));
          col = mix(col, vec3(0.10, 0.11, 0.16), cloud);
          col += vec3(0.5, 0.56, 0.7) * pow(cloud, 3.0) * 0.5;
          // Flashes: rare, brief, and never on a tidy interval.
          float cycle = floor(uTime * 0.42);
          float within = fract(uTime * 0.42);
          float fire = step(0.86, hash11(cycle));
          float flash = fire * exp(-within * 22.0) * (0.6 + 0.4 * hash11(cycle + 3.0));
          col += vec3(0.75, 0.8, 1.0) * flash * (0.4 + cloud);
          float y = ridge(uv.x * 5.0, 9.0, 0.02, 0.5);
          if (h < y) col = vec3(0.02, 0.025, 0.04);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  disposables.push(skyMat);
  /* Behind everything. At -90 the sky plane sat in the middle of
     the tower field and hid every building behind it, which is
     why the skyline had holes in it with blank sky showing. */
  skyMat.side = THREE.BackSide;
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(340, 64, 40)), skyMat);
  sky.renderOrder = -1;
  /* Off.
   *
   * Every window scene is painted on the pane behind the glass
   * now, so the dome has nothing left to show through the window
   * — but it was still wrapped around the whole model, and the
   * void shell only blocks the direction *behind* the room. A
   * sight line that went down and sideways past the model missed
   * the shell entirely and landed on the underside of the dome,
   * which is why a hard-edged magenta wedge sat in the corner of
   * the overview. Gone, and the stage's own backdrop shows
   * through instead. */
  sky.visible = false;
  outside.add(sky);

  const vistaMat = skyMat.clone();
  vistaMat.side = THREE.FrontSide;
  vistaMat.uniforms.uMode.value = 1;
  disposables.push(vistaMat);
  // Generous, so no edge of it shows through the glass at an angle.
  const vista = new THREE.Mesh(keep(new THREE.PlaneGeometry(13, 5.6)), vistaMat);
  vista.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, ROOM.backZ - 1.4);
  vista.visible = false;
  root.add(vista);

  /* Photographs, for the scenes that have them. They hang behind
     the void shell, so they are only ever seen through the glass. */
  const vistas = buildVistas(VISTA_SPECS);
  root.add(vistas.group);

  const rC = rand(131);
  /** The skyline as one group, so a window scene that is not a
   *  city can take it out of the room entirely. */
  const cityGroup = new THREE.Group();
  outside.add(cityGroup);
  /** Every tower's material, so daylight can switch the city off. */
  const towerMats: THREE.MeshStandardMaterial[] = [];
  /** Neon signage, so the driver can make a few of them flicker. */
  const signs: THREE.Mesh[] = [];
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
  for (let i = 0; i < 0; i++) {
    const f = facades[Math.floor(rC() * facades.length)];
    const w = 4 + rC() * 10;
    const d = 4 + rC() * 9;
    const hgt = 12 + rC() * rC() * 62;
    // Narrower spread than the depth, so the window looks into a
    // canyon rather than across an empty plain.
    const x = (rC() - 0.5) * 150;
    const z = -24 - rC() * rC() * 150;

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
    cityGroup.add(tower);

    // Signage on the nearer towers. Vertical bars and blocks,
    // saturated, emissive — the thing that makes a skyline read
    // as this kind of city rather than any other.
    if (z > -80 && rC() > 0.42) {
      const palette = [0xff2f86, 0x49e8ff, 0xb44dff, 0xffc247, 0x3dffa8];
      const col = palette[Math.floor(rC() * palette.length)];
      const signMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92 });
      disposables.push(signMat);
      const vertical = rC() > 0.45;
      const sw = vertical ? 0.5 + rC() * 0.7 : 2 + rC() * 4;
      const sh = vertical ? 5 + rC() * 14 : 0.7 + rC() * 1.2;
      const sign = new THREE.Mesh(box(sw, sh, 0.3), signMat);
      const face = rC() > 0.5 ? 1 : -1;
      sign.position.set(
        x + (rC() - 0.5) * (w * 0.5),
        hgt * (0.35 + rC() * 0.5) - 2,
        z + face * (d / 2 + 0.2),
      );
      sign.userData.flicker = rC() > 0.72;
      sign.userData.phase = rC() * 6.28;
      signs.push(sign);
      cityGroup.add(sign);
    }

    if (hgt > 32 && rC() > 0.4) {
      const beacon = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.22, 10, 8)),
        keep(new THREE.MeshBasicMaterial({ color: 0xff3b3b })),
      );
      // Towers now sit two metres lower, so the roof is hgt - 2.
      beacon.position.set(x, hgt - 2.2, z);
      cityGroup.add(beacon);
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

  for (const plan of [] as typeof SHIP_PLAN) {
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
  rift.visible = false;

  /**
   * Rain, on the inside face of the glass.
   *
   * Not particles — a shader on one plane. Streaks that run down
   * and reset, plus still droplets clinging between them, which
   * is what rain on a window actually looks like: mostly stuck,
   * occasionally running.
   */
  const rainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAmount: { value: 1 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uAmount;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(443.897, 441.423));
        p += dot(p, p + 19.19);
        return fract(p.x * p.y);
      }

      void main() {
        if (uAmount < 0.01) discard;
        vec3 col = vec3(0.0);
        float a = 0.0;

        // Runners: columns, each with its own speed and offset.
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          vec2 g = vec2(26.0 + fi * 9.0, 1.0);
          vec2 id = floor(vUv * g);
          vec2 f = fract(vUv * g);
          float h = hash(id + fi * 31.0);
          if (h < 0.55) continue;
          float speed = 0.12 + h * 0.4;
          float y = fract(f.y - uTime * speed + h * 10.0);
          float head = smoothstep(0.04, 0.0, abs(y - 0.5)) ;
          float tail = smoothstep(0.34, 0.0, y - 0.5) * step(0.5, y) * 0.35;
          float x = smoothstep(0.42, 0.0, abs(f.x - 0.5));
          float d = (head + tail) * x;
          a += d;
          col += vec3(0.62, 0.78, 1.0) * d;
        }

        // Clingers: static beads scattered over the pane.
        vec2 bg = vUv * vec2(60.0, 34.0);
        vec2 bid = floor(bg);
        vec2 bf = fract(bg) - 0.5;
        float bh = hash(bid + 7.7);
        float bead = smoothstep(0.34 * bh, 0.0, length(bf)) * step(0.88, bh);
        a += bead * 0.5;
        col += vec3(0.7, 0.85, 1.0) * bead * 0.5;

        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * 0.55 * uAmount);
      }
    `,
  });
  disposables.push(rainMat);
  const rain = new THREE.Mesh(keep(new THREE.PlaneGeometry(fw, fh)), rainMat);
  rain.position.set(cx, cy, ROOM.backZ + 0.03);
  root.add(rain);

  root.add(outside);

  /* ══ Living things ═══════════════════════════════════════ */
  const cat = buildCat(keep);
  cat.group.position.set(WIN.x0 + 0.62, WIN.y0 - 0.02, ROOM.backZ + 0.16);
  cat.group.rotation.y = -0.55;
  root.add(cat.group);
  life.push(cat);
  if (cat.hit) targets.push(cat.hit);

  /* The second cat walks a circuit across the front of the desk
     and settles on the left of the rug. The last point in the
     path is the one she sleeps on. */
  /* Her round.
   *
   * The old route went straight through the sofa — a third of a
   * metre inside its footprint — and passed within a hand's
   * width of the chair's centre column. This one keeps to the
   * open floor down the left of the room and the strip in front
   * of the desk, and still finishes on the rug.
   *
   * scratchpad/pathcheck.mjs sweeps a route against every piece
   * of furniture in here; re-run it if anything on the floor
   * moves. */
  const walker = buildWalkingCat(
    [
      new THREE.Vector3(-0.3, 0, 0.95),
      new THREE.Vector3(-1.65, 0, 0.6),
      new THREE.Vector3(-2.0, 0, -0.3),
      new THREE.Vector3(-1.45, 0, -1.25),
      new THREE.Vector3(-0.55, 0, -1.52),
      new THREE.Vector3(-0.95, 0, -0.52),
    ],
    keep,
  );
  root.add(walker.group);
  life.push(walker);
  if (walker.hit) targets.push(walker.hit);

  const plantSpecs: Array<[Parameters<typeof buildPlant>[0], number, THREE.Vector3]> = [
    ["monstera", 71, new THREE.Vector3(2.25, 0, DESK_Z + 0.35)],
    // Back-left corner. It was standing inside the media unit.
    ["snake", 83, new THREE.Vector3(-2.66, 0, -2.02)],
    // On top of the bookcase, trailing over the edge.
    ["pothos", 97, new THREE.Vector3(CASE_X - 0.04, CASE_H + 0.04, CASE_Z - 0.6)],
    ["succulent", 113, new THREE.Vector3(-0.5, DESK_Y + 0.025, DESK_Z - 0.14)],
  ];
  for (const [kind, seed, pos] of plantSpecs) {
    const p = buildPlant(kind, seed, keep);
    p.group.position.copy(pos);
    root.add(p.group);
    life.push(p);
    if (p.hit) targets.push(p.hit);
  }

  /* The air. Sits under everything else and stops the volume
     between the furniture reading as vacuum. */
  const motes = buildMotes(keep);
  motes.group.position.set(0, 0, ROOM.backZ + ROOM.d / 2);
  root.add(motes.group);
  life.push(motes);

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

  /**
   * Model fill.
   *
   * Every other light in here points into the room from somewhere
   * inside it, which is right when you are sitting at the desk
   * and useless when you are looking down at the whole thing from
   * outside: the floor and the near walls get nothing and the
   * cutaway reads as a black box. This one exists only for the
   * overview framings and the driver fades it out as you move in.
   */
  const modelFill = new THREE.SpotLight(0x9fb4ff, 0, 22, 0.8, 0.45, 1.0);
  modelFill.position.set(5, 7.5, 6);
  modelFill.target.position.set(0, 0.5, -0.9);
  root.add(modelFill);
  root.add(modelFill.target);

  const sun = new THREE.DirectionalLight(0xbfd4ff, 0.7);
  sun.position.set(-3, 7, -6);
  sun.target.position.set(0, 0.9, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
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

  /**
   * A spot, not a point.
   *
   * A shadow-casting PointLight renders the whole scene six times
   * every frame, once per face of a shadow cube — on this scene
   * that alone was most of the frame budget. A desk lamp throws
   * light in one direction through a shade, which is exactly what
   * a spot light is, and it costs one shadow pass.
   */
  const deskLamp = new THREE.SpotLight(0xffc98a, 3.4, 4.2, 0.85, 0.55, 1.6);
  deskLamp.position.set(0.56, DESK_Y + 0.43, DESK_Z + 0.1);
  deskLamp.target.position.set(0.18, DESK_Y, DESK_Z + 0.22);
  deskLamp.castShadow = true;
  deskLamp.shadow.mapSize.set(1024, 1024);
  deskLamp.shadow.bias = -0.0035;
  deskLamp.shadow.camera.near = 0.08;
  deskLamp.shadow.camera.far = 4.5;
  root.add(deskLamp);
  root.add(deskLamp.target);

  const neonLight = new THREE.PointLight(NEON_HUE, 1.7, 3.0, 2);
  neonLight.position.set(ROOM.rightX - 0.3, 2.28, -1.25);
  root.add(neonLight);

  const screenLight = new THREE.PointLight(0x7fb4e8, 0, 2.2, 2);
  screenLight.position.set(0, screenY, screenZ + 0.3);
  root.add(screenLight);

  const tvLight = new THREE.PointLight(0x89c8ff, 0, 2.6, 2);
  tvLight.position.copy(tvScreenPos).add(new THREE.Vector3(0.25, 0, 0.3));
  root.add(tvLight);

  return {
    root,
    screen: {
      position: new THREE.Vector3(0, screenY, screenZ + 0.002),
      width: SCREEN_W,
      height: SCREEN_H,
    },
    tv: { position: tvScreenPos, width: TV_W, height: TV_H, rotationY: TV_YAW },
    flat: { position: flatScreenPos, width: FLAT_W, height: FLAT_H, rotationY: FLAT_YAW },
    targets,
    life,
    decor,
    vistas,
    lamps: {
      sun,
      windowFill,
      desk: deskLamp,
      neon: neonLight,
      screen: screenLight,
      tv: tvLight,
      flat: flatLight,
      fire: fireLight,
      candle: candleLight,
      ambient,
    },
    props: {
      skyMat,
      ships,
      riftMat,
      rift,
      chair,
      chairGlowRing,
      vinyl,
      lampBulb,
      lampHead,
      neonSign,
      neonBase: new THREE.Color(NEON_HUE),
      neonMat,
      screenGlow,
      screenOff,
      tvGlow,
      tvOff,
      flatGlow,
      flatOff,
      flatLed,
      fireMats,
      coalMat,
      sparkMat,
      candleMat,
      speakerCones,
      posters,
      towerMats,
      rainMat,
      signs,
      ledGlowA,
      ledGlowB,
      cityGroup,
      vista,
      vistaMat,
      ceiling: ceil,
      leftWall,
      rightWall,
      plinth,
      modelFill,
    },
    dispose: () => {
      vistas.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

export { ROOM, WIN, DESK_Y, DESK_Z };
