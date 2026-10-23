// Náhled klipu = jeden snímek. Shader se vykreslí jednou do malého plátna, video se vezme snímek v 1. sekundě.
// Výsledek je obrázek (data URL) v mezipaměti, takže mřížka nic nepřekresluje za běhu.
import type { ClipParams, ContentItem } from '../shared/types';
import { parseShaderHeader, hexToRgb } from '../shared/shader-header';
import { Gl, type Prog } from './engine/gl';
import { buildElementSource } from './engine/glsl';

const W = 192, H = 108;

export class Thumbs {
  private canvas = document.createElement('canvas');
  private g: Gl | null = null;
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private progs = new Map<string, { src: string; prog: Prog; header: ReturnType<typeof parseShaderHeader>['header'] }>();

  constructor(private onRestored: () => void) {
    this.canvas.width = W; this.canvas.height = H;
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (gl) this.g = new Gl(gl);
    // Ztráta grafiky: náhledy, které se nestihly udělat, se zkusí znovu po obnově.
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.g = null; });
    this.canvas.addEventListener('webglcontextrestored', () => {
      if (gl) this.g = new Gl(gl);
      this.progs.clear();
      for (const [k, v] of this.cache) if (!v) this.cache.delete(k);
      this.onRestored();
    });
  }

  /** Vrátí obrázek hned, když je hotový; jinak ho začne připravovat a zavolá onReady. */
  get(item: ContentItem | undefined, params: ClipParams, onReady: () => void): string | null {
    if (!item) return null;
    const key = item.id + '|' + (item.source?.length ?? 0) + '|' + JSON.stringify(params);
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.pending.has(key)) {
      if (item.kind === 'shader' && !this.g) return null; // grafika se obnovuje
      const p = (item.kind === 'video' ? this.video(item) : new Promise<string>(res => res(this.shader(item, params))))
        .then(url => { this.cache.set(key, url); this.pending.delete(key); onReady(); return url; })
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
