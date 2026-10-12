import * as THREE from "three";

/**
 * Photographic window vistas.
 *
 * A procedural forest is a losing fight — a shader that paints
 * trunks and canopy is always going to read as a shader painting
 * trunks and canopy. A photograph does not have that problem.
 *
 * The parallax here is real, not a CSS trick: each layer is a
 * plane standing a measured distance behind the glass, so when
 * the camera moves the near layers slide across the far ones
 * because that is what things at different distances do. The
 * window frame and its mullions are the reference the eye reads
 * it against, which is why the effect lands through a window and
 * would not on a full-bleed background.
 *
 * One photograph already works. More layers make it better.
 */

/** The window aperture and the wall it is cut into. */
const WIN = { x0: -1.7, x1: 1.9, y0: 1.05, y1: 2.45 };
const BACK_Z = -2.6;

/**
 * How big a layer has to be.
 *
 * A layer must cover the aperture from every camera position in
 * the rig, not just the one in front of it — otherwise its edge
 * swings into shot the moment you step sideways. Sweeping every
 * camera the rig can occupy (both framings of all four shots,
 * seated at the screen, plus the breathing and pointer drift)
 * against all four corners of the aperture gives a required size
 * that is exactly linear in depth, so it collapses to this.
 *
 * Re-derive with scratchpad/cover.mjs if the shot list changes.
 */
const COVER = {
  w: (d: number) => 3.6 + 4.72 * d,
  h: (d: number) => 1.4 + 2.43 * d,
  x: (d: number) => 0.1 + 0.113 * d,
  y: (d: number) => 1.75 + 0.684 * d,
};

export type VistaLayer = {
  /** Served from /public. A layer whose file is missing is skipped. */
  src: string;
  /**
   * Metres behind the glass. Depth is the whole effect: 0.6 is a
   * branch just outside, 6 is the far treeline. Keep at least one
   * layer close and one far or there is nothing to slide against.
   * Below 0.5 the layer collides with the wall it hangs behind.
   */
  depth: number;
  /** For alpha layers stacked over a base. */
  opacity?: number;
  /**
   * Metres of autonomous sway, for foliage that should move when
   * the camera does not. Scaled by depth on its own.
   */
  sway?: number;
};

export type VistaSpec = {
  /** Index into WINDOW_SCENES. */
  scene: number;
  /** Back to front: the first entry is the furthest away. */
  layers: VistaLayer[];
};

type Live = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  depth: number;
  sway: number;
  homeX: number;
};

export type VistaSet = {
  group: THREE.Group;
  /** True once this scene's backdrop has decoded. */
  ready: (scene: number) => boolean;
  /**
   * Begin fetching a scene's layers. Safe to call every frame;
   * it does the work once. Nothing is requested until a scene is
   * actually looked at, which keeps a scene with no files from
   * throwing 404s at every visitor and keeps a scene with large
   * files from being downloaded by people who never switch the
   * window.
   */
  prime: (scene: number) => void;
  /** Show one scene and hide the rest; -1 hides everything. */
  show: (scene: number) => void;
  /** Per-frame sway. Camera parallax needs no help; it is geometry. */
  tick: (t: number) => void;
  /** So a 3am forest is not lit like noon. */
  tint: (c: THREE.Color) => void;
  dispose: () => void;
};

/**
 * Fit a plane to a photograph without squashing it.
 *
 * The aperture needs a 2:1-ish plane and photographs are 3:2 or
 * 16:9, so one axis always has slack. Growing whichever axis is
 * short until both are covered keeps the pixels square; the
 * overspill hangs behind the wall where nobody sees it.
 */
function fitPlane(depth: number, imageAspect: number) {
  const needW = COVER.w(depth);
  const needH = COVER.h(depth);
  const w = Math.max(needW, needH * imageAspect);
  return { w, h: w / imageAspect };
}

export function buildVistas(specs: VistaSpec[]): VistaSet {
  const group = new THREE.Group();
  group.name = "photo-vistas";

  const loader = new THREE.TextureLoader();
  /** Which scene is on screen; read by deferred loads that finish late. */
  let shown = -1;
  const byScene = new Map<number, Live[]>();
  const decoded = new Set<number>();
  const owned: Array<THREE.Texture | THREE.Material | THREE.BufferGeometry> = [];

  /** Fetches not yet started, by scene. */
  const primes = new Map<number, Array<() => void>>();

  for (const spec of specs) {
    const live: Live[] = [];
    const pending: Array<() => void> = [];
    primes.set(spec.scene, pending);
    byScene.set(spec.scene, live);

    spec.layers.forEach((layer, i) => {
      const depth = Math.max(0.5, layer.depth);
      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        transparent: layer.opacity !== undefined || i > 0,
        opacity: layer.opacity ?? 1,
        depthWrite: i === 0,
        toneMapped: true,
        side: THREE.FrontSide,
      });
      owned.push(geo, mat);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(COVER.x(depth), COVER.y(depth), BACK_Z - depth);
      /* Nearer layers draw last so alpha stacks in the right
         order regardless of what the depth buffer thinks of two
         planes a few centimetres apart. */
      mesh.renderOrder = -50 + i;
      mesh.visible = false;
      mesh.frustumCulled = false;
      group.add(mesh);

      live.push({ mesh, mat, depth, sway: layer.sway ?? 0, homeX: mesh.position.x });

      /* Deferred until the scene is first looked at. */
      pending.push(() => {
        loader.load(
          layer.src,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 8;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.needsUpdate = true;
            owned.push(tex);

            const img = tex.image as { width: number; height: number };
            const aspect = img && img.height ? img.width / img.height : 16 / 9;
            const { w, h } = fitPlane(depth, aspect);
            mesh.scale.set(w, h, 1);

            mat.map = tex;
            mat.needsUpdate = true;
            /* Only the backdrop counts. The nearer layers are
               alpha cutouts, so a scene that had those and not
               the base would switch the shader off and leave you
               looking through a few branches at nothing. */
            if (i === 0) decoded.add(spec.scene);
            if (shown === spec.scene) mesh.visible = true;
          },
          undefined,
          () => {
            /* No file there. The shader vista stays on for this
               scene and nothing in the room notices. */
          },
        );
      });
    });
  }

  return {
    group,
    ready: (scene) => decoded.has(scene),
    prime: (scene) => {
      const jobs = primes.get(scene);
      if (!jobs || !jobs.length) return;
      primes.set(scene, []);
      for (const run of jobs) run();
    },
    show: (scene) => {
      if (shown === scene) return;
      shown = scene;
      for (const [s, live] of byScene) {
        const on = s === scene;
        for (const l of live) l.mesh.visible = on && l.mat.map !== null;
      }
    },
    tick: (t) => {
      if (shown < 0) return;
      const live = byScene.get(shown);
      if (!live) return;
      for (const l of live) {
        if (!l.sway || !l.mesh.visible) continue;
        l.mesh.position.x = l.homeX + Math.sin(t * 0.21 + l.depth) * l.sway;
      }
    },
    tint: (c) => {
      for (const live of byScene.values()) for (const l of live) l.mat.color.copy(c);
    },
    dispose: () => {
      for (const o of owned) o.dispose();
    },
  };
}

/**
 * What hangs behind the glass, per scene.
 *
 * Drop files in at these paths and the scene switches from the
 * shader to the photographs by itself — there is no flag to flip.
 * Remove them and it switches back.
 */
export const VISTA_SPECS: VistaSpec[] = [
  {
    scene: 4, // Forest
    layers: [
      { src: "/images/vista/forest/far.webp", depth: 6.0 },
      { src: "/images/vista/forest/mid.webp", depth: 2.2, sway: 0.015 },
      { src: "/images/vista/forest/near.webp", depth: 0.7, sway: 0.045 },
    ],
  },
];
