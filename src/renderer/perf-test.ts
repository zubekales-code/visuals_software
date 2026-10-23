// Test výkonu (Etapa 0): zaznamená délky snímků, paměť a GPU čas a sepíše zprávu.
// Brána Etapy 0: 60 fps se 7 vrstvami a videem, bez trhání.

export interface TestContext {
  gpu: string;
  outW: number; outH: number;
  layersOn: string[];
  glow: boolean;
  preview: boolean;
  audio: string;
  audioLatencyMs: number | null;
  float16: boolean;
  gpuTimer: boolean;
}

export interface TestResult {
  label: string;
  started: string;
  durationS: number;
  frames: number;
  refreshHz: number;
  avgFps: number;
  low1Fps: number;        // 1 % nejpomalejších snímků
  worstMs: number;
  dropped: number;        // snímky delší než 1,5× interval displeje
  droppedPct: number;
  heapStartMB: number | null;
  heapEndMB: number | null;
  heapPeakMB: number | null;
  layerGpuMs: Record<string, number | null>;
  composeGpuMs: number | null;
  passed: boolean;
  verdict: string[];
  context: TestContext;
  samples: { t: number; fps: number; heapMB: number | null }[];
}

const heap = () => { const m = (performance as any).memory; return m ? m.usedJSHeapSize / 1048576 : null; };

/** Medián intervalů → obnovovací frekvence displeje, na kterém výstup běží. */
export function estimateRefresh(dts: ArrayLike<number>, n: number, quantile = 0.5): number {
  if (n < 10) return 60;
  const a = Array.from({ length: n }, (_, i) => dts[i]).sort((x, y) => x - y);
  const q = a[Math.floor((n - 1) * quantile)];
  return q > 0 ? 1000 / q : 60;
}

export function summarize(dts: Float32Array, n: number, refreshHz: number) {
  let sum = 0, worst = 0, dropped = 0;
  const limit = 1.5 * 1000 / refreshHz;
  for (let i = 0; i < n; i++) { sum += dts[i]; if (dts[i] > worst) worst = dts[i]; if (dts[i] > limit) dropped++; }
  const sorted = Array.from(dts.subarray(0, n)).sort((a, b) => b - a);
  const k = Math.max(1, Math.floor(n * 0.01));
  let slowSum = 0; for (let i = 0; i < k; i++) slowSum += sorted[i];
  return { avgFps: n ? 1000 / (sum / n) : 0, low1Fps: k ? 1000 / (slowSum / k) : 0, worstMs: worst, dropped, droppedPct: n ? dropped / n * 100 : 0 };
}

export class PerfTest {
  running = false;
  private dts: Float32Array = new Float32Array(1);
  private n = 0;
  private t0 = 0;
  private duration = 0;
  private label = '';
  private startedIso = '';
  private warm = 0;
  private samples: TestResult['samples'] = [];
  private lastSample = 0;
  private sampleFrames = 0;
  private heap0: number | null = null;
  private heapPeak: number | null = null;

  start(minutes: number, label: string, now: number) {
    this.duration = minutes * 60;
    // Předalokace pro 240 Hz × délka testu — za běhu se nic nealokuje.
    this.dts = new Float32Array(Math.ceil(this.duration * 240) + 1000);
    this.n = 0; this.t0 = now; this.label = label; this.startedIso = new Date().toISOString();
    this.samples = []; this.lastSample = now; this.sampleFrames = 0;
    this.heap0 = heap(); this.heapPeak = this.heap0;
    this.warm = 30; // prvních 30 snímků nepočítat (zahřátí)
    this.running = true;
  }

  get elapsed() { return this.running ? (performance.now() - this.t0) / 1000 : 0; }
  get total() { return this.duration; }
  get name() { return this.label; }

  /** Zapíše délku snímku v ms. Vrací true, když test právě skončil. */
  frame(dtMs: number, now: number): boolean {
    if (!this.running) return false;
    if (this.warm > 0) { this.warm--; this.t0 = now; return false; }
    if (this.n < this.dts.length) this.dts[this.n++] = dtMs;
    this.sampleFrames++;
    if (now - this.lastSample >= 10000) {
      const h = heap();
      if (h !== null && (this.heapPeak === null || h > this.heapPeak)) this.heapPeak = h;
      this.samples.push({ t: Math.round((now - this.t0) / 1000), fps: +(this.sampleFrames * 1000 / (now - this.lastSample)).toFixed(1), heapMB: h === null ? null : +h.toFixed(1) });
      this.lastSample = now; this.sampleFrames = 0;
    }
    if ((now - this.t0) / 1000 >= this.duration) { this.running = false; return true; }
    return false;
  }

  /** displayHz = frekvence displeje podle Windows (0 = neznámá → odhad z nejrychlejších snímků). */
  result(ctx: TestContext, layerGpu: Record<string, number | null>, composeGpu: number | null, displayHz: number): TestResult {
    const refresh = displayHz > 0 ? displayHz : estimateRefresh(this.dts, this.n, 0.1);
    const s = summarize(this.dts, this.n, refresh);
    const heapEnd = heap();
    const verdict: string[] = [];
    let passed = true;
    const r60 = Math.abs(refresh - 60) < 3;
    if (!r60) verdict.push(`Displej výstupu běží na ~${refresh.toFixed(0)} Hz. Pro hraní ho přepni na 60 Hz (trhání při 120/165 Hz).`);
    if (s.avgFps < refresh * 0.97) { passed = false; verdict.push(`Průměr ${s.avgFps.toFixed(1)} fps je pod frekvencí displeje (${refresh.toFixed(0)} Hz).`); }
    if (s.droppedPct > 0.5) { passed = false; verdict.push(`Zahozených snímků ${s.droppedPct.toFixed(2)} % (limit 0,5 %) → viditelné cukání.`); }
    if (this.heap0 !== null && heapEnd !== null && this.duration >= 600 && heapEnd - this.heap0 > 50) {
      passed = false; verdict.push(`Paměť narostla o ${(heapEnd - this.heap0).toFixed(0)} MB — možný únik paměti.`);
    }
    if (/swiftshader|llvmpipe|microsoft basic/i.test(ctx.gpu)) { passed = false; verdict.push('Kreslí softwarová grafika, ne RTX. Zkontroluj ovladač a Hybrid mode.'); }
    else if (/intel|uhd|iris|radeon\(tm\) graphics|amd radeon graphics/i.test(ctx.gpu)) verdict.push('Pozor: vypadá to na integrovanou grafiku. Vypni Hybrid mode a nastav Vysoký výkon.');
    const videoOn = ctx.layersOn.some(l => l.startsWith('video:'));
    if (ctx.layersOn.length < 7 || !videoOn) verdict.push(`Pozor: test neběžel v sestavě brány (zapnuto ${ctx.layersOn.length} vrstev${videoOn ? '' : ', bez videa'}). Brána = 7 vrstev vč. videa.`);
    if (passed && verdict.length === 0) verdict.push('Brána splněna: plynulých 60 fps.');
    return {
      label: this.label, started: this.startedIso, durationS: Math.round(this.duration), frames: this.n,
      refreshHz: +refresh.toFixed(1), avgFps: +s.avgFps.toFixed(2), low1Fps: +s.low1Fps.toFixed(2), worstMs: +s.worstMs.toFixed(2),
      dropped: s.dropped, droppedPct: +s.droppedPct.toFixed(3),
      heapStartMB: this.heap0 === null ? null : +this.heap0.toFixed(1), heapEndMB: heapEnd === null ? null : +heapEnd.toFixed(1),
      heapPeakMB: this.heapPeak === null ? null : +this.heapPeak.toFixed(1),
      layerGpuMs: layerGpu, composeGpuMs: composeGpu, passed, verdict, context: ctx, samples: this.samples,
    };
  }
}

export function reportText(r: TestResult): string {
  const f = (v: number | null, d = 2) => v === null ? '—' : v.toFixed(d);
  const lines = [
    `TEST VÝKONU — ${r.passed ? 'PROŠLO ✅' : 'NEPROŠLO ❌'}`,
    `${r.label} · začátek ${r.started} · délka ${Math.round(r.durationS / 60)} min`,
    '',
    `Grafika: ${r.context.gpu}`,
    `Výstup: ${r.context.outW}×${r.context.outH} · displej ~${r.refreshHz} Hz · glow ${r.context.glow ? 'zap' : 'vyp'} · náhled v pultu ${r.context.preview ? 'zap' : 'vyp'}`,
    `Zvuk: ${r.context.audio} · zpoždění zvukového řetězce ${r.context.audioLatencyMs ?? '—'} ms`,
    `Vrstvy zapnuté (${r.context.layersOn.length}): ${r.context.layersOn.join(', ') || '—'}`,
    '',
    `Průměr: ${r.avgFps} fps · 1 % nejhorších: ${r.low1Fps} fps · nejdelší snímek: ${r.worstMs} ms`,
    `Zahozené snímky: ${r.dropped} z ${r.frames} (${r.droppedPct} %)`,
    `Paměť (JS): start ${f(r.heapStartMB, 0)} MB · konec ${f(r.heapEndMB, 0)} MB · špička ${f(r.heapPeakMB, 0)} MB`,
    `GPU čas skládání + glow: ${f(r.composeGpuMs)} ms${r.context.gpuTimer ? '' : ' (grafika měření GPU času nenabízí)'}`,
    ...Object.entries(r.layerGpuMs).map(([k, v]) => `  ${k}: ${f(v)} ms`),
    '',
    ...r.verdict.map(v => '• ' + v),
  ];
  return lines.join('\r\n') + '\r\n';
}
