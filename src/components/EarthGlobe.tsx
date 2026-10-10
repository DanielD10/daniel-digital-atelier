"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The planet.
 *
 * Five local texture maps rather than tiles fetched and stitched at
 * runtime. The tile approach failed three separate ways — a daily
 * NASA product that returns orbital swaths instead of a map, a
 * year-long CDN cache that outlived the fix, and partial grids that
 * left half the sphere blank — and every one of those only showed
 * up in production. Static files in /public are as reliable as the
 * page itself: if the site loads, the globe loads.
 *
 * What makes it read as a sphere rather than a map glued to a ball,
 * in order of how much each one matters:
 *
 *   1. NORMAL MAP   — real terrain relief. Mountains catch the sun
 *                     and fall into their own shadow. This is the
 *                     biggest one and no shading maths substitutes
 *                     for it.
 *   2. SPECULAR MAP — oceans glint, land does not. Without it the
 *                     whole surface is one material, which is
 *                     exactly what a printed map is.
 *   3. CLOUDS       — their own layer, their own drift, casting
 *                     shadow on the ground below.
 *   4. NIGHT LIGHTS — cities on the dark side.
 *   5. DAY ALBEDO   — the surface itself.
 *
 * Textures are NASA-derived, from the three.js examples set.
 */

const DEG = Math.PI / 180;

const MAPS = {
  day: "/images/earth/day.webp",
  night: "/images/earth/night.webp",
  spec: "/images/earth/spec.webp",
  normal: "/images/earth/normal.webp",
  clouds: "/images/earth/clouds.webp",
} as const;

/** Sub-solar point: the lat/lon where the sun is directly overhead. */
function sunDirection(now: Date): THREE.Vector3 {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = (now.getTime() - start) / 86_400_000;
  const lat = 23.44 * Math.sin(((360 / 365.24) * (dayOfYear - 81)) * DEG);

  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const lon = -15 * (utcHours - 12);

  const latR = lat * DEG;
  const lonR = lon * DEG;

  // Earth-fixed frame — the frame the texture itself is laid out in.
  return new THREE.Vector3(
    Math.cos(latR) * Math.sin(lonR),
    Math.sin(latR),
    Math.cos(latR) * Math.cos(lonR),
  ).normalize();
}

function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
  srgb: boolean,
): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (tex) => {
        // Colour maps are sRGB. Normal and specular carry data, not
        // colour — converting those would bend the values.
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.anisotropy = 8;
        tex.wrapS = THREE.RepeatWrapping; // clouds scroll in u
        tex.wrapT = THREE.ClampToEdgeWrapping;
        resolve(tex);
      },
      undefined,
      () => {
        console.warn(`[earth] texture failed: ${url}`);
        resolve(null);
      },
    );
  });
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
      return; // No WebGL. The drawn fallback stays.
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

    // ── Starfield ─────────────────────────────────────────────
    const STAR_COUNT = 5200;
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starSize = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
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
      uniforms: { uTime: { value: 0 }, uWarp: { value: 0 }, uAspect: { value: 1 } },
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
          float d = -mv.z;
          vFade = smoothstep(0.0, 60.0, d) * (1.0 - smoothstep(260.0, 420.0, d));
          vSeed = aSize;
          vWarp = uWarp;

          vec4 clip = projectionMatrix * mv;

          // Stars stream radially out from the vanishing point, so
          // the streak lies along that radius. Aspect correction
          // keeps the angle true on a wide monitor.
          vec2 ndc = clip.xy / max(clip.w, 0.0001);
          vec2 radial = ndc * vec2(uAspect, 1.0);
          vDir = length(radial) > 0.0001 ? normalize(radial) : vec2(0.0, 1.0);

          float near = 1.0 - smoothstep(0.0, 200.0, d);
          vStretch = 1.0 + uWarp * (1.6 + near * 5.4);

          // Square sprite, so it must grow by the full stretch or
          // the streak clips at its own edge. Clamped because
          // drivers cap point size and truncate silently past it.
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
          // PointCoord is y-down; flip into the frame vDir uses.
          vec2 p = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y);

          float along  = dot(p, vDir) / vStretch;
          float across = p.x * vDir.y - p.y * vDir.x;

          float r = length(vec2(along, across));
          if (r > 0.5) discard;

          float core = smoothstep(0.5, 0.0, r);
          float tw = mix(0.75 + 0.25 * sin(uTime * 1.6 + vSeed * 31.0), 1.0, vWarp);

          // White. The cool/warm scatter is what stops a white
          // field from looking printed.
          vec3 tint = mix(vec3(0.72, 0.80, 1.0), vec3(1.0, 0.93, 0.82), fract(vSeed * 7.3));
          tint = mix(tint, vec3(1.0), vWarp * 0.5);

          gl_FragColor = vec4(tint, core * core * vFade * tw * (1.0 + vWarp * 0.9));
        }
      `,
    });

    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── Earth ─────────────────────────────────────────────────
    const blank = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    blank.needsUpdate = true;

    const uniforms = {
      uDay: { value: blank as THREE.Texture },
      uNight: { value: blank as THREE.Texture },
      uSpec: { value: blank as THREE.Texture },
      uNormal: { value: blank as THREE.Texture },
      uClouds: { value: blank as THREE.Texture },
      uHasDay: { value: 0 },
      uHasSpec: { value: 0 },
      uHasNormal: { value: 0 },
      uHasClouds: { value: 0 },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uCloudShift: { value: 0 },
    };

    const earthMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vT;
        varying vec3 vB;
        varying vec3 vView;

        void main() {
          vUv = uv;

          /**
           * Tangent frame, derived rather than looked up.
           *
           * On a UV sphere, east is always perpendicular to both
           * the pole axis and the surface normal — so there is no
           * need for a tangent attribute on the geometry.
           */
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vec3 poleAxis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
          vec3 t = normalize(cross(poleAxis, n));
          vN = n;
          vT = t;
          vB = cross(n, t);

          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uDay;
        uniform sampler2D uNight;
        uniform sampler2D uSpec;
        uniform sampler2D uNormal;
        uniform sampler2D uClouds;
        uniform float uHasDay;
        uniform float uHasSpec;
        uniform float uHasNormal;
        uniform float uHasClouds;
        uniform vec3  uSun;
        uniform float uCloudShift;

        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vT;
        varying vec3 vB;
        varying vec3 vView;

        void main() {
          vec3 L = normalize(uSun);

          /**
           * Relief.
           *
           * This is why it stops looking like a printed map.
           * Without a normal map every pixel shares one surface
           * angle, so the terminator is a clean arc and mountains
           * are brown paint. With it the Andes and the Himalayas
           * catch light on one flank and fall into shadow on the
           * other, and the sweep of the terminator breaks up the
           * way it does from orbit.
           */
          vec3 nTex = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
          vec3 bumped = normalize(vT * nTex.x + vB * nTex.y + vN * nTex.z);
          vec3 N = normalize(mix(vN, bumped, uHasNormal * 0.85));

          float ndl = dot(N, L);
          // Wrapped diffuse: softens the terminator instead of
          // cutting a hard line across the sphere.
          float diff = max(0.0, (ndl + 0.12) / 1.12);
          float night = smoothstep(0.12, -0.16, dot(vN, L));

          // ── Surface ────────────────────────────────────────
          vec3 albedo = mix(vec3(0.07, 0.11, 0.18), texture2D(uDay, vUv).rgb, uHasDay);
          vec3 lit = albedo * pow(diff, 1.3) * 1.25;

          /**
           * Ocean glint. The spec map is white over water and black
           * over land, so the sea answers the sun and the
           * continents don't. One surface behaving as two materials
           * is most of what separates a planet from a ball with a
           * picture on it.
           */
          vec3 H = normalize(L + vView);
          float water = mix(0.0, texture2D(uSpec, vUv).r, uHasSpec);
          float gloss = pow(max(dot(N, H), 0.0), 58.0) * water * 1.5;
          lit += vec3(0.85, 0.92, 1.0) * gloss * step(0.0, ndl);

          // ── Cities ─────────────────────────────────────────
          /**
           * The source composite carries a dim blue-grey wash over
           * the entire globe — atmosphere in the original plate.
           * Boosted for the night side that wash becomes a purple
           * haze sitting on the oceans, which reads as fog on a
           * lens rather than a dark planet. So the floor comes off
           * before the lights are amplified: only what is actually
           * brighter than the wash survives.
           */
          vec3 lights = max(texture2D(uNight, vUv).rgb - vec3(0.15, 0.14, 0.23), 0.0) * 1.9;
          float lum = dot(lights, vec3(0.299, 0.587, 0.114));
          vec3 sodium = lights * vec3(1.25, 0.95, 0.58) * 2.6
                      + vec3(1.0, 0.76, 0.4) * smoothstep(0.02, 0.32, lum) * 1.1;

          // ── Clouds ─────────────────────────────────────────
          // Scrolled in u on their own clock, so weather moves
          // independently of the planet underneath it.
          vec2 cuv = vec2(fract(vUv.x + uCloudShift), vUv.y);
          float cloud = texture2D(uClouds, cuv).r * uHasClouds;

          // Shadow: sample the cloud layer offset toward the sun
          // and darken the ground under it. Without this the cloud
          // floats with nothing holding it down.
          vec2 soff = vec2(L.x, L.y) * 0.006;
          float shade = texture2D(uClouds, fract(cuv + soff)).r * uHasClouds;

          vec3 ground = lit * (1.0 - shade * 0.5) * (1.0 - night)
                      + sodium * night * (1.0 - cloud * 0.72);

          vec3 cloudCol = mix(vec3(0.05, 0.07, 0.11), vec3(0.98, 0.98, 1.0),
                              pow(max(0.0, (ndl + 0.4) / 1.4), 1.4));

          vec3 col = mix(ground, cloudCol, cloud * 0.85);

          // ── Limb ───────────────────────────────────────────
          // Steep falloff at the edge. This and the relief are what
          // give the silhouette its curve.
          float facing = max(dot(vN, vView), 0.0);
          col *= 0.44 + 0.56 * pow(facing, 0.5);

          // Warm band along the terminator.
          float band = smoothstep(0.30, 0.0, abs(dot(vN, L)));
          col += vec3(0.95, 0.52, 0.2) * band * 0.16;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), earthMat);

    /**
     * Longitude facing the camera, driven by scroll.
     *
     * A continuous spin always eventually parks over the Pacific, a
     * third of the planet that is nothing but water. No speed
     * avoids it — only longitudes do. So scroll maps to longitude
     * across an arc that skips it: the hero opens over the
     * Americas, the closer lands on Europe and Africa.
     */
    const LON_TOP = -100;
    const LON_END = 45;
    const lonToRotY = (lon: number) => -Math.PI / 2 - lon * DEG;

    earth.rotation.order = "YXZ";
    earth.rotation.x = 0.42; // northern hemisphere toward the viewer
    earth.rotation.y = lonToRotY(LON_TOP);
    scene.add(earth);

    // ── Atmosphere ────────────────────────────────────────────
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { uSun: uniforms.uSun },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSun;
        varying vec3 vNormal;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 3.0);
          float lit = smoothstep(-0.35, 0.55, dot(normalize(vNormal), normalize(uSun)));
          vec3 col = mix(vec3(0.26, 0.44, 0.78), vec3(1.0, 0.56, 0.2), lit);
          gl_FragColor = vec4(col, fres * (0.22 + lit * 0.9));
        }
      `,
    });

    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.055, 64, 64), atmoMat);
    scene.add(atmosphere);

    // ── Load the maps ─────────────────────────────────────────
    const loader = new THREE.TextureLoader();

    // Day and night first — those two alone are a complete planet.
    // Relief, gloss and weather fill in behind them, so a slow
    // connection degrades in quality rather than to nothing.
    Promise.all([
      loadTexture(loader, MAPS.day, true),
      loadTexture(loader, MAPS.night, true),
    ]).then(([day, night]) => {
      if (disposed) return;
      if (day) {
        uniforms.uDay.value = day;
        uniforms.uHasDay.value = 1;
      }
      if (night) uniforms.uNight.value = night;
      if (day || night) setReady(true);

      return Promise.all([
        loadTexture(loader, MAPS.spec, false),
        loadTexture(loader, MAPS.normal, false),
        loadTexture(loader, MAPS.clouds, true),
      ]).then(([spec, normal, clouds]) => {
        if (disposed) return;
        if (spec) {
          uniforms.uSpec.value = spec;
          uniforms.uHasSpec.value = 1;
        }
        if (normal) {
          uniforms.uNormal.value = normal;
          uniforms.uHasNormal.value = 1;
        }
        if (clouds) {
          uniforms.uClouds.value = clouds;
          uniforms.uHasClouds.value = 1;
        }
      });
    });

    // ── Warp ──────────────────────────────────────────────────
    let warp = 0;
    let warpTarget = 0;
    const BASE_SPEED = 14;
    const WARP_SPEED = 460;
    const BASE_FOV = 38;

    let scrollEased = 0;
    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    function resize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // Offset the camera rather than the mesh, so the planet sits
      // right of the wordmark while the starfield stays centred.
      camera.setViewOffset(w, h, -w * 0.19, 0, w, h);
      camera.updateProjectionMatrix();
      starMat.uniforms.uAspect.value = w / Math.max(h, 1);
    }

    const clock = new THREE.Clock();
    let elapsed = 0;

    function animate() {
      if (disposed) return;
      frame = requestAnimationFrame(animate);

      // getElapsedTime() consumes the delta, so taking both in one
      // frame leaves you with zero. Take the delta and accumulate.
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;
      const t = elapsed;

      if (!reduced) {
        const k = warpTarget > warp ? 2.4 : 4.2;
        warp += (warpTarget - warp) * Math.min(1, k * dt);
        if (warp < 0.0004) warp = 0;
        const w = warp * warp * (3 - 2 * warp);

        const pos = starGeo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const speed = (BASE_SPEED + WARP_SPEED * w) * dt;
        for (let i = 2; i < arr.length; i += 3) {
          arr[i] += speed;
          if (arr[i] > 2) arr[i] = -420;
        }
        pos.needsUpdate = true;
        starMat.uniforms.uWarp.value = w;

        // Widening the lens as the stars accelerate: the planet
        // holds its size while space opens around it.
        const fov = BASE_FOV + w * 24;
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }

        scrollEased += (readScroll() - scrollEased) * Math.min(1, 2.6 * dt);
        const drift = Math.sin(t * 0.055) * 7;
        earth.rotation.y = lonToRotY(LON_TOP + (LON_END - LON_TOP) * scrollEased + drift);

        // Weather drifts slowly, independent of the planet's spin.
        uniforms.uCloudShift.value = (t * 0.0022) % 1;
      }

      starMat.uniforms.uTime.value = reduced ? 0 : t % 1000;

      /**
       * Sun direction.
       *
       * Computed in the earth-fixed frame the texture is laid out
       * in, then rotated by the mesh's own quaternion into world
       * space — which is the frame the shader's normals live in.
       * Done this way the terminator stays locked to real geography
       * however the globe is turned.
       */
      uniforms.uSun.value
        .copy(sunDirection(new Date()))
        .applyQuaternion(earth.quaternion);

      renderer.render(scene, camera);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    animate();

    // ── Hold to warp ──────────────────────────────────────────
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
    // pointercancel fires when a touch becomes a scroll — without
    // it the warp would stick on after every swipe.
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
      blank.dispose();
      uniforms.uDay.value?.dispose();
      uniforms.uNight.value?.dispose();
      uniforms.uSpec.value?.dispose();
      uniforms.uNormal.value?.dispose();
      uniforms.uClouds.value?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className={`globe-gl${ready ? " is-ready" : ""}`} aria-hidden="true" />;
}
