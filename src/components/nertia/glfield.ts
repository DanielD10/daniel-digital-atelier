/**
 * GLField — the shader half of the effect engine.
 *
 * Particles are good at *where* (they carry the physics: fire trails
 * behind a runner, mist rolls off a hem) and bad at *what*: stacked
 * soft sprites read as puffs, not flame. So effects draw their
 * particles as a soft white density mask on a small 2D canvas, and a
 * fragment shader turns that mask into the real material — licking,
 * flickering fire or wispy volumetric fog — using noise that flows
 * with the air.
 *
 * One WebGL context for the whole page (browsers cap them), shared by
 * every effect. If WebGL isn't there, `get()` returns null and each
 * effect falls back to its 2D drawing.
 */

import type { Vec } from "./effects";

const VERT = `
attribute vec2 a;
varying vec2 v;
void main() {
  v = a * 0.5 + 0.5;
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const NOISE = `
precision highp float;
varying vec2 v;
uniform sampler2D u_mask;
uniform vec2 u_res;
uniform float u_t;
uniform float u_size;
uniform float u_alpha;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
// pixel position in render space, top-left origin like a 2D canvas
vec2 px() { return vec2(v.x, 1.0 - v.y) * u_res; }
float mask(vec2 p) { return texture2D(u_mask, p / u_res).r; }
`;

/*
 * FIRE. The mask is heat. Two layers of noise flow along the flame
 * direction: a slow one bends whole tongues sideways, a fast one tears
 * the edges. The lookup is pushed back against the flow, so heat is
 * dragged out of the source into licking tips. Temperature maps
 * through a blackbody-ish ramp; the Heat Shift palette cools to
 * magenta at the tips instead of red.
 */
const FIRE = `${NOISE}
uniform vec2 u_dir;
uniform float u_pal;
uniform vec2 u_center;
uniform float u_radial;

vec3 ramp(float T) {
  vec3 tip = mix(vec3(0.75, 0.08, 0.03), vec3(0.85, 0.12, 0.45), u_pal);
  vec3 c = mix(tip * 0.5, tip, smoothstep(0.1, 0.3, T));
  c = mix(c, vec3(1.0, 0.36, 0.07), smoothstep(0.28, 0.55, T));
  c = mix(c, vec3(1.0, 0.64, 0.16), smoothstep(0.5, 0.8, T));
  c = mix(c, vec3(1.0, 0.88, 0.5), smoothstep(0.78, 1.05, T));
  c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(1.05, 1.4, T));
  return c;
}

void main() {
  vec2 p = px();
  vec2 D;
  float n1;
  float n2;
  if (u_radial > 0.5) {
    // flames lick outward from a centre (a corona). The noise is
    // sampled on the direction vector, so it has no seam all the way
    // around, and flows outward with radius.
    vec2 d = p - u_center;
    float rad = length(d);
    D = d / max(rad, 0.001);
    float s = rad / u_size;
    n1 = fbm(D * 2.4 + vec2(0.71, 0.7) * (s * 0.9 - u_t * 1.8));
    n2 = fbm(D * 6.0 + n1 * 1.4 + vec2(0.7, 0.71) * (s * 2.2 - u_t * 4.0));
  } else {
    D = normalize(u_dir);
    vec2 P0 = vec2(-D.y, D.x);
    vec2 q = vec2(dot(p, P0), dot(p, D)) / u_size;
    n1 = fbm(vec2(q.x * 1.6, q.y * 0.9 - u_t * 2.2));
    n2 = fbm(vec2(q.x * 3.6 + n1 * 1.4, q.y * 2.2 - u_t * 4.4));
  }
  vec2 P = vec2(-D.y, D.x);
  vec2 off = P * (n1 - 0.5) * u_size * 0.38;
  // smear heat along the flame direction: each blob becomes a tongue
  float h = 0.0;
  float j = hash(p * 0.37 + fract(u_t * 7.0));
  for (int k = 0; k < 8; k++) {
    // jittered per pixel so the taps blend instead of banding
    float fk = (float(k) + j) / 8.0;
    vec2 sp = p + off - D * u_size * 0.42 * fk * (0.6 + n2);
    h = max(h, mask(sp) * (1.0 - fk * 0.65));
  }
  float T = h * (0.72 + 0.62 * n2) - (1.0 - n1) * 0.16;
  T = clamp(T, 0.0, 1.5);
  float a = smoothstep(0.12, 0.42, T);
  gl_FragColor = vec4(ramp(T) * a, a) * u_alpha;
}`;

/*
 * FOG. The mask is density. Domain-warped noise gives it wisps and
 * holes that drift with the flow; three colors shade it so pearl mist
 * shifts pink and mint, nebula shifts violet and teal.
 */
const FOG = `${NOISE}
uniform vec2 u_flow;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_detail;

void main() {
  vec2 p = px();
  vec2 q = p / u_size;
  vec2 drift = u_flow * u_t;
  vec2 w = vec2(
    fbm(q * 0.9 - drift * 0.35 + vec2(0.0, u_t * 0.12)),
    fbm(q * 0.9 + vec2(5.2, 1.3) - drift * 0.3 - vec2(u_t * 0.1, 0.0))
  );
  float n = fbm(q * u_detail + w * 2.4 - drift * 0.5);
  float d = mask(p + (w - 0.5) * u_size * 0.6);
  float dens = d * smoothstep(0.28, 0.85, n + d * 0.35);
  vec3 col = mix(u_c1, u_c2, smoothstep(0.35, 0.7, w.x));
  col = mix(col, u_c3, smoothstep(0.55, 0.9, n));
  float a = clamp(dens, 0.0, 1.0) * u_alpha;
  gl_FragColor = vec4(col * a, a);
}`;

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

const hexVec = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export class GLField {
  private static inst: GLField | null | undefined;

  readonly out: HTMLCanvasElement;
  readonly mask: HTMLCanvasElement;
  readonly m: CanvasRenderingContext2D;
  private gl: WebGLRenderingContext;
  private tex: WebGLTexture;
  private fire: Prog;
  private fog: Prog;
  private lost = false;
  /** render scale relative to the stage canvas; set by begin() */
  res = 0.5;

  /** The shared field, or null when WebGL isn't available. */
  static get(): GLField | null {
    if (GLField.inst !== undefined) return GLField.inst?.lost ? null : GLField.inst;
    try {
      GLField.inst = new GLField();
    } catch {
      GLField.inst = null;
    }
    return GLField.inst;
  }

  private constructor() {
    this.out = document.createElement("canvas");
    this.mask = document.createElement("canvas");
    this.m = this.mask.getContext("2d")!;
    const gl = this.out.getContext("webgl", {
      premultipliedAlpha: true,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("no webgl");
    this.gl = gl;
    this.out.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.fire = this.program(FIRE, [
      "u_mask", "u_res", "u_t", "u_size", "u_alpha", "u_dir", "u_pal", "u_center", "u_radial",
    ]);
    this.fog = this.program(FOG, [
      "u_mask", "u_res", "u_t", "u_size", "u_alpha", "u_flow", "u_c1", "u_c2", "u_c3", "u_detail",
    ]);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private program(frag: string, names: string[]): Prog {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    const u: Prog["u"] = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  /**
   * Starts a pass: sizes the mask to the stage at a fraction of its
   * resolution, clears it, and returns it scaled so effects draw in
   * stage pixels. Low resolution is a feature: fire and fog are soft,
   * and it keeps phones fast.
   */
  begin(W: number, H: number): CanvasRenderingContext2D {
    this.res = Math.max(0.3, Math.min(0.6, 760 / Math.max(W, H)));
    const w = Math.max(2, Math.ceil(W * this.res));
    const h = Math.max(2, Math.ceil(H * this.res));
    if (this.mask.width !== w || this.mask.height !== h) {
      this.mask.width = w;
      this.mask.height = h;
    }
    const m = this.m;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalAlpha = 1;
    m.globalCompositeOperation = "source-over";
    m.clearRect(0, 0, w, h);
    m.setTransform(this.res, 0, 0, this.res, 0, 0);
    m.globalCompositeOperation = "lighter";
    return m;
  }

  private run(prog: Prog, set: (u: Prog["u"]) => void): HTMLCanvasElement {
    const gl = this.gl;
    const w = this.mask.width;
    const h = this.mask.height;
    if (this.out.width !== w || this.out.height !== h) {
      this.out.width = w;
      this.out.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog.p);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.mask);
    gl.uniform1i(prog.u.u_mask, 0);
    gl.uniform2f(prog.u.u_res, w, h);
    set(prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.out;
  }

  /**
   * Renders the mask as fire. `dir` is the way the flames lick (screen
   * space, need not be unit), `size` the emitter scale in stage px.
   */
  renderFire(o: {
    t: number;
    dir: Vec;
    size: number;
    alpha?: number;
    palette?: "heat" | "lava";
    /** lick outward from this stage-space point instead of along `dir` */
    center?: Vec;
  }) {
    const gl = this.gl;
    return this.run(this.fire, (u) => {
      gl.uniform1f(u.u_t, o.t);
      gl.uniform1f(u.u_size, Math.max(4, o.size * this.res));
      gl.uniform1f(u.u_alpha, o.alpha ?? 1);
      gl.uniform2f(u.u_dir, o.dir.x, o.dir.y);
      gl.uniform1f(u.u_pal, o.palette === "lava" ? 0 : 1);
      gl.uniform2f(u.u_center, (o.center?.x ?? 0) * this.res, (o.center?.y ?? 0) * this.res);
      gl.uniform1f(u.u_radial, o.center ? 1 : 0);
    });
  }

  /** Renders the mask as fog in three colors, drifting with `flow`. */
  renderFog(o: {
    t: number;
    flow: Vec;
    size: number;
    colors: [string, string, string];
    alpha?: number;
    detail?: number;
  }) {
    const gl = this.gl;
    return this.run(this.fog, (u) => {
      gl.uniform1f(u.u_t, o.t);
      gl.uniform1f(u.u_size, Math.max(4, o.size * this.res));
      gl.uniform1f(u.u_alpha, o.alpha ?? 1);
      gl.uniform2f(u.u_flow, o.flow.x, o.flow.y);
      gl.uniform3fv(u.u_c1, hexVec(o.colors[0]));
      gl.uniform3fv(u.u_c2, hexVec(o.colors[1]));
      gl.uniform3fv(u.u_c3, hexVec(o.colors[2]));
      gl.uniform1f(u.u_detail, o.detail ?? 2.2);
    });
  }
}
