// Výstupní okno (projektor): zvuk, kompozitor, měření. Stav dostává z pultu.
import type { AppState, OutputStats, ContentItem, TestProgress } from '../shared/types';
import { Compositor } from './engine/compositor';
import { AudioEngine } from './audio';
import { PerfTest, reportText, estimateRefresh } from './perf-test';

const vj = window.vj;
const canvas = document.getElementById('out') as HTMLCanvasElement;

let comp: Compositor | null = null;
let state: AppState | null = null;
let items: ContentItem[] = [];
const audio = new AudioEngine();
const test = new PerfTest();
let glErrors: string[] = [];
let contextLost = false;
let displayHz = 0; // z Windows; 0 = neznámá
vj.onDisplayHz(hz => { displayHz = hz; });

function makeCompositor() {
  try {
    comp = new Compositor(canvas, true);
    comp.setContent(items);
    if (state) { comp.setState(state); comp.resize(state.outW, state.outH); }
    glErrors = [];
  } catch (e) {
    comp = null; glErrors = [(e as Error).message];
  }
}

// Ztráta WebGL kontextu (pád ovladače) → počkat na obnovu a postavit kompozitor znovu.
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; comp = null; });
canvas.addEventListener('webglcontextrestored', () => { contextLost = false; makeCompositor(); });

async function applyState(s: AppState) {
  state = s;
  if (comp) { comp.setState(s); comp.resize(s.outW, s.outH); }
  const wavUrl = s.audio.wavPath ? await vj.fileUrl(s.audio.wavPath) : '';
  await audio.apply(s.audio, wavUrl);
}

// Klávesy stisknuté ve výstupním okně patří pultu.
window.addEventListener('keydown', e => { if (!e.repeat) vj.sendKey(e.code); e.preventDefault(); });

// ---------- smyčka ----------
const DT_RING = 120;
const dtRing = new Float32Array(DT_RING);
let ringI = 0, ringN = 0;
let last = performance.now();
let statsAt = 0, statFrames = 0, statSum = 0, statWorst = 0, cpuSum = 0;
const t0 = performance.now();

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dtMs = now - last; last = now;
  dtRing[ringI] = dtMs; ringI = (ringI + 1) % DT_RING; ringN = Math.min(ringN + 1, DT_RING);
  const tSec = (now - t0) / 1000;
  const c0 = performance.now();
  const frame = audio.update(tSec, state?.audio.sens ?? 1);
  if (comp && state && !contextLost) comp.render(frame, Math.min(dtMs / 1000, 0.1), tSec);
  const cpu = performance.now() - c0;
  vj.sendAudioFrame(frame);

  statFrames++; statSum += dtMs; cpuSum += cpu; if (dtMs > statWorst) statWorst = dtMs;
  if (test.frame(dtMs, now)) finishTest();
  if (now - statsAt >= 500) { sendStats(); statsAt = now; statFrames = 0; statSum = 0; statWorst = 0; cpuSum = 0; }
}

function layerGpu(): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!comp || !state) return out;
  state.layers.forEach((l, i) => { if (l.on && l.content) out[`${i + 1} ${l.content}`] = comp!.layerGpuMs(i); });
  return out;
}

function sendStats() {
  const m = (performance as any).memory;
  let gpuMs: number | null = null;
  const lg: (number | null)[] = [];
  if (comp) {
    for (let i = 0; i <= 8; i++) { const v = comp.layerGpuMs(i); lg.push(v); if (v !== null) gpuMs = (gpuMs ?? 0) + v; }
  }
  const errs = [...glErrors, ...(comp ? [...comp.errors.entries()].map(([k, v]) => `${k}: ${v}`) : [])];
  if (contextLost) errs.push('Grafika ztratila kontext — čekám na obnovu.');
  if (audio.status.startsWith('vstup nedostupný')) errs.push(audio.status);
  const stats: OutputStats = {
    fps: statFrames ? 1000 / (statSum / statFrames) : 0,
    frameMs: statFrames ? statSum / statFrames : 0,
    worstMs: statWorst,
    gpuMs, layerGpuMs: lg.slice(0, 8),
    cpuMs: statFrames ? cpuSum / statFrames : 0,
    refreshHz: displayHz > 0 ? displayHz : estimateRefresh(dtRing, ringN, 0.1),
    gpu: comp?.gpuName ?? '—',
    heapMB: m ? m.usedJSHeapSize / 1048576 : null,
    test: test.running ? { running: true, elapsed: test.elapsed, duration: test.total, label: test.name } : testDone,
    audio: audio.status,
    errors: errs,
  };
  vj.sendStats(stats);
}

let smokeMode = false;
let testDone: TestProgress | null = null;

async function finishTest() {
  if (!comp || !state) return;
  const layersOn = state.layers.filter(l => l.on && l.content).map(l => l.content);
  const r = test.result({
    gpu: comp.gpuName, outW: state.outW, outH: state.outH, layersOn, glow: state.glow.on, preview: state.preview,
    audio: audio.status, audioLatencyMs: audio.latencyMs(), float16: comp.g.float16, gpuTimer: comp.timer.available,
  }, layerGpu(), comp.layerGpuMs(8), displayHz);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const path = await vj.writeReport({ baseName: `test_${stamp}`, json: JSON.stringify(r, null, 2), txt: reportText(r) });
  testDone = { running: false, elapsed: r.durationS, duration: r.durationS, label: `${r.passed ? 'PROŠLO ✅' : 'NEPROŠLO ❌'} · ${r.avgFps} fps · zpráva: ${path}` };
  sendStats();
  if (smokeMode) {
    const errs = comp.errors.size;
    vj.smokeDone(errs === 0 && r.frames > 10, `frames=${r.frames} fps=${r.avgFps} gpu=${r.context.gpu} float16=${r.context.float16} shaderErrors=${errs} ${[...comp.errors.values()].join(' | ')} report=${path}`);
  }
}


vj.onStartTest(minutes => {
  if (!state) return;
  const n = state.layers.filter(l => l.on && l.content).length;
  test.start(minutes, `${minutes} min · ${n} vrstev · ${state.outW}×${state.outH}`, performance.now());
});

vj.onState(s => { void applyState(s); });
vj.onContentChanged(list => { items = list; comp?.setContent(list); });

(async () => {
  items = await vj.listContent();
  makeCompositor();
  vj.outputReady();
  requestAnimationFrame(loop);
  smokeMode = await vj.isSmoke();
  if (smokeMode) setTimeout(() => test.start(0.1, 'smoke', performance.now()), 3000);
})();
