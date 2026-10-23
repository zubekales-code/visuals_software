// Společné typy pro hlavní proces, pult (control) a výstup (output).
// Pult drží „pravdu“ o stavu projektu; výstup jen kreslí podle stavu, který dostane.

export const LAYER_COUNT = 8;
export const CLIP_COLS = 10;

export type Drive = 'kick' | 'bass' | 'high' | 'loud' | 'none';
export type LayerScale = 1 | 0.5 | 0.25;
export type Blend = 'normal' | 'add' | 'screen';

/** Hodnoty klipu, které přepisují výchozí hodnoty z hlavičky shaderu (co není vyplněné, bere se z hlavičky). */
export interface ClipParams {
  drive?: Drive; hard?: number; speed?: number; density?: number; size?: number; colA?: string; colB?: string;
  custom?: Record<string, number>;
}

/** Klip = vizuál (soubor) + vlastní hodnoty. Leží v buňce mřížky vrstva × sloupec. */
export interface ClipState {
  content: string;       // id obsahu: "shader:padla" | "video:test_alfa.webm"
  params: ClipParams;
}

export interface LayerState {
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

export interface AudioSettings {
  source: 'demo' | 'wav' | 'input';
  wavPath: string;       // cesta k wav na disku (jen pro source = wav)
  deviceId: string;      // vstup (line-in) pro source = input
  playing: boolean;      // přehrávání wav
  sens: number;          // citlivost detekce úderů 0.3–2
}

export interface AppState {
  layers: LayerState[];  // index 0 = Vrstva 1 (dole)
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
}

export interface ContentItem {
  id: string;            // "shader:padla" | "video:soubor.webm" | "audio:pisen.wav"
  kind: 'shader' | 'video' | 'audio';
  name: string;
  file: string;          // název souboru
  path?: string;         // cesta na disku (knihovna)
  url?: string;          // file:// URL (video, zvuk)
  source?: string;       // text shaderu
}

export interface ImportResult { ids: string[]; errors: string[] }
export interface SadaInfo { name: string; savedAt: string }
/** Uložená sada = rozložení mřížky + klipy s nastavením (estetika). Systém pod tím je stejný. */
export interface SadaFile { app: 'vj'; version: 1; name: string; savedAt: string; layers: LayerState[]; glow: AppState['glow']; bpm: number }
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
    [clip('shader:gradient'), clip('shader:bloky')],
    [clip('shader:cary'), clip('shader:padla')],
    [clip('shader:kulicka'), clip('shader:skrabance')],
    [clip('shader:tecky'), clip('shader:dlazdice')],
    [clip('shader:padla', { hard: 1 }), clip('shader:cary', { density: 0.6, colA: '#ffffff' })],
    [clip('shader:skrabance', { density: 0.7 }), clip('shader:tecky', { density: 0.8, colA: '#f4f6f2', colB: '#1b1f1a' })],
  ];
  return {
    layers: grid.map((row, i) => ({
      on: true, opacity: 1, scale: 1 as LayerScale, blend: 'normal' as Blend,
      clips: Array.from({ length: CLIP_COLS }, (_, c) => row[c] ?? null),
      active: i === 0 ? -1 : 0, // výchozí = sestava brány: 7 vrstev vč. videa
    })),
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
