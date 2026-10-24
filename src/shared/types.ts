// Společné typy pro hlavní proces, pult (control) a výstup (output).
// Pult drží „pravdu“ o stavu projektu; výstup jen kreslí podle stavu, který dostane.

export const LAYER_COUNT = 8;
export const CLIP_COLS = 10;

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

/** Spustí celý sloupec: v každé vrstvě hraje klip z tohoto sloupce, kde sloupec nemá klip, vrstva ztichne.
 *  Klipy z jiných sloupců se tím zastaví. */
export function launchColumn(layers: LayerState[], col: number) {
  for (const l of layers) l.active = l.clips[col] ? col : -1;
}
export function stopAll(layers: LayerState[]) { for (const l of layers) l.active = -1; }

/** Stav sloupce pro hlavičku: 'full' = hraje celý sloupec a nic jiného, 'part' = hraje z něj aspoň něco. */
export function columnStatus(layers: LayerState[], col: number): 'full' | 'part' | '' {
  let any = false, full = true, filled = false;
  for (const l of layers) {
    if (l.clips[col]) { filled = true; if (l.active === col) any = true; else full = false; }
    else if (l.active >= 0) full = false;
  }
  if (!filled || !any) return '';
  return full ? 'full' : 'part';
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
  colNames: string[];    // vlastní názvy sloupců ("" = číslo)
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
export interface SadaFile { app: 'vj'; version: 1; name: string; savedAt: string; layers: LayerState[]; glow: AppState['glow']; bpm: number; colNames?: string[] }
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
