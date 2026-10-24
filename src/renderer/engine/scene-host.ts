// 3D scény (Three.js) — nový druh obsahu vedle tvarů (.glsl) a videí.
// Scéna = soubor .js v knihovně (VISUALS SOFTWARE\knihovna\3d) s hlavičkou /*{ JSON }*/ a voláním vjScene({ create }).
// Kreslí se do vlastního bufferu se SDÍLENÝM WebGL kontextem kompozitoru (žádné druhé plátno, žádné kopie přes CPU):
// Three.js vykreslí scénu s průhledným pozadím → kompozitor ji zkopíruje do bufferu vrstvy (premultiplied alfa)
// a dál s ní zachází jako s každou jinou vrstvou (prolínání, GLOW, STROBO, průhlednost).
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { Cam3D, ContentItem, ShaderHeader } from '../../shared/types';
import { parseShaderHeader } from '../../shared/shader-header';

// Barvy z hlavičky a z pultu = přesně tytéž hodnoty jako u 2D tvarů (bez převodu barevného prostoru).
THREE.ColorManagement.enabled = false;

/** Doplňky Three.js dostupné scénám (tlusté čáry: tloušťka v pixelech). */
export const ADDONS = { LineSegments2, LineSegmentsGeometry, LineMaterial, Line2, LineGeometry };

/** Co scéna dostane každý snímek. Objekt se nealokuje znovu — scéna ho jen čte. */
export interface SceneFrame {
  t: number; dt: number; frame: number;
  phase: number; dphase: number;     // čas násobený OSCILACÍ a zvukem (jako uPhase u tvarů)
  drive: number; hit: number;        // síla zvolené části zvuku 0–1, záblesk úderu 1 → 0
  newHit: boolean; sinceHit: number; hitCount: number; loud: number;
  hard: number; speed: number; density: number; size: number;   // TVRDOST, OSCILACE, MNOŽSTVÍ, TLOUŠŤKA
  colA: THREE.Color; colB: THREE.Color;
  w: number; h: number;              // velikost bufferu vrstvy v pixelech
}
export interface SceneCtx { scene: THREE.Scene; root: THREE.Group; camera: THREE.PerspectiveCamera; addons: typeof ADDONS }
export interface SceneRun { update(f: SceneFrame): void; dispose?(): void }
export interface SceneDef { create(T: typeof THREE, ctx: SceneCtx): SceneRun }

export function newFrame(): SceneFrame {
  return { t: 0, dt: 0, frame: 0, phase: 0, dphase: 0, drive: 0, hit: 0, newHit: false, sinceHit: 9, hitCount: 0, loud: 0,
    hard: 0.3, speed: 1, density: 0.5, size: 0.5, colA: new THREE.Color(1, 1, 1), colB: new THREE.Color(1, 1, 1), w: 1, h: 1 };
}

// ---------- načítání souborů scén (jeden registr na okno) ----------
export interface SceneEntry { src: string; ver: number; def: SceneDef | null; header: ShaderHeader | null; error: string; ready: Promise<SceneEntry> }

class SceneRegistry {
  private entries = new Map<string, SceneEntry>();
  private byUrl = new Map<string, string>();
  private ver = 0;
  private pendingDef: SceneDef | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    // Soubor scény volá vjScene({...}) — zaregistruje se pod souborem, který se právě spouští.
    (window as any).vjScene = (def: SceneDef) => { this.pendingDef = def; };
    // Syntaktická chyba v souboru scény → zpráva do chyb (neshodí aplikaci).
    window.addEventListener('error', e => {
      const id = e.filename ? this.byUrl.get(e.filename) : undefined;
      const en = id ? this.entries.get(id) : undefined;
      if (en) en.error = `řádek ${e.lineno}: ${e.message}`;
    });
  }

  get(id: string) { return this.entries.get(id); }

  /** Nahraje scénu (nebo novou verzi, když se změnil text souboru). Vrací záznam, který se doplní po načtení. */
  ensure(item: ContentItem): SceneEntry {
    const old = this.entries.get(item.id);
    if (old && old.src === (item.source ?? '')) return old;
    const ver = ++this.ver;
    let header: ShaderHeader | null = null, error = '';
    try { header = parseShaderHeader(item.source ?? '').header; } catch (e) { error = (e as Error).message; }
    const en: SceneEntry = { src: item.source ?? '', ver, def: null, header, error, ready: Promise.resolve(null as unknown as SceneEntry) };
    // Do nahrání nové verze hraje stará (když se uložená změna nepovede, obraz nezmizí).
    if (old?.def) { en.def = old.def; en.ver = old.ver; }
    this.entries.set(item.id, en);
    en.ready = new Promise<SceneEntry>(resolve => {
      if (error || !item.url || typeof document === 'undefined') { resolve(en); return; }
      const url = `${item.url}?v=${ver}`;
      this.byUrl.set(url, item.id);
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => {
        const def = this.pendingDef; this.pendingDef = null;
        if (def && typeof def.create === 'function') { en.def = def; en.ver = ver; en.error = ''; }
        else if (!en.error) en.error = 'soubor nezavolal vjScene({ create(THREE, ctx) {…} })';
        s.remove(); this.byUrl.delete(url); resolve(en);
      };
      s.onerror = () => { en.error = 'soubor scény nejde načíst'; s.remove(); this.byUrl.delete(url); resolve(en); };
      document.head.append(s);
    });
    return en;
  }

  errors(): [string, string][] { return [...this.entries].filter(([, e]) => e.error).map(([id, e]) => [id, e.error]); }
}
export const sceneRegistry = new SceneRegistry();

// ---------- jedna běžící scéna ----------
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class SceneInstance {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 2000);
  readonly f = newFrame();
  run: SceneRun | null = null;
  error = '';
  az = 0;                       // úhel obletu kamery
  rt: THREE.WebGLRenderTarget | null = null;
  private target = new THREE.Vector3();
  constructor(readonly ver: number, readonly header: ShaderHeader | null) { this.scene.add(this.root); }

  /** Kamera podle posuvníků 3D KAMERA + krok scény. */
  step(cam: Cam3D, dt: number, w: number, h: number) {
    const hc = this.header?.camera, base = hc?.distance ?? 10, ty = hc?.targetY ?? 0;
    this.az += dt * cam.orbit * 0.9;
    this.root.rotation.y += dt * cam.spin * 1.6;
    const el = lerp(-0.25, 1.45, cam.height);
    const R = base * Math.pow(2, (cam.dist - 0.5) * 2.2) * (1 - cam.kick * 0.35 * this.f.hit);
    const c = this.camera;
    c.position.set(R * Math.cos(el) * Math.sin(this.az), ty + R * Math.sin(el), R * Math.cos(el) * Math.cos(this.az));
    c.fov = lerp(15, 95, cam.fov); c.aspect = w / Math.max(1, h);
    c.near = Math.max(0.01, R * 0.01); c.far = R * 20 + 200;
    c.updateProjectionMatrix();
    this.target.set(0, ty, 0); c.lookAt(this.target);
    this.f.w = w; this.f.h = h; this.f.dt = dt;
    if (!this.run) return;
    try { this.run.update(this.f); } catch (e) { this.fail(e); }
  }

  fail(e: unknown) { this.error = 'chyba ve scéně: ' + ((e as Error)?.message ?? String(e)); this.run = null; }
}

// ---------- hostitel: Three.js na sdíleném kontextu ----------
export class SceneHost {
  private renderer: THREE.WebGLRenderer | null = null;
  constructor(private gl: WebGL2RenderingContext, private canvas: HTMLCanvasElement) {}

  private r(): THREE.WebGLRenderer {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context: this.gl, antialias: false, depth: true });
      this.renderer.autoClear = true;
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.renderer.resetState();
    }
    return this.renderer;
  }

  /** Postaví scénu ze souboru. Chyba v kódu scény se zapíše do inst.error (obraz zbytku nespadne). */
  create(en: SceneEntry): SceneInstance {
    const inst = new SceneInstance(en.ver, en.header);
    if (!en.def) { inst.error = en.error || 'scéna není načtená'; return inst; }
    try {
      inst.run = en.def.create(THREE, { scene: inst.scene, root: inst.root, camera: inst.camera, addons: ADDONS });
      if (!inst.run || typeof inst.run.update !== 'function') throw new Error('create() musí vrátit { update(f) }');
    } catch (e) { inst.fail(e); }
    return inst;
  }

  /** Předpřeloží shadery scény (aby první spuštění naživo necuklo). */
  warm(inst: SceneInstance) {
    if (!inst.run) return;
    const r = this.r();
    try { r.resetState(); r.compile(inst.scene, inst.camera); } catch (e) { inst.fail(e); }
    r.resetState();
  }

  /** Vykreslí scénu s průhledným pozadím do vlastního bufferu; vrací jeho texturu (nebo null). */
  render(inst: SceneInstance, w: number, h: number): WebGLTexture | null {
    if (!inst.run) return null;
    const r = this.r();
    if (!inst.rt || inst.rt.width !== w || inst.rt.height !== h) {
      inst.rt?.dispose();
      inst.rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, depthBuffer: true, type: THREE.UnsignedByteType });
    }
    try {
      r.resetState();               // náš kompozitor mezitím měnil stav WebGL → Three.js musí zapomenout svou mezipaměť
      r.setRenderTarget(inst.rt);
      r.setClearColor(0x000000, 0);
      r.render(inst.scene, inst.camera);
      r.setRenderTarget(null);
    } catch (e) { inst.fail(e); }
    const tex = (r.properties.get(inst.rt.texture) as { __webglTexture?: WebGLTexture }).__webglTexture ?? null;
    r.resetState();                 // a vrátit WebGL do výchozího stavu pro kompozitor
    return tex;
  }

  /** Uvolní scénu (geometrie, materiály, textury, buffer). */
  release(inst: SceneInstance | null) {
    if (!inst) return;
    try { inst.run?.dispose?.(); } catch { /* chyba při úklidu nevadí */ }
    inst.scene.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mt of mats) {
        for (const k in mt) { const v = (mt as any)[k]; if (v && v.isTexture) v.dispose(); }
        mt.dispose();
      }
    });
    inst.rt?.dispose(); inst.rt = null; inst.run = null;
    this.renderer?.resetState();
  }

  dispose() { this.renderer?.dispose(); this.renderer = null; }
}
