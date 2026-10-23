// Malé pomocníky nad WebGL2: překlad programů, render targety, kreslení přes celou plochu.
import { VS } from './glsl';

export interface Prog { p: WebGLProgram; locs: Record<string, WebGLUniformLocation> }
export interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }
export type Uniform = number | number[] | Float32Array | { arr: Float32Array };

export class GlError extends Error {}

export class Gl {
  readonly gl: WebGL2RenderingContext;
  readonly float16: boolean;
  /** 1×1 průhledná textura pro nepoužité samplery (zabrání smyčce čtení/zápisu do téhož bufferu). */
  readonly dummy: WebGLTexture;
  private vs: WebGLShader;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.float16 = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vs = this.compile(gl.VERTEX_SHADER, VS, 'vs');
    this.dummy = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.dummy);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  compile(type: number, src: string, label: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || 'neznámá chyba';
      gl.deleteShader(sh);
      throw new GlError(`[${label}] ${log}`);
    }
    return sh;
  }

  /** Přeloží program. Při chybě vyhodí GlError — volající si ponechá starý program. */
  program(fsSrc: string, label: string): Prog {
    const gl = this.gl;
    const fs = this.compile(gl.FRAGMENT_SHADER, fsSrc, label);
    const p = gl.createProgram()!; gl.attachShader(p, this.vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p); gl.deleteProgram(p);
      throw new GlError(`[${label}] link: ${log}`);
    }
    const locs: Record<string, WebGLUniformLocation> = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)!;
      locs[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name)!;
    }
    return { p, locs };
  }

  target(w: number, h: number): Target {
    const gl = this.gl;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
    // RGBA16F: víc přesnosti pro stopy a glow; když grafika neumí, RGBA8.
    if (this.float16) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new GlError('Framebuffer není kompletní');
    const t = { tex, fb, w, h };
    this.clear(t);
    return t;
  }

  deleteTarget(t: Target | null | undefined) {
    if (!t) return;
    this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fb);
  }

  clear(t: Target | null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Nakreslí program přes celý target (null = obrazovka o velikosti screenW×screenH). */
  draw(prog: Prog, target: Target | null, uniforms: Record<string, Uniform>, textures: Record<string, WebGLTexture> = {}, screenW = 0, screenH = 0) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : screenW, target ? target.h : screenH);
    const L = prog.locs;
    for (const k in uniforms) {
      const loc = L[k]; if (!loc) continue;
      const v = uniforms[k];
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if ('arr' in v) gl.uniform1fv(loc, v.arr);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else if (v.length === 4) gl.uniform4fv(loc, v);
    }
    let unit = 0;
    for (const k in textures) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[k]);
      const loc = L[k]; if (loc) gl.uniform1i(loc, unit);
      unit++;
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
