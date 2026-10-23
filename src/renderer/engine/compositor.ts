// Kompozitor: každá vrstva se kreslí do vlastního bufferu (RGBA16F, premultiplied alfa),
// pak se vrstvy skládají přes sebe, přidá se glow a výsledek jde na obrazovku.
// Pravidla výkonu: vypnutá vrstva se nekreslí, buffery se alokují jen při změně, ne každý snímek.
import type { AppState, AudioFrame, ClipParams, ContentItem, ShaderHeader } from '../../shared/types';
import { LAYER_COUNT, activeClip } from '../../shared/types';
import { parseShaderHeader, hexToRgb } from '../../shared/shader-header';
import { Gl, GlError, type Prog, type Target, type Uniform } from './gl';
import { buildElementSource, FS_COPY, FS_VIDEO, FS_DOWN, FS_BLUR, FS_FINAL } from './glsl';
import { LayerRuntime } from './layer-runtime';
import { GpuTimer } from './gpu-timer';

interface ShaderEntry { prog: Prog; header: ShaderHeader; colA: number[]; colB: number[] }

class VideoSource {
  el: HTMLVideoElement;
  tex: WebGLTexture;
  dirty = false;
  w = 0; h = 0;
  constructor(private gl: WebGL2RenderingContext, url: string) {
    const v = document.createElement('video');
    v.src = url; v.loop = true; v.muted = true; v.playsInline = true; v.preload = 'auto';
    this.el = v;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const onFrame = () => { this.dirty = true; v.requestVideoFrameCallback(onFrame); };
    v.requestVideoFrameCallback(onFrame);
  }
  /** Nahraje nový snímek jen když dekodér nějaký vydal (ne každý snímek výstupu). */
  upload() {
    if (!this.dirty || this.el.readyState < 2) return;
    this.dirty = false;
    const gl = this.gl, v = this.el;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); // premultiplikujeme sami v shaderu
    if (v.videoWidth !== this.w || v.videoHeight !== this.h) {
      this.w = v.videoWidth; this.h = v.videoHeight;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
    }
  }
  setPlaying(on: boolean) {
    if (on && this.el.paused) this.el.play().catch(() => { /* zkusí znovu příští snímek */ });
    if (!on && !this.el.paused) this.el.pause();
  }
  dispose() { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); this.gl.deleteTexture(this.tex); }
}

interface LayerSlot {
  content: string;
  activeCol: number;
  // hodnoty klipu sloučené s hlavičkou shaderu (přepočítají se jen při změně)
  viewParams: ClipParams | null; viewSh: ShaderEntry | null;
  d: ShaderHeader['defaults']; colA: number[]; colB: number[];
  scale: number;
  a: Target | null;
  b: Target | null;       // druhý buffer pro stopy (feedback)
  rt: LayerRuntime;
  video: VideoSource | null;
  needClear: boolean;
  uni: Record<string, Uniform>;
  xf: Float32Array;
  fit: Float32Array;
  res: Float32Array;
  copyUni: { uRes: Float32Array; uMul: number };
}

export class Compositor {
  readonly g: Gl;
  readonly timer: GpuTimer;
  private shaders = new Map<string, ShaderEntry>();
  private sources = new Map<string, string>();      // poslední úspěšně přeložený zdroj
  private items = new Map<string, ContentItem>();
  private layers: LayerSlot[] = [];
  private copy: Prog; private videoProg: Prog; private down: Prog; private blur: Prog; private final: Prog;
  private accum: Target | null = null;
  private g2: Target | null = null; private g4a: Target | null = null; private g4b: Target | null = null;
  private w = 0; private h = 0;
  private frame = 0;
  private state: AppState | null = null;
  readonly errors = new Map<string, string>();
  private resVec = new Float32Array(2);
  private u = { // předpřipravené uniformy pro společné průchody (bez alokací za snímek)
    down2: { uRes: new Float32Array(2), uSrcPx: new Float32Array(2) },
    down4: { uRes: new Float32Array(2), uSrcPx: new Float32Array(2) },
    blur: [0, 1, 2, 3].map(() => ({ uRes: new Float32Array(2), uDir: new Float32Array(2) })),
    final: { uRes: new Float32Array(2), uGlowAmt: 0, uGate: 1 },
  };

  constructor(readonly canvas: HTMLCanvasElement, private withVideo = true) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false, alpha: false, desynchronized: false, powerPreference: 'high-performance' });
    if (!gl) throw new GlError('WebGL2 není k dispozici.');
    this.g = new Gl(gl);
    this.timer = new GpuTimer(gl, LAYER_COUNT + 1);
    this.copy = this.g.program(FS_COPY, 'copy');
    this.videoProg = this.g.program(FS_VIDEO, 'video');
    this.down = this.g.program(FS_DOWN, 'down');
    this.blur = this.g.program(FS_BLUR, 'blur');
    this.final = this.g.program(FS_FINAL, 'final');
    for (let i = 0; i < LAYER_COUNT; i++) this.layers.push(this.newSlot());
  }

  get gpuName(): string {
    const gl = this.g.gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  private newSlot(): LayerSlot {
    const res = new Float32Array(2), xf = new Float32Array([0, 0, 1, 0]);
    return {
      content: '', activeCol: -1, viewParams: null, viewSh: null, d: { ...VIDEO_DEFAULTS }, colA: [1, 1, 1], colB: [1, 1, 1],
      scale: 1, a: null, b: null, rt: new LayerRuntime(), video: null, needClear: true,
      uni: {}, xf, fit: new Float32Array([1, 1]), res, copyUni: { uRes: new Float32Array(2), uMul: 1 },
    };
  }

  /** Načte/aktualizuje obsah. Shader, který se nepřeloží, ponechá starou verzi a hlásí chybu. */
  setContent(items: ContentItem[]) {
    this.items = new Map(items.map(i => [i.id, i]));
    for (const it of items) {
      if (it.kind !== 'shader' || !it.source) continue;
      if (this.sources.get(it.id) === it.source) continue;
      try {
        const { header, body } = parseShaderHeader(it.source);
        const prog = this.g.program(buildElementSource(body, header.params), it.file);
        const old = this.shaders.get(it.id);
        if (old) this.g.gl.deleteProgram(old.prog.p);
        this.shaders.set(it.id, { prog, header, colA: hexToRgb(header.defaults.colA), colB: hexToRgb(header.defaults.colB) });
        this.sources.set(it.id, it.source);
        this.errors.delete(it.id);
        // Zahřátí: jeden tah do malého bufferu, aby první zapnutí naživo necuklo.
        const tmp = this.g.target(4, 4);
        this.g.draw(prog, tmp, { uRes: [4, 4] }, { uPrev: this.g.dummy });
        this.g.deleteTarget(tmp);
      } catch (e) {
        this.errors.set(it.id, (e as Error).message);
      }
    }
    // Vrstvy, jejichž obsah zmizel nebo se změnil na disku, si znovu sáhnou pro zdroj.
    for (const L of this.layers) if (L.content && !this.items.has(L.content)) this.assign(L, '');
  }

  setState(s: AppState) { this.state = s; }

  /** Velikost výstupu. Buffery se přealokují jen při změně. */
  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    const g = this.g;
    g.deleteTarget(this.accum); g.deleteTarget(this.g2); g.deleteTarget(this.g4a); g.deleteTarget(this.g4b);
    this.accum = g.target(w, h);
    this.g2 = g.target(w / 2, h / 2);
    this.g4a = g.target(w / 4, h / 4);
    this.g4b = g.target(w / 4, h / 4);
    for (const L of this.layers) { g.deleteTarget(L.a); g.deleteTarget(L.b); L.a = L.b = null; }
    const u = this.u;
    u.down2.uRes.set([this.g2.w, this.g2.h]); u.down2.uSrcPx.set([1 / w, 1 / h]);
    u.down4.uRes.set([this.g4a.w, this.g4a.h]); u.down4.uSrcPx.set([1 / this.g2.w, 1 / this.g2.h]);
    const qw = this.g4a.w, qh = this.g4a.h;
    const spreads = [[1.0 / qw, 0], [0, 1.0 / qh], [2.0 / qw, 0], [0, 2.0 / qh]];
    u.blur.forEach((b, i) => { b.uRes.set([qw, qh]); b.uDir.set(spreads[i]); });
    u.final.uRes.set([w, h]);
    this.resVec.set([w, h]);
  }

  private assign(L: LayerSlot, content: string) {
    if (L.content === content) return;
    L.content = content;
    L.video?.dispose(); L.video = null;
    L.rt = new LayerRuntime();
    L.uni = {};
    L.viewParams = null; L.viewSh = null; L.activeCol = -1;
    L.needClear = true;
    const it = this.items.get(content);
    if (it?.kind === 'video' && it.url && this.withVideo) L.video = new VideoSource(this.g.gl, it.url);
  }

  private ensureTargets(L: LayerSlot, feedback: boolean) {
    const w = Math.max(1, Math.round(this.w * L.scale)), h = Math.max(1, Math.round(this.h * L.scale));
    if (!L.a || L.a.w !== w || L.a.h !== h) {
      this.g.deleteTarget(L.a); this.g.deleteTarget(L.b); L.b = null;
      L.a = this.g.target(w, h); L.needClear = true;
      L.res[0] = w; L.res[1] = h;
    }
    if (feedback && !L.b) { L.b = this.g.target(w, h); L.needClear = true; }
  }

  /** Jeden snímek. dt v sekundách, now = čas od startu. */
  render(audio: AudioFrame, dt: number, now: number) {
    const s = this.state; if (!s || !this.accum) return;
    const g = this.g, gl = g.gl, T = this.timer;
    T.poll();
    gl.disable(gl.BLEND);
    let anyVisible = false;

    for (let i = 0; i < LAYER_COUNT; i++) {
      const L = this.layers[i], ls = s.layers[i];
      if (!ls) continue;
      const clip = activeClip(ls);
      const on = ls.on && !!clip;
      // Když klip dohraje (vypnutí), necháme ho doznít se stejným obsahem.
      if (clip) this.assign(L, clip.content);
      if (L.scale !== ls.scale) { L.scale = ls.scale; }
      const sh = this.shaders.get(L.content);
      if (clip && ls.active !== L.activeCol) { L.activeCol = ls.active; if (L.video) L.video.el.currentTime = 0; }
      if (clip) this.updateView(L, clip.params, sh ?? null);
      const valid = !!sh || !!L.video;
      L.rt.update(L.d, audio, on && valid, dt);
      L.video?.setPlaying(on || L.rt.fade > 0);
      if (!valid || (L.rt.fade <= 0 && !on)) { L.needClear = true; T.forget(i); continue; }

      T.begin(i);
      this.ensureTargets(L, !!sh?.header.feedback);
      if (sh) {
        const r = L.rt, d = L.d, u = L.uni;
        u.uRes = L.res; u.uTime = now; u.uFrame = this.frame; u.uHard = d.hard; u.uSpeed = d.speed;
        u.uDensity = d.density; u.uSize = d.size; u.uDrive = r.drive; u.uHit = r.hit; u.uSinceHit = r.sinceHit;
        u.uHitCount = r.hitCount; u.uPrevHitCount = r.prevHitCount; u.uLoud = audio.loud.v;
        u.uPhase = r.phase; u.uDPhase = r.dphase; u.uRot3D = 0; u.uRot3DAng = r.ang; u.uMirror = 0; u.uFade = r.fade;
        u.uColA = L.colA; u.uColB = L.colB; u.uXf = L.xf;
        if (!u.uHitAge) u.uHitAge = { arr: r.hitAges };
        if (sh.header.feedback && L.b) {
          if (L.needClear) { g.clear(L.a); g.clear(L.b); }
          g.draw(sh.prog, L.b, u, { uPrev: L.a!.tex });
          const t = L.a; L.a = L.b; L.b = t;
        } else {
          g.draw(sh.prog, L.a, u, { uPrev: g.dummy });
        }
        L.needClear = false;
      } else if (L.video) {
        L.video.upload();
        const v = L.video, la = L.res[0] / L.res[1], va = v.w && v.h ? v.w / v.h : la;
        if (va > la) { L.fit[0] = 1; L.fit[1] = la / va; } else { L.fit[0] = va / la; L.fit[1] = 1; }
        g.draw(this.videoProg, L.a, { uRes: L.res, uFit: L.fit }, { uTex: v.tex });
        L.needClear = false;
      }
      T.end();
      anyVisible = true;
    }

    // Skládání vrstev (pořadí = číslo vrstvy, 1 je dole).
    T.begin(LAYER_COUNT);
    g.clear(this.accum);
    if (anyVisible) {
      gl.enable(gl.BLEND);
      for (let i = 0; i < LAYER_COUNT; i++) {
        const L = this.layers[i], ls = s.layers[i];
        if (!L.a || L.needClear || !ls) continue;
        const mul = L.rt.fade * ls.opacity;
        if (mul <= 0) continue;
        // Prolínání (vše v premultiplied alfě): Normál = přes, Add = sečíst světlo, Screen = zesvětlit.
        if (ls.blend === 'add') gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        else if (ls.blend === 'screen') gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        L.copyUni.uRes = this.resVec; L.copyUni.uMul = mul;
        g.draw(this.copy, this.accum, L.copyUni, { uTex: L.a.tex });
      }
      gl.disable(gl.BLEND);
    }
    const glowOn = s.glow.on && s.glow.amount > 0 && anyVisible;
    if (glowOn) {
      g.draw(this.down, this.g2, this.u.down2, { uTex: this.accum.tex });
      g.draw(this.down, this.g4a, this.u.down4, { uTex: this.g2!.tex });
      g.draw(this.blur, this.g4b, this.u.blur[0], { uTex: this.g4a!.tex });
      g.draw(this.blur, this.g4a, this.u.blur[1], { uTex: this.g4b!.tex });
      g.draw(this.blur, this.g4b, this.u.blur[2], { uTex: this.g4a!.tex });
      g.draw(this.blur, this.g4a, this.u.blur[3], { uTex: this.g4b!.tex });
    }
    const f = this.u.final;
    f.uGlowAmt = glowOn ? s.glow.amount * 1.2 : 0;
    f.uGate = s.black ? 0 : 1;
    g.draw(this.final, null, f, { uEl: this.accum.tex, uGlow: this.g4a!.tex }, this.w, this.h);
    T.end();
    this.frame++;
  }

  /** Sloučí hodnoty klipu s hlavičkou shaderu; počítá se jen když se klip nebo shader změní. */
  private updateView(L: LayerSlot, p: ClipParams, sh: ShaderEntry | null) {
    if (L.viewParams === p && L.viewSh === sh) return;
    L.viewParams = p; L.viewSh = sh;
    const base = sh?.header.defaults ?? VIDEO_DEFAULTS;
    L.d = {
      drive: p.drive ?? base.drive, hard: p.hard ?? base.hard, speed: p.speed ?? base.speed,
      density: p.density ?? base.density, size: p.size ?? base.size, colA: p.colA ?? base.colA, colB: p.colB ?? base.colB,
    };
    L.colA = hexToRgb(L.d.colA); L.colB = hexToRgb(L.d.colB);
    for (const q of sh?.header.params ?? []) L.uni[q.name] = p.custom?.[q.name] ?? q.default;
  }

  layerGpuMs(i: number) { return this.timer.value(i); }

  dispose() {
    for (const L of this.layers) { L.video?.dispose(); this.g.deleteTarget(L.a); this.g.deleteTarget(L.b); }
  }
}

const VIDEO_DEFAULTS: ShaderHeader['defaults'] = { drive: 'none', hard: 0.5, speed: 1, density: 0, size: 1, colA: '#ffffff', colB: '#ffffff' };
