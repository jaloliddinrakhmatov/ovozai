"use client";

import { useEffect, useRef } from "react";

/**
 * A dependency-free WebGL fragment-shader background: a slow, iridescent flowing
 * gradient built from fbm noise in the two brand-accent colours. Renders behind
 * the hero for a "cinematic" feel. Fails silently (renders nothing) when WebGL
 * is unavailable, and freezes a single frame when the user prefers reduced motion.
 */
const FRAG = `
precision highp float;
uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_c1;
uniform vec3 u_c2;

vec2 hash(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash(i + vec2(0.0,0.0)), f - vec2(0.0,0.0)),
                 dot(hash(i + vec2(1.0,0.0)), f - vec2(1.0,0.0)), u.x),
             mix(dot(hash(i + vec2(0.0,1.0)), f - vec2(0.0,1.0)),
                 dot(hash(i + vec2(1.0,1.0)), f - vec2(1.0,1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv; p.x *= u_res.x / u_res.y;
  float t = u_time * 0.04;
  float n1 = fbm(p * 2.2 + vec2(t, t * 0.6));
  float n2 = fbm(p * 3.1 - vec2(t * 0.7, t * 1.1));
  vec3 base = vec3(0.016, 0.019, 0.035);
  float m1 = smoothstep(0.05, 0.95, n1 + 0.15);
  float m2 = smoothstep(0.15, 0.9, n2 + 0.1);
  vec3 col = base;
  col += u_c1 * m1 * 0.24;
  col += u_c2 * m2 * 0.16;
  // soft top glow
  float g = smoothstep(1.1, 0.1, length(uv - vec2(0.5, 0.05)));
  col += u_c1 * g * 0.06;
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [0.39, 0.4, 0.95];
  const to = (h: string | undefined) => parseInt(h ?? "0", 16) / 255;
  return [to(m[1]), to(m[2]), to(m[3])];
}

export function ShaderCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uC1 = gl.getUniformLocation(prog, "u_c1");
    const uC2 = gl.getUniformLocation(prog, "u_c2");

    const styles = getComputedStyle(document.documentElement);
    const c1 = hexToRgb(styles.getPropertyValue("--lp-accent") || "#6366f1");
    const c2 = hexToRgb(styles.getPropertyValue("--lp-accent-2") || "#d946ef");
    gl.uniform3fv(uC1, c1);
    gl.uniform3fv(uC2, c2);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = true;
    const start = performance.now();
    const render = (now: number) => {
      if (!running) return;
      resize();
      gl.uniform1f(uTime, reduced ? 8 : (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        running = true;
        raf = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
      style={{ display: "block" }}
    />
  );
}
