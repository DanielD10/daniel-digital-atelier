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
const ZOOM_LEVELS = [1, 0];
const TILE_PX = 512;
const BATCH = 4;
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
        setTimeout(() => resolve(loadTile(z, row, col, attempt + 1)), 450);
      } else {
        resolve(null);
      }
    };
    img.src = `/api/earth/${z}/${row}/${col}`;
  });
}

async function buildAtZoom(z: number): Promise<THREE.Texture | null> {
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
        const img = await loadTile(z, row, col);
        if (!img) return;
        ctx.drawImage(img, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX);
        ok++;
      }),
    );
  }

  if (ok < cols * rows) {
    console.warn(`[earth] zoom ${z}: ${ok}/${cols * rows} tiles.`);
  }

  // Every tile has to land. A single hole in an equirectangular map
  // is a visible black gash across the planet, which is worse than
  // dropping to a coarser zoom where all tiles made it.
  if (ok < cols * rows) return null;

  console.info(`[earth] NASA texture ready at zoom ${z} (${canvas.width}x${canvas.height}).`);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Tries each zoom in turn, coarsening rather than giving up. */
async function buildTexture(): Promise<THREE.Texture | null> {
  for (const z of ZOOM_LEVELS) {
    const texture = await buildAtZoom(z);
    if (texture) return texture;
  }
  console.warn(
    "[earth] no zoom level completed. Open /api/earth/probe to see which NASA layers are reachable.",
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
    camera.position.set(0, 0, 3.05);

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
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aSize;
        varying float vFade;
        varying float vSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Fade in from the far plane and out as they pass the
          // camera, so recycling a star is never a visible pop.
          float d = -mv.z;
          vFade = smoothstep(0.0, 60.0, d) * (1.0 - smoothstep(260.0, 420.0, d));
          vSeed = aSize;
          gl_PointSize = aSize * (160.0 / max(d, 1.0));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vFade;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          if (r > 0.5) discard;
          float core = smoothstep(0.5, 0.0, r);
          float tw = 0.75 + 0.25 * sin(uTime * 1.6 + vSeed * 31.0);
          vec3 tint = mix(vec3(0.72,0.80,1.0), vec3(1.0,0.93,0.82), fract(vSeed * 7.3));
          gl_FragColor = vec4(tint, core * core * vFade * tw);
        }
      `,
    });

    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── Earth. Shader handles the terminator: the night texture is
    //    the city lights, the day side is the same texture lifted
    //    cool and bright, and a warm band sits on the boundary. ───
    const uniforms = {
      uTex: { value: null as THREE.Texture | null },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uHasTex: { value: 0 },
    };

    const earthMat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform vec3 uSun;
        uniform float uHasTex;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          if (uHasTex < 0.5) discard;

          vec3 tex = texture2D(uTex, vUv).rgb;
          float sun = dot(normalize(vNormal), normalize(uSun));

          // Night mask: 1 on the dark side, 0 in full daylight, with
          // a soft band across the terminator.
          float night = smoothstep(0.22, -0.18, sun);

          // City lights, warmed toward sodium amber so the globe
          // sits in the page's bronze palette.
          float lum = dot(tex, vec3(0.299, 0.587, 0.114));
          vec3 lights = tex * vec3(1.32, 0.98, 0.62) * 1.45;

          // Day side: the same imagery read as cool lit ocean/land.
          vec3 day = mix(vec3(0.05,0.09,0.15), vec3(0.42,0.54,0.70), lum * 1.6)
                     * max(sun, 0.0);

          vec3 col = day * (1.0 - night) + lights * night;

          // Warm rim along the terminator.
          float band = smoothstep(0.34, 0.0, abs(sun)) * 0.5;
          col += vec3(0.95, 0.55, 0.22) * band * 0.4;

          // Limb darkening so the sphere's edge reads as curvature.
          float facing = abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
          col *= 0.55 + 0.45 * pow(facing, 0.4);

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
    const BASE_LON = -100;
    const baseRotY = -Math.PI / 2 - BASE_LON * DEG;
    earth.rotation.order = "YXZ"; // spin first, then tilt the result
    earth.rotation.x = 0.3; // ~17deg, northern hemisphere favoured
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
    }

    const clock = new THREE.Clock();
    let elapsed = 0;

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
        // One turn every 90 seconds, starting from the Americas.
        earth.rotation.y = baseRotY + (t / 90) * Math.PI * 2;

        // Drift through the starfield. Stars that pass the camera
        // are recycled to the back of the volume.
        const pos = starGeo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const speed = 14 * dt;
        for (let i = 2; i < arr.length; i += 3) {
          arr[i] += speed;
          if (arr[i] > 2) arr[i] = -420;
        }
        pos.needsUpdate = true;
      }

      starMat.uniforms.uTime.value = t;

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
    buildTexture().then((texture) => {
      if (disposed) return;
      if (!texture) return; // keep the fallback
      uniforms.uTex.value = texture;
      uniforms.uHasTex.value = 1;
      setReady(true);
    });

    const onVisibility = () => {
      if (document.hidden) {
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
      document.removeEventListener("visibilitychange", onVisibility);
      starGeo.dispose();
      starMat.dispose();
      earthMat.dispose();
      atmoMat.dispose();
      earth.geometry.dispose();
      atmosphere.geometry.dispose();
      uniforms.uTex.value?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className={`globe-gl${ready ? " is-ready" : ""}`} aria-hidden="true" />;
}
