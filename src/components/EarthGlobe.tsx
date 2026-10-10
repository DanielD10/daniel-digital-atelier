"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The rendered globe: a real sphere carrying NASA's night-lights
 * composite, lit by the actual sun position, inside a starfield the
 * camera drifts through.
 *
 * Fallback contract: this component renders nothing visible until
 * the texture has actually loaded. The procedural canvas globe sits
 * underneath and stays put if anything here fails — a dead CDN, a
 * retired NASA layer, no WebGL. The hero degrades, it never blanks.
 *
 * Texture: 32 tiles at GIBS zoom 2, stitched into one 4096x2048
 * equirectangular canvas. Zoom 2 is 2^(z+1) x 2^z tiles of 512px.
 */

/**
 * Zoom levels to try, best first. GIBS EPSG:4326 lays out
 * 2^(z+1) x 2^z tiles of 512px, so:
 *   z=1 →  8 tiles → 2048x1024
 *   z=0 →  2 tiles → 1024x512
 *
 * z=2 (32 tiles) was the original choice and it's why this failed:
 * 32 concurrent requests, each a cold serverless invocation waiting
 * on NASA, means enough timeouts to fall under the threshold and
 * abort. 2048x1024 across a ~600px sphere is plenty of resolution,
 * and 8 requests actually complete.
 */
const ZOOM_LEVELS = [2, 1, 0];

/**
 * Cache-buster for the tile proxy.
 *
 * Tiles are served with "immutable, max-age=31536000", so Vercel's
 * CDN holds them for a year under their path alone. Swapping the
 * upstream NASA layer therefore changes nothing for anyone who has
 * already loaded the page — they keep getting the old bytes.
 *
 * Bumping this is how a layer change actually reaches people.
 * v2: VIIRS_Black_Marble (daily, swath gaps) -> VIIRS_CityLights_2012.
 * v3: split into night + day sets; URLs gained a /night|/day segment.
 */
const TEXTURE_VERSION = 3;
const TILE_PX = 512;
const BATCH = 6;
const DEG = Math.PI / 180;

const colsAt = (z: number) => 2 ** (z + 1);
const rowsAt = (z: number) => 2 ** z;

/** Sub-solar point: where the sun is directly overhead right now. */
function sunDirection(now: Date): THREE.Vector3 {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = (now.getTime() - start) / 86_400_000;
  const lat = 23.44 * Math.sin(((360 / 365.24) * (dayOfYear - 81)) * DEG);

  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const lon = -15 * (utcHours - 12);

  const latR = lat * DEG;
  const lonR = lon * DEG;

  return new THREE.Vector3(
    Math.cos(latR) * Math.sin(lonR),
    Math.sin(latR),
    Math.cos(latR) * Math.cos(lonR),
  ).normalize();
}

/** One tile, with a single retry. Cold NASA fetches are flaky once. */
function loadTile(
  kind: "night" | "day",
  z: number,
  row: number,
  col: number,
  attempt = 0,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (attempt < 1) {
        // Second pass warms the CDN entry the first one populated.
        setTimeout(() => resolve(loadTile(kind, z, row, col, attempt + 1)), 450);
      } else {
        resolve(null);
      }
    };
    img.src = `/api/earth/${kind}/${z}/${row}/${col}?v=${TEXTURE_VERSION}`;
  });
}

async function buildAtZoom(
  kind: "night" | "day",
  z: number,
): Promise<THREE.Texture | null> {
  const cols = colsAt(z);
  const rows = rowsAt(z);

  const canvas = document.createElement("canvas");
  canvas.width = cols * TILE_PX;
  canvas.height = rows * TILE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#01030a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const coords: Array<[number, number]> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) coords.push([row, col]);
  }

  let ok = 0;

  // Batched rather than all-at-once. Firing every tile in parallel
  // is what killed the first attempt — a wall of cold invocations
  // all waiting on NASA at the same time.
  for (let i = 0; i < coords.length; i += BATCH) {
    const slice = coords.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async ([row, col]) => {
        const img = await loadTile(kind, z, row, col);
        if (!img) return;
        ctx.drawImage(img, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX);
        ok++;
      }),
    );
  }

  if (ok < cols * rows) {
    console.warn(`[earth] ${kind} zoom ${z}: ${ok}/${cols * rows} tiles.`);
  }

  // Every tile has to land. A single hole in an equirectangular map
  // is a visible black gash across the planet, which is worse than
  // dropping to a coarser zoom where all tiles made it.
  if (ok < cols * rows) return null;

  console.info(
    `[earth] ${kind} texture ready: zoom ${z}, ${canvas.width}x${canvas.height}, ${ok} tiles.`,
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  /**
   * No mipmaps. Black Marble is near-black with pinpoint highlights,
   * and each mip level averages a city light together with the dark
   * ocean around it — so the lights fade out exactly when the globe
   * is small, which is always. Linear filtering on the full-res
   * texture keeps them.
   */
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Tries each zoom in turn, coarsening rather than giving up. */
async function buildTexture(kind: "night" | "day"): Promise<THREE.Texture | null> {
  for (const z of ZOOM_LEVELS) {
    const texture = await buildAtZoom(kind, z);
    if (texture) return texture;
  }
  console.warn(
    `[earth] ${kind}: no zoom level completed. Open /api/earth/probe to see which NASA layers are reachable.`,
  );
  return null;
}

export default function EarthGlobe() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return; // No WebGL. Procedural globe stays.
    }

    let disposed = false;
    let frame = 0;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      38,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000,
    );
    camera.position.set(0, 0, 4.4);

    // ── Starfield. Depth-sorted points the camera drifts through, so
    //    near stars stream past and far ones barely move. That
    //    parallax is the whole "travelling" feeling. ──────────────
    const STAR_COUNT = 5200;
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starSize = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Spread wide on x/y, deep on z, and keep a hole in the middle
      // so stars never pop out from behind the planet.
      let x = 0;
      let y = 0;
      do {
        x = (Math.random() - 0.5) * 60;
        y = (Math.random() - 0.5) * 40;
      } while (Math.hypot(x, y) < 3.2);

      starPos[i * 3] = x;
      starPos[i * 3 + 1] = y;
      starPos[i * 3 + 2] = -Math.random() * 420 - 4;
      starSize[i] = 0.7 + Math.random() * 2.6;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));

    const starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uWarp: { value: 0 },
        uAspect: { value: 1 },
      },
      vertexShader: `
        attribute float aSize;
        uniform float uWarp;
        uniform float uAspect;
        varying float vFade;
        varying float vSeed;
        varying float vWarp;
        varying vec2  vDir;
        varying float vStretch;

        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);

          // Fade in from the far plane and out as they pass the
          // camera, so recycling a star is never a visible pop.
          float d = -mv.z;
          vFade = smoothstep(0.0, 60.0, d) * (1.0 - smoothstep(260.0, 420.0, d));
          vSeed = aSize;
          vWarp = uWarp;

          vec4 clip = projectionMatrix * mv;

          /**
           * Travel direction in screen space.
           *
           * Stars move straight at the camera, so on screen they
           * stream radially outward from the vanishing point. The
           * streak has to lie along that radius — the previous
           * version stretched every sprite vertically regardless of
           * where it sat, which looked like falling rain rather than
           * hyperspace. Aspect correction keeps the angle true on a
           * wide monitor.
           */
          vec2 ndc = clip.xy / max(clip.w, 0.0001);
          vec2 radial = ndc * vec2(uAspect, 1.0);
          vDir = length(radial) > 0.0001 ? normalize(radial) : vec2(0.0, 1.0);

          // Near stars streak further than far ones. That difference
          // is the parallax that sells the speed.
          float near = 1.0 - smoothstep(0.0, 200.0, d);
          vStretch = 1.0 + uWarp * (1.6 + near * 5.4);

          // The sprite is square, so it has to grow by the full
          // stretch or the streak gets clipped at its own edge.
          // Clamped: drivers cap point size at their own limit and
          // clip the sprite silently when you exceed it, which
          // truncates the streak mid-flight. Better to pick the
          // ceiling ourselves than discover each GPU's.
          gl_PointSize = min(aSize * (160.0 / max(d, 1.0)) * vStretch, 480.0);
          gl_Position = clip;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vFade;
        varying float vSeed;
        varying float vWarp;
        varying vec2  vDir;
        varying float vStretch;

        void main() {
          // gl_PointCoord is y-down; flip into the y-up frame vDir
          // was computed in, or every streak points the wrong way in
          // the top half of the screen.
          vec2 p = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y);

          // Rotate into the streak's own frame, then compress along
          // it — compressing the sample is what elongates the shape.
          float along  = dot(p, vDir) / vStretch;
          float across = p.x * vDir.y - p.y * vDir.x;

          float r = length(vec2(along, across));
          if (r > 0.5) discard;

          float core = smoothstep(0.5, 0.0, r);

          // Twinkle flattens at speed — something moving that fast
          // reads as a solid line of light, not a flicker.
          float tw = mix(0.75 + 0.25 * sin(uTime * 1.6 + vSeed * 31.0), 1.0, vWarp);

          // White, as it was. The natural cool/warm scatter stays —
          // it is what keeps a white starfield from looking printed.
          vec3 tint = mix(vec3(0.72, 0.80, 1.0), vec3(1.0, 0.93, 0.82), fract(vSeed * 7.3));

          // Streaks run brighter and whiter at speed.
          tint = mix(tint, vec3(1.0), vWarp * 0.5);

          float alpha = core * core * vFade * tw * (1.0 + vWarp * 0.9);
          gl_FragColor = vec4(tint, alpha);
        }
      `,
    });

    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── Earth. Shader handles the terminator: the night texture is
    //    the city lights, the day side is the same texture lifted
    //    cool and bright, and a warm band sits on the boundary. ───
    const blankTex = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    blankTex.needsUpdate = true;

    const uniforms = {
      uTex: { value: blankTex as THREE.Texture | null },
      uDay: { value: blankTex as THREE.Texture | null },
      uHasDay: { value: 0 },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uHasTex: { value: 0 },
      uTime: { value: 0 },
    };

    const earthMat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vObj;
        void main() {
          vUv = uv;
          vNormal = normalize(mat3(modelMatrix) * normal);
          // Object-space direction. Clouds are sampled from this
          // rather than from uv, so the noise is spherical and has
          // no seam at the dateline and no pinch at the poles.
          vObj = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform sampler2D uDay;
        uniform vec3 uSun;
        uniform float uHasTex;
        uniform float uHasDay;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vObj;

        // Cheap stable hash. Same uv always gives the same value, so
        // each patch of the planet twinkles on its own clock instead
        // of the whole hemisphere pulsing together.
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        /**
         * 3D value noise, sampled on the sphere's own direction
         * vector.
         *
         * Sampling in 3D rather than from uv is the whole trick: a
         * 2D noise field on an equirectangular map tears at the
         * dateline and bunches into a knot at both poles. In 3D
         * there is no seam to tear and no pole to bunch at, because
         * the field simply exists everywhere the sphere does.
         */
        /**
         * Hash with no transcendentals.
         *
         * The obvious fract(sin(dot(...))) costs a sin per corner,
         * and the noise below needs eight corners per octave. At
         * four octaves over a sphere this size that is tens of
         * millions of sin() calls a frame, which is fine on a
         * discrete GPU and a slideshow on an integrated one. This
         * version is pure multiply-and-fract.
         */
        float h3(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float vnoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(h3(i + vec3(0,0,0)), h3(i + vec3(1,0,0)), f.x),
                mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x),
                mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y),
            f.z);
        }

        // Four octaves. Enough for weather-shaped structure; a
        // fifth buys detail smaller than a pixel at this size.
        float fbm(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * vnoise(p);
            p *= 2.07;   // not exactly 2, or the octaves align into bands
            a *= 0.5;
          }
          return v;
        }

        void main() {
          if (uHasTex < 0.5) discard;

          vec3 tex = texture2D(uTex, vUv).rgb;
          float lum = dot(tex, vec3(0.299, 0.587, 0.114));
          float sun = dot(normalize(vNormal), normalize(uSun));

          // Night mask: 1 on the dark side, 0 in full daylight, with
          // a soft band across the terminator.
          float night = smoothstep(0.18, -0.20, sun);

          // ── Twinkle ──────────────────────────────────────────────
          // Two hashes at different scales: one for the city, one
          // finer for variation inside it. Rates differ per patch so
          // nothing beats in unison.
          float h1 = hash(floor(vUv * 420.0));
          float h2 = hash(floor(vUv * 1600.0) + 7.3);
          float rate = 1.1 + h1 * 3.4;
          float tw = 0.60
                   + 0.40 * sin(uTime * rate + h1 * 62.8)
                   + 0.18 * sin(uTime * (rate * 2.7) + h2 * 41.3);

          // ── Lights ───────────────────────────────────────────────
          // The texture alone is too dim once it's this small on
          // screen, so brightness is pushed hard and a separate bloom
          // term is added wherever there's any light at all. That
          // second term is what makes a city read as a glow rather
          // than a grey pixel.
          vec3 sodium = vec3(1.0, 0.74, 0.38);
          float core  = smoothstep(0.015, 0.30, lum);
          float halo  = smoothstep(0.004, 0.14, lum);

          vec3 lights = tex * sodium * 3.4          // the imagery, lifted
                      + sodium * core * 2.6         // hot core
                      + vec3(0.9,0.55,0.24) * halo * 0.9; // surrounding glow

          lights *= 0.72 + 0.52 * tw;

          /**
           * Night ground.
           *
           * Flat dark navy everywhere was the mistake: over open
           * ocean there is no texture detail and no lights, so the
           * planet lost all its shading and read as a cut-out disc.
           * A sphere needs a gradient even where there is nothing
           * on it.
           *
           * Three terms do that. A soft diffuse falloff from the
           * sun (earthshine — the night side is never truly black
           * from orbit), an ocean sheen that catches the sun at a
           * glancing angle, and a cool rim toward the limb.
           */
          vec3 N = normalize(vNormal);

          // Wrapped diffuse: carries light around past the
          // terminator instead of cutting hard at 90 degrees.
          float wrap = max(0.0, (sun + 0.62) / 1.62);
          float earthshine = pow(wrap, 2.2) * 0.085;

          // Specular glint off water. Land has texture detail, so
          // the sheen is masked where the imagery is bright.
          vec3 H = normalize(normalize(uSun) + vec3(0.0, 0.0, 1.0));
          float spec = pow(max(dot(N, H), 0.0), 26.0) * (1.0 - smoothstep(0.02, 0.16, lum));

          // Cool edge, so the silhouette never meets space flat.
          float facingN = abs(dot(N, vec3(0.0, 0.0, 1.0)));
          float rim = pow(1.0 - facingN, 3.0);

          vec3 nightBase = mix(vec3(0.010,0.020,0.038),
                               vec3(0.036,0.055,0.085), lum)
                         + vec3(0.16, 0.26, 0.42) * earthshine
                         + vec3(0.30, 0.42, 0.60) * spec * 0.22
                         + vec3(0.14, 0.24, 0.42) * rim * 0.16;

          /**
           * Day side: the real surface.
           *
           * This used to be a blue-grey wash derived from how
           * bright the city lights were — so the lit half of the
           * planet had no ocean, no coastline and no terrain, which
           * is most of why it read as a flat map rather than a
           * world. Blue Marble is the actual daytime surface.
           *
           * Falls back to the old derived wash if the day tiles
           * never arrive, so a half-loaded globe still looks like
           * something.
           */
          vec3 surface = texture2D(uDay, vUv).rgb;
          vec3 derived = mix(vec3(0.05,0.08,0.14), vec3(0.26,0.35,0.48), lum * 1.4);
          vec3 albedo = mix(derived, surface, uHasDay);

          // Lambert with a little wrap, so the terminator softens
          // instead of cutting a hard line across the sphere.
          float diff = max(0.0, (sun + 0.18) / 1.18);
          vec3 day = albedo * pow(diff, 1.25) * 1.18;

          /**
           * Lights everywhere, not just on the night side.
           *
           * Physically, a city in daylight shows nothing — which is
           * correct and useless: at any moment roughly half the
           * planet's cities are invisible, and whichever half that
           * is depends on when you happen to load the page. Europe
           * simply wasn't there at 8am local.
           *
           * So the terminator stays real and still drives the
           * colour, but the lights are dimmed on the day side rather
           * than switched off. This is the same licence NASA's own
           * Black Marble composite takes — no real Earth looks like
           * that either. The sun position is still live; the lights
           * just never leave.
           */
          float lightMask = mix(0.42, 1.0, night);

          // Ground and lights are shaded separately, because they
          // want opposite things from the limb.
          vec3 ground = day * (1.0 - night) + nightBase * night;

          // Warm rim along the terminator.
          float band = smoothstep(0.34, 0.0, abs(sun)) * 0.5;
          ground += vec3(0.95, 0.55, 0.22) * band * 0.4;

          /**
           * Limb darkening, hard on the ground.
           *
           * This is what makes a sphere look like a sphere. Last
           * time I flattened the curve because it was dimming the
           * cities at the edges — and flattening it is exactly what
           * made the planet read as a cut-out disc.
           *
           * The fix is to shade the two separately: the ground
           * falls off steeply, the lights keep almost all their
           * brightness to the edge, which is also how a real night
           * side behaves.
           */
          float facing = abs(dot(N, vec3(0.0, 0.0, 1.0)));
          ground *= 0.38 + 0.62 * pow(facing, 0.55);

          /**
           * Weather.
           *
           * This is the part that stops it reading as a map glued
           * to a ball. A photograph of Earth is never just terrain
           * — it is terrain seen through moving cloud, and cloud is
           * what gives the surface somewhere to sit behind.
           *
           * Two bands at different scales and drift rates: broad
           * frontal systems, and finer structure moving faster on
           * top. They are sampled in 3D off the sphere's own
           * direction, so there is no seam and no polar pinch, and
           * they drift independently of the planet's rotation the
           * way real weather does.
           */
          vec3 cdir = normalize(vObj);
          float drift = uTime * 0.0042;

          float broad = fbm(cdir * 2.6 + vec3(drift, drift * 0.22, -drift * 0.4));
          // A single extra octave rather than a second full fbm —
          // the detail reads the same and it costs a third as much.
          float fine  = vnoise(cdir * 9.1 + vec3(-drift * 2.1, drift * 0.6, drift * 1.3));

          // Shaped hard: most of the sphere stays clear, and what
          // is left reads as distinct systems rather than haze.
          float cloud = smoothstep(0.50, 0.80, broad * 0.72 + fine * 0.34);

          // Thin the band near the poles, where the projection has
          // the least real estate and cloud would otherwise smear.
          cloud *= 1.0 - 0.45 * pow(abs(cdir.y), 3.0);

          // Lit by the same sun as everything else, with a wrapped
          // falloff so the terminator runs through the cloud tops
          // instead of cutting them off.
          float cloudLit = pow(max(0.0, (sun + 0.45) / 1.45), 1.6);
          vec3 cloudCol = mix(
            vec3(0.07, 0.10, 0.16),           // unlit, barely there
            vec3(0.95, 0.96, 0.99),           // full daylight
            cloudLit
          );
          // Warm the cloud tops where they cross the terminator.
          cloudCol += vec3(0.55, 0.26, 0.08) * band * 0.9;

          // Cloud sits in front of the city lights, so it occludes
          // them. Without this the lights punch through the weather
          // and the layering collapses.
          float occl = 1.0 - cloud * 0.78;

          vec3 col = ground * (1.0 - cloud * 0.72)
                   + cloudCol * cloud
                   + lights * lightMask * occl * (0.6 + 0.4 * pow(facing, 0.25));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), earthMat);

    /**
     * Orientation.
     *
     * With an equirectangular map on a three.js sphere, rotation.y
     * of -PI/2 puts longitude 0 facing the camera. To face longitude
     * L you want -PI/2 - L, so -100 (central North America) lands
     * the Americas front and centre at load.
     *
     * The previous build set rotation.z to the real 23.44 axial
     * tilt, which reads as the planet lying over on its side. Real,
     * but wrong for a composition. The tilt now goes on X instead,
     * which lifts the northern hemisphere toward the viewer — same
     * "not a desk globe" feel, correct horizon.
     */
    /**
     * Longitude facing the camera, driven by scroll position.
     *
     * A continuous spin always eventually parks you over the
     * Pacific — a third of the planet that is nothing but water and
     * reads as a blank disc. There is no rotation speed that avoids
     * it; you can only avoid the longitudes.
     *
     * So the globe no longer spins on a clock. Scroll position maps
     * to longitude across a 145-degree arc that skips the Pacific
     * entirely: the hero opens over the Americas, and by the closer
     * you are looking at Europe and Africa. Local roots to global
     * vision, which is the line in the hero anyway.
     */
    const LON_TOP = -100; // Americas
    const LON_END = 45; // Europe / Africa
    const baseRotY = -Math.PI / 2 - LON_TOP * DEG;
    const lonToRotY = (lon: number) => -Math.PI / 2 - lon * DEG;

    let scrollEased = 0;
    const readScrollProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return 0;
      return Math.min(1, Math.max(0, window.scrollY / max));
    };
    earth.rotation.order = "YXZ"; // spin first, then tilt the result
    earth.rotation.x = 0.42; // ~24deg, looking down on the top of North America
    earth.rotation.y = baseRotY;
    earth.rotation.z = 0;
    scene.add(earth);

    // ── Atmosphere: a slightly larger backface sphere with a fresnel
    //    falloff. Amber where the sun hits, cold blue elsewhere. ──
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { uSun: uniforms.uSun },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uSun;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0,0.0,1.0))), 3.2);
          float sun = dot(normalize(vNormal), normalize(uSun));
          float lit = smoothstep(-0.35, 0.55, sun);
          vec3 warm = vec3(1.0, 0.58, 0.20);
          vec3 cool = vec3(0.28, 0.46, 0.78);
          vec3 col = mix(cool, warm, lit);
          gl_FragColor = vec4(col, fres * (0.25 + lit * 0.85));
        }
      `,
    });

    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.055, 64, 64), atmoMat);
    scene.add(atmosphere);

    function resize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;

      // Push the planet right of the wordmark by offsetting the
      // camera rather than the mesh, so the starfield stays centred.
      camera.setViewOffset(w, h, -w * 0.19, 0, w, h);
      camera.updateProjectionMatrix();

      starMat.uniforms.uAspect.value = w / Math.max(h, 1);
    }

    const clock = new THREE.Clock();
    let elapsed = 0;

    /**
     * Hold-to-warp.
     *
     * warp eases toward warpTarget rather than snapping, because the
     * acceleration is the whole effect — an instant jump to full
     * speed reads as a glitch. Asymmetric on purpose: winding up
     * takes longer than settling back, the way a real throttle does.
     */
    let warp = 0;
    let warpTarget = 0;
    const BASE_SPEED = 14;
    const WARP_SPEED = 460;
    const BASE_FOV = 38;

    function animate() {
      if (disposed) return;
      frame = requestAnimationFrame(animate);

      // getElapsedTime() internally consumes the delta, so calling
      // both in one frame gives you a delta of ~0 and nothing moves.
      // Take the delta once and accumulate it.
      const dt = Math.min(clock.getDelta(), 0.05); // clamp tab-switch jumps
      elapsed += dt;
      const t = elapsed;

      if (!reduced) {
        /**
         * One full turn every seven minutes.
         *
         * The starting orientation is correct — derived, not
         * guessed. With SphereGeometry and an equirectangular map,
         * longitude -90 faces the camera at rotation.y = 0, and the
         * front longitude is -90 - rotation.y. For -100 that's +10
         * degrees, which is what baseRotY computes.
         *
         * So the ocean wasn't a bad starting angle, it was the spin.
         * At 90s a turn you leave North America in about fifteen
         * seconds and spend the next half-minute over the Pacific,
         * which is a third of the planet and has nothing on it. At
         * seven minutes it's still visibly moving but stays on the
         * Americas for most of any real visit.
         */
        // Ease toward the scroll target so a flung scroll doesn't
        // snap the planet round.
        const prog = readScrollProgress();
        scrollEased += (prog - scrollEased) * Math.min(1, 2.6 * dt);

        // A slow bounded drift on top, so it still breathes when
        // nobody is scrolling. Bounded, so it can never wander onto
        // the empty face.
        const drift = Math.sin(t * 0.055) * 7;

        earth.rotation.y = lonToRotY(
          LON_TOP + (LON_END - LON_TOP) * scrollEased + drift,
        );

        // Ease toward the warp target. Frame-rate independent, so a
        // 144Hz monitor and a 60Hz one wind up at the same rate.
        const k = warpTarget > warp ? 2.4 : 4.2;
        warp += (warpTarget - warp) * Math.min(1, k * dt);
        if (warp < 0.0004) warp = 0;

        // Eased curve, not linear — most of the speed arrives in the
        // back half of the press so the build is felt.
        const w = warp * warp * (3 - 2 * warp);

        // Drift through the starfield. Stars that pass the camera
        // are recycled to the back of the volume.
        const pos = starGeo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const speed = (BASE_SPEED + WARP_SPEED * w) * dt;
        for (let i = 2; i < arr.length; i += 3) {
          arr[i] += speed;
          if (arr[i] > 2) arr[i] = -420;
        }
        pos.needsUpdate = true;

        starMat.uniforms.uWarp.value = w;

        // Widening the lens as the stars accelerate is the Vertigo
        // trick: the planet stays the same size while space opens up
        // around it, so the viewer feels pulled forward rather than
        // watching something move.
        const fov = BASE_FOV + w * 24;
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }

      /**
       * Wrapped, not raw. GLSL mediump floats lose precision as the
       * value grows, so after a long session sin(uTime * rate) goes
       * blocky and the twinkle starts stepping. 1000s is far longer
       * than any twinkle period, so wrapping is invisible.
       *
       * Frozen entirely under reduced motion — the lights stay lit,
       * they just stop flickering.
       */
      const shaderTime = reduced ? 0 : t % 1000;
      starMat.uniforms.uTime.value = shaderTime;
      uniforms.uTime.value = shaderTime;

      // Sun direction, counter-rotated into the mesh's frame so the
      // terminator stays fixed to the real world while Earth turns.
      const sun = sunDirection(new Date());
      const spun = sun
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -(earth.rotation.y - baseRotY));
      uniforms.uSun.value.copy(spun);

      renderer.render(scene, camera);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    animate();

    // Texture arrives whenever it arrives. Until then the mesh
    // discards every fragment and the procedural globe shows through.
    /**
     * Night first, then day.
     *
     * Sequential rather than parallel: each set is 32 tile requests
     * and firing 64 cold serverless invocations at NASA at once is
     * exactly what made the first version time out and fall back.
     *
     * The globe shows as soon as night is up — the day map arriving
     * a second later just fills in the lit half, so a slow
     * connection degrades to the night-lights globe instead of
     * nothing.
     */
    buildTexture("night").then((night) => {
      if (disposed || !night) return;
      uniforms.uTex.value = night;
      uniforms.uHasTex.value = 1;
      setReady(true);

      return buildTexture("day").then((day) => {
        if (disposed || !day) return;
        uniforms.uDay.value = day;
        uniforms.uHasDay.value = 1;
      });
    });

    /**
     * Hold anywhere to accelerate.
     *
     * Listened on window rather than the canvas, because the space
     * layer is pointer-events:none — it has to be, or it would eat
     * every click on the page. The trade is that we must ignore
     * presses that belong to something else: links, buttons, form
     * fields, and any text the visitor is selecting.
     */
    const INTERACTIVE = "a, button, input, textarea, select, label, [role='button']";

    const onDown = (event: PointerEvent) => {
      if (reduced) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      const target = event.target as Element | null;
      if (target?.closest?.(INTERACTIVE)) return;
      warpTarget = 1;
    };

    const onUp = () => {
      warpTarget = 0;
    };

    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    // pointercancel fires when a touch turns into a scroll, which is
    // the common case on a phone — without it the warp would stick on.
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("blur", onUp);

    const onVisibility = () => {
      if (document.hidden) {
        warpTarget = 0;
        cancelAnimationFrame(frame);
      } else {
        frame = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
      document.removeEventListener("visibilitychange", onVisibility);
      starGeo.dispose();
      starMat.dispose();
      earthMat.dispose();
      atmoMat.dispose();
      earth.geometry.dispose();
      atmosphere.geometry.dispose();
      uniforms.uTex.value?.dispose();
      uniforms.uDay.value?.dispose();
      blankTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className={`globe-gl${ready ? " is-ready" : ""}`} aria-hidden="true" />;
}
