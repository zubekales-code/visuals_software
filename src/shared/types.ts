// Společné typy pro hlavní proces, pult (control) a výstup (output).
// Pult drží „pravdu“ o stavu projektu; výstup jen kreslí podle stavu, který dostane.

export const LAYER_COUNT = 8;

export type Drive = 'kick' | 'bass' | 'high' | 'loud' | 'none';
export type LayerScale = 1 | 0.5 | 0.25;

export interface LayerState {
  on: boolean;
  opacity: number;       // 0–1
  scale: LayerScale;     // rozlišení vrstvy vůči výstupu
  content: string;       // id obsahu: "shader:padla" | "video:test_alfa.webm" | ""
}

export interface AudioSettings {
  source: 'demo' | 'wav' | 'input';
  wavPath: string;       // cesta k wav na disku (jen pro source = wav)
  deviceId: string;      // vstup (line-in) pro source = input
  playing: boolean;      // přehrávání wav
  sens: number;          // citlivost detekce úderů 0.3–2
}

export interface AppState {
  layers: LayerState[];
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
  id: string;            // "shader:padla" | "video:soubor.webm"
  kind: 'shader' | 'video';
  name: string;
  file: string;          // název souboru
  url?: string;          // file:// URL (video)
  source?: string;       // text shaderu
}

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
  audio: string;         // stav zvuku (demo / wav / vstup / chyba)
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
  pickWav(): Promise<string | null>;
  fileUrl(path: string): Promise<string>;
  displays(): Promise<DisplayInfo[]>;
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

export function defaultState(): AppState {
  const content = ['shader:gradient', 'shader:bloky', 'shader:cary', 'shader:padla', 'shader:kulicka', 'shader:skrabance', 'shader:tecky', 'video:test_alfa.webm'];
  return {
    layers: content.map((c, i) => ({ on: i < 7, opacity: 1, scale: 1 as LayerScale, content: c })),
    glow: { on: true, amount: 0.45 },
    black: false,
    outW: 1920,
    outH: 1080,
    audio: { source: 'demo', wavPath: '', deviceId: '', playing: false, sens: 1 },
    preview: true,
  };
}
