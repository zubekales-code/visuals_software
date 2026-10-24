// Náhled klipu = jeden snímek. Shader se vykreslí jednou do malého plátna, video se vezme snímek v 1. sekundě,
// 3D scéna se nechá chvilku běžet (s umělými údery) a vyfotí se.
// Výsledek je obrázek (data URL) v mezipaměti, takže mřížka nic nepřekresluje za běhu.
import type { AudioFrame, ClipParams, ContentItem } from '../shared/types';
import { CAM_DEFAULTS } from '../shared/types';
import { parseShaderHeader, hexToRgb } from '../shared/shader-header';
import { Gl, type Prog } from './engine/gl';
import { buildElementSource, FS_COPY } from './engine/glsl';
import { SceneHost, sceneRegistry } from './engine/scene-host';
import { LayerRuntime } from './engine/layer-runtime';

const W = 192, H = 108;

export class Thumbs {
  private canvas = document.createElement('canvas');
  private g: Gl | null = null;
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private progs = new Map<string, { src: string; prog: Prog; header: ReturnType<typeof parseShaderHeader>['header'] }>();
  private host: SceneHost | null = null;
  private sceneQueue: Promise<unknown> = Promise.resolve();
  /** Mezipaměť náhledů má strop (tažení posuvníkem dělá stovky variant). */
  private remember(key: string, url: string) {
    this.cache.set(key, url);
    while (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value as string);
  }
  private copyProg: Prog | null = null;

  constructor(private onRestored: () => void) {
    this.canvas.width = W; this.canvas.height = H;
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (gl) this.g = new Gl(gl);
    // Ztráta grafiky: náhledy, které se nestihly udělat, se zkusí znovu po obnově.
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.g = null; });
    this.canvas.addEventListener('webglcontextrestored', () => {
      if (gl) this.g = new Gl(gl);
      this.progs.clear(); this.host = null; this.copyProg = null;
      for (const [k, v] of this.cache) if (!v) this.cache.delete(k);
      this.onRestored();
    });
  }

  /** Vrátí obrázek hned, když je hotový; jinak ho začne připravovat a zavolá onReady. */
  get(item: ContentItem | undefined, params: ClipParams, onReady: () => void): string | null {
    if (!item) return null;
    // GLOW a STROBO náhled nemění (jsou to efekty nad hotovým obrazem) → nepřekreslovat kvůli nim.
    // 3D scéna je drahá (postaví se celá) → náhled jen podle barev, ne podle každého pohybu posuvníkem.
    const { glow: _g, strobe: _s, strobeMode: _m, ...look } = params;
    const lk = item.kind === 'scene' ? { colA: params.colA, colB: params.colB } : look;
    const key = item.id + '|' + (item.source?.length ?? 0) + '|' + JSON.stringify(lk);
    const hit = this.cache.get(key);
    // '' = náhled se nepovedl (rozbitý vizuál) — nezkoušet ho znovu pořád dokola (dřív to vytěžovalo pult)
    if (hit !== undefined) { this.cache.delete(key); this.cache.set(key, hit); return hit || null; } // naposledy použité na konec (LRU)
    if (!this.pending.has(key)) {
      if ((item.kind === 'shader' || item.kind === 'scene') && !this.g) return null; // grafika se obnovuje
      // 3D náhledy jeden po druhém s pauzou mezi nimi — pult mezitím reaguje (dřív se při startu na chvíli zasekl).
      const job: Promise<string> = item.kind === 'scene' ? this.sceneQueue.then(() => new Promise(r => setTimeout(r, 40))).then(() => this.scene(item, { colA: params.colA, colB: params.colB }))
        : item.kind === 'video' ? this.video(item) : new Promise<string>(res => res(this.shader(item, params)));
      if (item.kind === 'scene') this.sceneQueue = job.catch(() => '');
      const p = job
        .then(url => { this.remember(key, url); this.pending.delete(key); onReady(); return url; })
        .catch(() => { this.pending.delete(key); if (this.g) this.cache.set(key, ''); return ''; });
      this.pending.set(key, p);
    }
    return null;
  }

  private shader(item: ContentItem, p: ClipParams): string {
    const g = this.g; if (!g || !item.source) return '';
    let entry = this.progs.get(item.id);
    if (!entry || entry.src !== item.source) {
      const { header, body } = parseShaderHeader(item.source);
      entry = { src: item.source, prog: g.program(buildElementSource(body, header.params), item.file), header };
      this.progs.set(item.id, entry);
    }
    const d = { ...entry.header.defaults, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) };
    const ages = new Float32Array([0.15, 0.4, 0.65, 0.9, 1.2, 1.5, 1.8, 2.1]);
    const u: Record<string, any> = {
      uRes: [W, H], uTime: 2, uFrame: 37, uHard: d.hard, uSpeed: d.speed, uDensity: d.density, uSize: d.size,
      uDrive: 0.6, uHit: 0.6, uSinceHit: 0.12, uHitCount: 5, uPrevHitCount: 4, uLoud: 0.6, uPhase: 2.3, uDPhase: 0.4,
      uRot3D: 0, uRot3DAng: 0.5, uMirror: 0, uFade: 1, uColA: hexToRgb(d.colA), uColB: hexToRgb(d.colB),
      uXf: [0, 0, 1, 0], uHitAge: { arr: ages },
    };
    for (const q of entry.header.params ?? []) u[q.name] = p.custom?.[q.name] ?? q.default;
    g.clear(null);
    g.draw(entry.prog, null, u, { uPrev: g.dummy }, W, H);
    return this.canvas.toDataURL('image/png');
  }

  /** 3D scéna: 1,5 s simulace s úderem každých 12 snímků, pak jeden snímek. */
  private async scene(item: ContentItem, p: ClipParams): Promise<string> {
    const en = await sceneRegistry.ensure(item).ready;
    const g = this.g; if (!g || !en.def) return '';
    this.host ??= new SceneHost(g.gl, this.canvas);
    this.copyProg ??= g.program(FS_COPY, 'copy');
    const inst = this.host.create(en);
    try {
      if (!inst.run) return '';
      const hd = en.header?.defaults, d = { ...(hd ?? { drive: 'kick', hard: 0.3, speed: 1, density: 0.5, size: 0.5, colA: '#ffffff', colB: '#ffffff' }), ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as any;
      const hc = en.header?.camera;
      const cam = { ...CAM_DEFAULTS, ...(hc ? { orbit: hc.orbit, height: hc.height, dist: hc.dist, fov: hc.fov, spin: hc.spin, kick: hc.kick } : {}), ...(p.cam ?? {}) };
      const rt = new LayerRuntime();
      const fa: AudioFrame = { t: 0, kick: { v: 0, hit: false }, bass: { v: 0, hit: false }, high: { v: 0, hit: false }, loud: { v: 0.6, hit: false } };
      const [ar, ag, ab] = hexToRgb(d.colA), [br, bg, bb] = hexToRgb(d.colB);
      for (let k = 0; k < 45; k++) {
        const hit = k % 12 === 0;
        for (const b of [fa.kick, fa.bass, fa.high]) { b.hit = hit; b.v = hit ? 1 : b.v * 0.8; }
        rt.update(d, fa, true, 1 / 30);
        const f = inst.f;
        f.t = k / 30; f.frame = k; f.phase = rt.phase; f.dphase = rt.dphase; f.drive = rt.drive; f.hit = rt.hit;
        f.newHit = rt.framesSinceHit === 0; f.sinceHit = rt.sinceHit; f.hitCount = rt.hitCount; f.loud = 0.6;
        f.hard = d.hard; f.speed = d.speed; f.density = d.density; f.size = d.size;
        f.colA.setRGB(ar, ag, ab); f.colB.setRGB(br, bg, bb);
        inst.step(cam, 1 / 30, W, H);
      }
      const tex = this.host.render(inst, W, H);
      if (!tex) return '';
      g.clear(null);
      g.draw(this.copyProg, null, { uRes: [W, H], uMul: 1 }, { uTex: tex }, W, H);
      return this.canvas.toDataURL('image/png');
    } finally { this.host.release(inst); }
  }

  private video(item: ContentItem): Promise<string> {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = item.url!;
      const done = () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d')!;
        const va = v.videoWidth / v.videoHeight, ca = W / H;
        const w = va > ca ? W : H * va, h = va > ca ? W / va : H;
        ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
        resolve(c.toDataURL('image/png'));
        v.removeAttribute('src'); v.load();
      };
      v.addEventListener('loadeddata', () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); }, { once: true });
      v.addEventListener('seeked', done, { once: true });
      v.addEventListener('error', () => reject(new Error('video')), { once: true });
    });
  }
}
