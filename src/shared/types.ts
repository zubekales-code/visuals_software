// Společné typy pro hlavní proces, pult (control) a výstup (output).
// Pult drží „pravdu“ o stavu projektu; výstup jen kreslí podle stavu, který dostane.

/** Výchozí počet vrstev a sloupců nové sady (vrstvy i sloupce jde přidávat a mazat). */
export const LAYER_COUNT = 8;
export const CLIP_COLS = 10;
/** Strop: víc vrstev = víc práce pro grafiku; víc sloupců = jen delší mřížka. */
export const MAX_LAYERS = 16;
export const MAX_COLS = 30;

export type Drive = 'kick' | 'bass' | 'high' | 'loud' | 'none';
export type LayerScale = 1 | 0.5 | 0.25;
export type Blend = 'normal' | 'add' | 'screen';

/** 3D kamera (jen scény). Rotace −1…1 (0 = stojí), ostatní 0…1. */
export interface Cam3D {
  orbit: number;         // ROTACE KAMERY: rychlost obletu kolem scény
  height: number;        // VÝŠKA KAMERY: pohled zespodu → shora
  dist: number;          // VZDÁLENOST: blízko → daleko
  fov: number;           // ZORNÉ POLE: teleobjektiv → širokoúhlý
  spin: number;          // ROTACE OBJEKTU: otáčení scény kolem osy
  kick: number;          // ÚDER KAMERY: přiblížení na úder
}
export const CAM_DEFAULTS: Cam3D = { orbit: 0.2, height: 0.45, dist: 0.5, fov: 0.35, spin: 0, kick: 0.2 };

export type StrobeMode = 'frames' | 'hit';

/** Hodnoty klipu, které přepisují výchozí hodnoty z hlavičky shaderu (co není vyplněné, bere se z hlavičky).
 *  Sjednocené názvy v pultu: hard = TVRDOST, speed = OSCILACE, density = MNOŽSTVÍ, size = TLOUŠŤKA. */
export interface ClipParams {
  drive?: Drive; hard?: number; speed?: number; density?: number; size?: number; colA?: string; colB?: string;
  glow?: number;         // GLOW jen tohoto klipu 0–1
  strobe?: number;       // STROBO: 0 = vyp, n = n snímků svítí / n snímků tma (nebo n snímků po úderu)
  strobeMode?: StrobeMode;
  cam?: Partial<Cam3D>;  // 3D kamera (scény)
  custom?: Record<string, number>;
}

/** Klip = vizuál (soubor) + vlastní hodnoty. Leží v buňce mřížky vrstva × sloupec. */
export interface ClipState {
  content: string;       // id obsahu: "shader:padla" | "video:test_alfa.webm" | "scene:sloupy"
  params: ClipParams;
  name?: string;         // vlastní název klipu (jinak název vizuálu)
  ready?: boolean;       // „připraven“ (žlutý rámeček): klip v neaktivním sloupci, který se pustí při přepnutí na sloupec
}

export interface LayerState {
  name?: string;         // vlastní název vrstvy (jinak „Vrstva N“)
  on: boolean;           // oko: vrstva zapnutá
  opacity: number;       // 0–1
  scale: LayerScale;     // rozlišení vrstvy vůči výstupu
  blend: Blend;          // prolínání s vrstvami pod ní
  clips: (ClipState | null)[]; // CLIP_COLS buněk
  active: number;        // hrající sloupec, -1 = nic
}

/** Hrající klip vrstvy (nebo null). */
export function activeClip(l: LayerState): ClipState | null {
  return l.active >= 0 ? l.clips[l.active] ?? null : null;
}

/** Vrstva opravdu něco kreslí: je zapnutá a hraje klip. */
export function layerLive(l: LayerState): boolean {
  return l.on && !!activeClip(l);
}

// ---------- sloupce: vždy je aktivní právě JEDEN sloupec, hrát můžou jen jeho klipy ----------
export function stopAll(layers: LayerState[]) { for (const l of layers) l.active = -1; }

/** Pustí sloupec: jen připravené (žluté) klipy, a když v něm nic připraveno není, celý sloupec.
 *  Připravení se tím „spotřebuje“ (klip teď hraje). */
export function startColumn(s: AppState, col: number) {
  const anyReady = s.layers.some(l => l.clips[col]?.ready);
  for (const l of s.layers) {
    const c = l.clips[col];
    l.active = c && (!anyReady || c.ready) ? col : -1;
    if (c?.ready) c.ready = false;
  }
}

/** Klik na hlavičku sloupce. Jiný sloupec = přepnout na něj. Aktivní sloupec: něco hraje → zastavit vše, nic → pustit. */
export function clickColumnLogic(s: AppState, col: number) {
  if (col < 0 || col >= s.colNames.length) return;
  if (col === s.column && s.layers.some(l => l.active === col)) { stopAll(s.layers); return; }
  s.column = col;
  startColumn(s, col);
}

/** Klik na klip (i klávesou). V aktivním sloupci zapne / vypne, v jiném sloupci připraví / zruší připravení. */
export function clickClipLogic(s: AppState, layer: number, col: number): 'play' | 'stop' | 'ready' | 'unready' | '' {
  const l = s.layers[layer], c = l?.clips[col];
  if (!c) return '';
  if (col === s.column) {
    if (l.active === col) { l.active = -1; return 'stop'; }
    l.active = col; c.ready = false; return 'play';
  }
  c.ready = !c.ready;
  return c.ready ? 'ready' : 'unready';
}

/** Pořádek po přesunu / mazání: hrát smí jen klip v aktivním sloupci, který existuje. */
export function normalizePlay(s: AppState) {
  s.column = Math.max(0, Math.min(s.column, s.colNames.length - 1));
  for (const l of s.layers) {
    if (l.active !== -1 && (l.active !== s.column || !l.clips[l.active])) l.active = -1;
    const c = l.clips[s.column]; if (c?.ready) c.ready = false; // v aktivním sloupci se nepřipravuje
  }
  if (s.selected && !s.layers[s.selected.layer]?.clips[s.selected.col]) s.selected = null;
}

/** Načtená mřížka (autosave / sada) → platná: 1–16 vrstev, 1–30 sloupců, každá vrstva má klip na každý sloupec. */
export function sanitizeGrid(srcLayers: unknown, srcCols: unknown, srcColumn: unknown): { layers: LayerState[]; colNames: string[]; column: number } | null {
  if (!Array.isArray(srcLayers) || !srcLayers.length || srcLayers.length > MAX_LAYERS || !srcLayers.every((l: any) => Array.isArray(l?.clips))) return null;
  const maxClips = Math.max(...srcLayers.map((l: any) => l.clips.length));
  const n = Math.max(1, Math.min(MAX_COLS, Array.isArray(srcCols) && srcCols.length ? srcCols.length : maxClips || CLIP_COLS));
  const colNames = Array.from({ length: n }, (_, c) => Array.isArray(srcCols) && typeof srcCols[c] === 'string' ? srcCols[c] : '');
  const layers = srcLayers.map((l: any): LayerState => ({
    on: l.on !== false, opacity: Number.isFinite(+l.opacity) ? Math.max(0, Math.min(1, +l.opacity)) : 1,
    scale: [1, 0.5, 0.25].includes(l.scale) ? l.scale : 1, blend: ['normal', 'add', 'screen'].includes(l.blend) ? l.blend : 'normal',
    name: typeof l.name === 'string' && l.name ? l.name : undefined,
    active: Number.isInteger(l.active) ? l.active : -1,
    clips: Array.from({ length: n }, (_, c) => {
      const x = l.clips[c];
      return x && typeof x.content === 'string'
        ? { content: x.content, params: x.params && typeof x.params === 'object' ? x.params : {}, ...(typeof x.name === 'string' && x.name ? { name: x.name } : {}), ...(x.ready ? { ready: true } : {}) }
        : null;
    }),
  }));
  let column = Number.isInteger(srcColumn) ? srcColumn as number : -1;
  if (column < 0 || column >= n) column = layers.find(l => l.active >= 0)?.active ?? 0; // starší sady (bez aktivního sloupce)
  column = Math.max(0, Math.min(n - 1, column));
  return { layers, colNames, column };
}

// ---------- přidat / smazat sloupec a vrstvu ----------
const emptyLayer = (cols: number): LayerState => ({ on: true, opacity: 1, scale: 1, blend: 'normal', clips: Array(cols).fill(null), active: -1 });

/** Vloží prázdný sloupec na pozici at (0 = úplně vlevo). */
export function addColumn(s: AppState, at: number): boolean {
  if (s.colNames.length >= MAX_COLS) return false;
  at = Math.max(0, Math.min(at, s.colNames.length));
  s.colNames.splice(at, 0, '');
  for (const l of s.layers) { l.clips.splice(at, 0, null); if (l.active >= at) l.active++; }
  if (s.column >= at) s.column++;
  if (s.selected && s.selected.col >= at) s.selected = { ...s.selected, col: s.selected.col + 1 };
  return true;
}
/** Smaže sloupec i s klipy. Poslední sloupec smazat nejde. */
export function deleteColumn(s: AppState, at: number): boolean {
  if (s.colNames.length <= 1 || at < 0 || at >= s.colNames.length) return false;
  const wasActive = s.column === at;
  s.colNames.splice(at, 1);
  for (const l of s.layers) { l.clips.splice(at, 1); if (l.active === at) l.active = -1; else if (l.active > at) l.active--; }
  if (s.column > at || (wasActive && s.column >= s.colNames.length)) s.column--;
  if (s.selected) s.selected = s.selected.col === at ? null : s.selected.col > at ? { ...s.selected, col: s.selected.col - 1 } : s.selected;
  normalizePlay(s);
  return true;
}
/** Vloží prázdnou vrstvu na pozici at (0 = úplně dole). */
export function addLayer(s: AppState, at: number): boolean {
  if (s.layers.length >= MAX_LAYERS) return false;
  at = Math.max(0, Math.min(at, s.layers.length));
  s.layers.splice(at, 0, emptyLayer(s.colNames.length));
  if (s.selected && s.selected.layer >= at) s.selected = { ...s.selected, layer: s.selected.layer + 1 };
  return true;
}
/** Smaže vrstvu i s klipy. Poslední vrstvu smazat nejde. */
export function deleteLayer(s: AppState, at: number): boolean {
  if (s.layers.length <= 1 || at < 0 || at >= s.layers.length) return false;
  s.layers.splice(at, 1);
  if (s.selected) s.selected = s.selected.layer === at ? null : s.selected.layer > at ? { ...s.selected, layer: s.selected.layer - 1 } : s.selected;
  return true;
}

/** STROBO: má být vrstva v tomto snímku vidět? n = počet snímků (0 = strobo vypnuté). */
export function strobeGate(frame: number, n: number, mode: StrobeMode, framesSinceHit: number): boolean {
  n = Math.round(n);
  if (n <= 0) return true;
  if (mode === 'hit') return framesSinceHit < n;
  return Math.floor(frame / n) % 2 === 0;
}

export interface AudioSettings {
  source: 'demo' | 'wav' | 'input' | 'system';
  wavPath: string;       // cesta k wav na disku (jen pro source = wav)
  deviceId: string;      // vstup (line-in) pro source = input
  playing: boolean;      // přehrávání wav
  sens: number;          // citlivost detekce úderů 0.3–2
}

export interface AppState {
  layers: LayerState[];  // index 0 = Vrstva 1 (dole)
  colNames: string[];    // vlastní názvy sloupců ("" = číslo); délka = počet sloupců
  column: number;        // aktivní sloupec (vždy právě jeden)
  selected: { layer: number; col: number } | null; // klip ve vlastnostech
  bpm: number;
  locked: boolean;       // zámek: myš nic nezmění, klávesy fungují
  sada: string;          // název načtené / uložené sady ("" = pracovní)
  glow: { on: boolean; amount: number };
  black: boolean;        // nouzová černá
  outW: number;          // rozlišení výstupu (nezávislé na notebooku)
  outH: number;
  audio: AudioSettings;
  preview: boolean;      // živý náhled v pultu
}

/** Hodnota jednoho pásma zvuku v jednom snímku. */
export interface Band { v: number; hit: boolean }
export interface AudioFrame { t: number; kick: Band; bass: Band; high: Band; loud: Band }

/** Hlavička shaderu (komentář /*{ ... }*\/ na začátku souboru, princip ISF). */
export interface ShaderParam { name: string; label?: string; default: number; min?: number; max?: number }
export interface ShaderHeader {
  name: string;
  popis?: string;
  feedback?: boolean;    // potřebuje předchozí snímek (stopy)
  defaults: {
    drive: Drive; hard: number; speed: number; density: number; size: number; colA: string; colB: string;
  };
  labels?: Record<string, string>;
  params?: ShaderParam[]; // vlastní posuvníky navíc → uniform float <name>
  camera?: Cam3D & { distance: number; targetY: number }; // jen 3D scény: výchozí kamera
}

export interface ContentItem {
  id: string;            // "shader:padla" | "video:soubor.webm" | "audio:pisen.wav" | "scene:sloupy"
  kind: 'shader' | 'video' | 'audio' | 'scene';
  name: string;
  file: string;          // název souboru
  path?: string;         // cesta na disku (knihovna)
  url?: string;          // file:// URL (video, zvuk)
  source?: string;       // text shaderu / 3D scény
}

export interface ImportResult { ids: string[]; errors: string[] }
export interface SadaInfo { name: string; savedAt: string }
/** Uložená sada = rozložení mřížky + klipy s nastavením (estetika). Systém pod tím je stejný. */
export interface SadaFile { app: 'vj'; version: 1; name: string; savedAt: string; layers: LayerState[]; glow: AppState['glow']; bpm: number; colNames?: string[]; column?: number }
export interface OutputPlacement { displayId: number; fullscreen: boolean }
export interface DisplaysInfo { displays: DisplayInfo[]; placement: OutputPlacement }

export interface LayerStat { ms: number }
export interface OutputStats {
  fps: number;
  frameMs: number;       // průměrná délka snímku za poslední ~0,5 s
  worstMs: number;
  gpuMs: number | null;  // celkový GPU čas, pokud ho grafika umí změřit
  layerGpuMs: (number | null)[];
  cpuMs: number;         // čas JS na snímek
  refreshHz: number;     // odhad obnovovací frekvence displeje výstupu
  gpu: string;           // název grafiky (ověřit RTX, ne integrovanou)
  heapMB: number | null;
  test: TestProgress | null;
  audio: string;
  listen: string;        // co se opravdu analyzuje (např. „zvuk PC“, „demo — wav je na pauze“)
  listenOk: boolean;     // poslouchá se zvolený zdroj (ne náhradní demo)
  audioPos: number;      // pozice skladby v s (wav)
  audioDur: number;      // délka skladby v s (0 = není)         // stav zvuku (demo / wav / vstup / chyba)
  errors: string[];
}
export interface TestProgress { running: boolean; elapsed: number; duration: number; label: string }

export interface DisplayInfo { id: number; label: string; width: number; height: number; refresh: number; primary: boolean }

export interface ReportPayload { baseName: string; json: string; txt: string }

/** API, které preload vystaví oknům jako window.vj. */
export interface VjApi {
  listContent(): Promise<ContentItem[]>;
  onContentChanged(cb: (items: ContentItem[]) => void): void;
  sendState(s: AppState): void;
  onState(cb: (s: AppState) => void): void;
  outputReady(): void;
  sendAudioFrame(f: AudioFrame): void;
  onAudioFrame(cb: (f: AudioFrame) => void): void;
  sendStats(s: OutputStats): void;
  onStats(cb: (s: OutputStats) => void): void;
  startTest(minutes: number): void;
  onStartTest(cb: (minutes: number) => void): void;
  writeReport(r: ReportPayload): Promise<string>;
  /** Okno pro výběr souborů → zkopíruje je do knihovny. */
  pickImport(kind: 'all' | 'audio'): Promise<ImportResult | null>;
  importFiles(paths: string[]): Promise<ImportResult>;
  onLibraryProgress(cb: (text: string) => void): void;
  openLibrary(sub: string): void;
  showInFolder(path: string): void;
  /** Cesta k souboru přetaženému z Průzkumníka. */
  pathForFile(f: File): string;
  listSady(): Promise<SadaInfo[]>;
  saveSada(name: string, json: string): Promise<void>;
  loadSada(name: string): Promise<string | null>;
  seekAudio(sec: number): void;
  onSeekAudio(cb: (sec: number) => void): void;
  onDisplays(cb: (d: DisplaysInfo) => void): void;
  fileUrl(path: string): Promise<string>;
  displays(): Promise<DisplaysInfo>;
  placeOutput(displayId: number, fullscreen: boolean): void;
  sendKey(key: string): void;
  onKey(cb: (key: string) => void): void;
  /** Obnovovací frekvence displeje, na kterém je výstupní okno (z Windows). */
  onDisplayHz(cb: (hz: number) => void): void;
  /** Zvuk tohoto PC (co hraje zvuková karta): výstupní okno si ho vyžádá, vrací "" nebo text chyby. */
  captureSystemAudio(): Promise<string>;
  isSmoke(): Promise<boolean>;
  /** Zápis chyby do VISUALS SOFTWARE\zpravy\chyby.txt (abychom věděli, co se stalo). */
  logError(text: string): void;
  smokeDone(ok: boolean, info: string): void;
}

declare global {
  interface Window { vj: VjApi }
}

const clip = (content: string, params: ClipParams = {}): ClipState => ({ content, params });

export function defaultState(): AppState {
  // Testovací sada: prostředí dole, video s alfou, nad tím tvary ze sandboxu (některé i ve variantách).
  const grid: (ClipState | null)[][] = [
    [clip('video:test_prostredi.mp4')],
    [clip('video:test_alfa.webm')],
    [clip('shader:gradient'), clip('shader:bloky'), clip('scene:sloupy')],
    [clip('shader:cary'), clip('shader:padla'), clip('scene:mrak')],
    [clip('shader:kulicka'), clip('shader:skrabance'), clip('scene:drat')],
    [clip('shader:tecky'), clip('shader:dlazdice'), clip('scene:cerv')],
    [clip('shader:padla', { hard: 1 }), clip('shader:cary', { density: 0.6, colA: '#ffffff' })],
    [clip('shader:skrabance', { density: 0.7 }), clip('shader:tecky', { density: 0.8, colA: '#f4f6f2', colB: '#1b1f1a' })],
  ];
  return {
    layers: grid.map((row, i) => ({
      on: true, opacity: 1, scale: 1 as LayerScale, blend: 'normal' as Blend,
      clips: Array.from({ length: CLIP_COLS }, (_, c) => row[c] ?? null),
      active: i === 0 ? -1 : 0, // výchozí = sestava brány: 7 vrstev vč. videa
    })),
    colNames: Array(CLIP_COLS).fill(''),
    column: 0,
    selected: { layer: 3, col: 0 },
    bpm: 122,
    locked: false,
    sada: '',
    glow: { on: true, amount: 0.45 },
    black: false,
    outW: 1920,
    outH: 1080,
    audio: { source: 'demo', wavPath: '', deviceId: '', playing: false, sens: 1 },
    preview: true,
  };
}
