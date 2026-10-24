// Zvuk → pásma (kopák, basa, výšky, hlasitost) + detekce úderů.
// Zdroj: demo signál 122 BPM (bez hudby), wav soubor, vstup (kabel do line-in zvukovky)
// nebo zvuk tohoto PC (co právě hraje zvuková karta — Windows loopback).
// Analýza je převzatá ze sandboxu; kopák = náhlý nárůst (onset), ne jen hlasitost pásma.
import type { AudioFrame, AudioSettings, Band } from '../shared/types';

export interface BandState { v: number; hit: boolean; max: number; prev: number; hist: Float32Array; hi: number; hn: number; last: number }

export function mkBand(): BandState {
  return { v: 0, hit: false, max: 1e-4, prev: 0, hist: new Float32Array(40), hi: 0, hn: 0, last: -1 };
}

/** Jedno pásmo: normalizace na dlouhodobé maximum + onset (spektrální tok nad adaptivním prahem). */
export function updateBand(b: BandState, e: number, now: number, refractory: number, minV: number, sens: number) {
  b.max = Math.max(e, b.max * 0.9985, 1e-5);
  const v = Math.min(1, e / b.max);
  const flux = Math.max(0, v - b.prev); b.prev = v;
  b.hist[b.hi] = flux; b.hi = (b.hi + 1) % b.hist.length; b.hn = Math.min(b.hn + 1, b.hist.length);
  let sum = 0; for (let i = 0; i < b.hn; i++) sum += b.hist[i];
  const mean = sum / b.hn;
  const thr = mean * 1.6 + 0.06 / sens;
  b.hit = flux > thr && v > minV && (now - b.last) > refractory;
  if (b.hit) b.last = now;
  b.v = v;
}

/** Demo signál 122 BPM ze sandboxu — aby šlo testovat bez hudby. */
export class DemoSignal {
  private lastBeat = -1; private last16 = -1;
  run(now: number, f: AudioFrame) {
    const beat = now * 122 / 60, b = Math.floor(beat), s16 = Math.floor(beat * 4), ph = beat - b;
    f.kick.v = Math.exp(-ph * 7); f.kick.hit = b !== this.lastBeat; this.lastBeat = b;
    const hat = s16 !== this.last16 && (s16 % 2 === 1 || (Math.sin(s16 * 12.9898) * 43758.5) % 1 > 0.6); this.last16 = s16;
    f.high.hit = hat; f.high.v = hat ? 1 : f.high.v * 0.8;
    f.bass.v = 0.45 + 0.4 * Math.sin(beat * Math.PI * 0.5) * Math.exp(-ph * 2); f.bass.hit = f.kick.hit && b % 2 === 0;
    f.loud.v = 0.5 + 0.25 * Math.sin(now * 0.4) + 0.2 * f.kick.v; f.loud.hit = b % 8 === 0 && f.kick.hit;
  }
}

const band = (): Band => ({ v: 0, hit: false });

export class AudioEngine {
  readonly frame: AudioFrame = { t: 0, kick: band(), bass: band(), high: band(), loud: band() };
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private time: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private bands = { kick: mkBand(), bass: mkBand(), high: mkBand(), loud: mkBand() };
  private demo = new DemoSignal();
  private el: HTMLAudioElement | null = null;
  private src: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private cur = { source: '', wavUrl: '', deviceId: '' };
  private gen = 0;            // každé přepnutí zdroje = nové číslo (pomalé zachycení nesmí přepsat novější volbu)
  private live = false;       // analyzuje se skutečný zvuk ze streamu (kabel, zvuk PC)
  private connecting = false; // právě se připojuje kabel / zvuk PC
  private retryAt = 0; private retryDelay = 3; // znovupřipojení po výpadku (rostoucí pauza)
  private resumeAt = 0;
  status = 'demo';
  /** Zachytí zvuk tohoto PC. Dosadí výstupní okno (potřebuje pomoc hlavního procesu). */
  captureSystem: (() => Promise<MediaStream>) | null = null;

  private ensureCtx() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
    this.ctx = ctx; this.analyser = an;
    this.freq = new Float32Array(an.frequencyBinCount); this.time = new Float32Array(an.fftSize);
    return ctx;
  }

  /** Zapojí zdroj podle nastavení z pultu. Mění jen to, co se změnilo. */
  async apply(s: AudioSettings, wavUrl: string) {
    if (s.source !== this.cur.source || wavUrl !== this.cur.wavUrl || s.deviceId !== this.cur.deviceId) {
      this.cur = { source: s.source, wavUrl, deviceId: s.deviceId };
      this.disconnect();
      const gen = ++this.gen;
      if (s.source === 'wav' && wavUrl) {
        const ctx = this.ensureCtx();
        const el = new Audio(); el.src = wavUrl; el.loop = true;
        this.el = el;
        const node = ctx.createMediaElementSource(el);
        node.connect(this.analyser!); this.analyser!.connect(ctx.destination);
        this.src = node; this.status = 'wav';
      } else if (s.source === 'input') {
        const ctx = this.ensureCtx();
        this.connecting = true;
        try {
          // Žádné „vylepšování“ zvuku: potlačení ozvěny/šumu a automatický zisk by zkreslily údery.
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: s.deviceId ? { exact: s.deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          });
          if (gen !== this.gen) { this.stopStream(); return; }
          const node = ctx.createMediaStreamSource(this.stream);
          node.connect(this.analyser!); // do reproduktorů neposíláme (zpětná vazba)
          this.src = node; this.status = 'vstup'; this.live = true; this.retryDelay = 3;
          this.stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (gen === this.gen) { this.live = false; this.status = 'vstup nedostupný: kabel / zvukovka se odpojila'; } });
        } catch (e) { this.status = 'vstup nedostupný: ' + (e as Error).message; }
        finally { if (gen === this.gen) this.connecting = false; }
      } else if (s.source === 'system') {
        const ctx = this.ensureCtx();
        this.status = 'zvuk PC: připojuji…';
        this.connecting = true;
        try {
          if (!this.captureSystem) throw new Error('není k dispozici');
          const stream = await this.captureSystem();
          if (gen !== this.gen) { stream.getTracks().forEach(t => t.stop()); return; }
          this.stream = stream;
          // Obraz obrazovky nepotřebujeme — zahodit (šetří výkon). Zvuk je samostatná stopa a běží dál.
          stream.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t); });
          if (!stream.getAudioTracks().length) throw new Error('Windows neposlal žádný zvuk (funguje jen na Windows)');
          const node = ctx.createMediaStreamSource(stream);
          node.connect(this.analyser!); // do reproduktorů ne: hraje to už počítač sám
          this.src = node; this.status = 'zvuk PC'; this.live = true; this.retryDelay = 3;
          stream.getAudioTracks()[0].addEventListener('ended', () => { if (gen === this.gen) { this.live = false; this.status = 'zvuk PC nedostupný: zachytávání skončilo — přepni zdroj znovu'; } });
        } catch (e) { if (gen === this.gen) { this.stopStream(); this.status = 'zvuk PC nedostupný: ' + ((e as Error).message || String(e)); } }
        finally { if (gen === this.gen) this.connecting = false; }
      } else {
        this.status = 'demo';
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    if (this.el) {
      if (s.playing && this.el.paused) this.el.play().catch(() => {});
      if (!s.playing && !this.el.paused) this.el.pause();
    }
  }

  private disconnect() {
    try { this.src?.disconnect(); } catch { /* už odpojeno */ }
    try { this.analyser?.disconnect(); } catch { /* už odpojeno */ }
    this.src = null;
    if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); this.el = null; }
    this.stopStream();
    this.live = false;
  }
  private stopStream() { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }

  private energy(lo: number, hi: number) {
    const binHz = this.ctx!.sampleRate / this.analyser!.fftSize;
    let s = 0, n = 0;
    for (let i = Math.max(1, Math.floor(lo / binHz)); i <= Math.min(this.freq.length - 1, Math.ceil(hi / binHz)); i++) { s += Math.pow(10, this.freq[i] / 20); n++; }
    return n ? s / n : 0;
  }

  /** Hlídač zdroje (volá se ze smyčky výstupu): kabel / zvuk PC vypadl → znovu připojit, zvuk „usnul“ → probudit. */
  watchdog(s: AudioSettings, now: number) {
    if (this.ctx && this.ctx.state === 'suspended' && now > this.resumeAt) { this.resumeAt = now + 1; void this.ctx.resume().catch(() => {}); }
    if ((s.source === 'system' || s.source === 'input') && !this.live && !this.connecting && now > this.retryAt) {
      this.retryAt = now + this.retryDelay; this.retryDelay = Math.min(30, this.retryDelay * 2);
      this.cur.source = ''; // vynutit nové připojení
      void this.apply(s, '');
    }
  }

  /** Poslouchá se opravdu zvolený zdroj? (Jinak běží náhradní demo rytmus.) */
  listenOk(src: AudioSettings['source']) {
    if (src === 'demo') return true;
    if (src === 'wav') return this.status === 'wav' && !!this.el && !this.el.paused;
    return this.live;
  }
  /** Co se teď opravdu analyzuje — pro panel Zvuk. */
  listenLabel(src: AudioSettings['source']) {
    if (src === 'demo') return 'demo rytmus 122 BPM';
    if (src === 'wav') return this.listenOk(src) ? 'skladba (wav) ▶' : this.el ? 'demo rytmus — skladba je na pauze (▶ nebo mezerník)' : 'demo rytmus — vyber skladbu';
    const name = src === 'system' ? 'zvuk tohoto PC' : 'kabel';
    if (this.live) return name;
    return this.connecting ? `demo rytmus — připojuji ${name}…` : `demo rytmus — ${name} nejde, zkouším znovu`;
  }

  /** Spočítá pásma pro tento snímek. */
  update(now: number, sens: number): AudioFrame {
    const f = this.frame; f.t = now;
    const live = this.analyser && this.src && (this.live || (this.status === 'wav' && this.el && !this.el.paused));
    if (!live) { this.demo.run(now, f); return f; }
    const an = this.analyser!;
    an.getFloatFrequencyData(this.freq); an.getFloatTimeDomainData(this.time);
    const B = this.bands;
    updateBand(B.kick, this.energy(40, 110), now, 0.12, 0.35, sens);
    updateBand(B.bass, this.energy(40, 250), now, 0.12, 0.3, sens);
    updateBand(B.high, this.energy(6000, 14000), now, 0.06, 0.25, sens);
    let rms = 0; for (let i = 0; i < this.time.length; i++) rms += this.time[i] * this.time[i];
    updateBand(B.loud, Math.sqrt(rms / this.time.length), now, 0.2, 0.4, sens);
    for (const k of ['kick', 'bass', 'high', 'loud'] as const) { f[k].v = B[k].v; f[k].hit = B[k].hit; }
    return f;
  }

  seek(sec: number) { if (this.el && isFinite(sec)) this.el.currentTime = Math.max(0, Math.min(sec, this.el.duration || 0)); }
  get position() { return this.el ? this.el.currentTime : 0; }
  get duration() { return this.el && isFinite(this.el.duration) ? this.el.duration : 0; }

  /** Odhad zpoždění zvukového řetězce v ms (pro zprávu z testu). */
  latencyMs() {
    if (!this.ctx) return null;
    return Math.round(((this.ctx.baseLatency || 0) + ((this.ctx as any).outputLatency || 0)) * 1000);
  }
}
