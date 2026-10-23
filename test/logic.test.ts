// Testy logiky, která nepotřebuje grafiku: hlavička shaderu, detekce úderů, chování vrstvy, vyhodnocení testu výkonu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseShaderHeader, hexToRgb } from '../src/shared/shader-header';
import { mkBand, updateBand, DemoSignal } from '../src/renderer/audio';
import { LayerRuntime } from '../src/renderer/engine/layer-runtime';
import { summarize, estimateRefresh, PerfTest } from '../src/renderer/perf-test';
import type { AudioFrame } from '../src/shared/types';

const frame = (): AudioFrame => ({ t: 0, kick: { v: 0, hit: false }, bass: { v: 0, hit: false }, high: { v: 0, hit: false }, loud: { v: 0, hit: false } });

test('všechny shadery v content/shaders mají platnou hlavičku a funkci element()', () => {
  const files = readdirSync('content/shaders').filter(f => f.endsWith('.glsl'));
  assert.ok(files.length >= 8);
  for (const f of files) {
    const src = readFileSync('content/shaders/' + f, 'utf8');
    const { header, body } = parseShaderHeader(src);
    assert.ok(header.name, f + ': chybí name');
    assert.match(body, /vec4\s+element\s*\(\s*vec2\s+p\s*\)/, f);
    // čísla řádků těla sedí se souborem
    assert.equal(body.split('\n').length, src.split('\n').length, f);
  }
});

test('hlavička: výchozí hodnoty, neplatné pole a vlastní parametry', () => {
  const { header } = parseShaderHeader('/*{"name":"X","defaults":{"drive":"nesmysl","hard":"abc"},"params":[{"name":"uWarp","default":0.3},{"name":"1bad"}]}*/\nvec4 element(vec2 p){return vec4(0.0);}');
  assert.equal(header.defaults.drive, 'loud');
  assert.equal(header.defaults.hard, 0.3);
  assert.deepEqual(header.params?.map(p => p.name), ['uWarp']);
  assert.throws(() => parseShaderHeader('/*{ rozbité }*/'), /JSON/);
  assert.equal(parseShaderHeader('vec4 element(vec2 p){return vec4(0.0);}').header.name, '');
  assert.deepEqual(hexToRgb('#ff8000').map(v => +v.toFixed(3)), [1, 0.502, 0]);
});

test('kopák: náhlý nárůst = úder, ustálená hlasitost úder nedělá', () => {
  const b = mkBand();
  let hits = 0;
  // 4 s při 60 fps: každých 0,5 s krátký náraz energie
  for (let i = 0; i < 240; i++) {
    const t = i / 60, ph = (t % 0.5);
    updateBand(b, 0.05 + (ph < 0.05 ? 1 : 0), t, 0.12, 0.35, 1);
    if (b.hit) hits++;
  }
  assert.ok(hits >= 7 && hits <= 8, 'čekám ~8 úderů, bylo ' + hits);
  const c = mkBand(); let flat = 0;
  for (let i = 0; i < 240; i++) { updateBand(c, 0.5, i / 60, 0.12, 0.35, 1); if (c.hit && i > 2) flat++; }
  assert.equal(flat, 0);
});

test('demo signál: 122 BPM ≈ 2 údery za sekundu', () => {
  const d = new DemoSignal(), f = frame(); let hits = 0;
  for (let i = 0; i < 600; i++) { d.run(i / 60, f); if (f.kick.hit && i > 0) hits++; }
  assert.ok(Math.abs(hits - 20) <= 1, String(hits));
});

test('vrstva: úder zvýší počítadlo, vypnutí plynule zhasne', () => {
  const r = new LayerRuntime(), f = frame();
  const d = { drive: 'kick' as const, hard: 0.5, speed: 1, density: 0.5, size: 0.5, colA: '#fff', colB: '#fff' };
  f.kick.hit = true; r.update(d, f, true, 1 / 60);
  assert.equal(r.hitCount, 1); assert.equal(r.hitAges[0] < 0.02, true);
  f.kick.hit = false;
  for (let i = 0; i < 30; i++) r.update(d, f, true, 1 / 60);
  assert.equal(r.fade, 1);
  for (let i = 0; i < 30; i++) r.update(d, f, false, 1 / 60);
  assert.equal(r.fade, 0);
  f.kick.hit = true; r.update(d, f, false, 1 / 60);
  assert.equal(r.hitCount, 1, 'vypnutá vrstva nepočítá údery');
});

test('vyhodnocení výkonu: zahozené snímky a 1 % nejhorších', () => {
  const dts = new Float32Array(1000).fill(16.67);
  for (let i = 0; i < 20; i++) dts[i * 50] = 40;
  const s = summarize(dts, 1000, 60);
  assert.equal(s.dropped, 20);
  assert.ok(s.low1Fps < 30 && s.avgFps > 55);
  assert.ok(Math.abs(estimateRefresh(dts, 1000) - 60) < 0.5);
});

test('test výkonu: pomalé GPU neprojde, i když běží stabilně (frekvence displeje z Windows)', () => {
  const t = new PerfTest();
  let now = 0; t.start(0.05, 'x', now);
  // stabilně 45 fps na 60Hz displeji
  while (!t.frame(22.2, now += 22.2)) { /* */ }
  const r = t.result({ gpu: 'NVIDIA GeForce RTX 3060 Laptop GPU', outW: 1920, outH: 1080, layersOn: ['a', 'b', 'c', 'd', 'e', 'f', 'video:x'], glow: true, preview: true, audio: 'demo', audioLatencyMs: 10, float16: true, gpuTimer: true }, {}, null, 60);
  assert.equal(r.passed, false);
  const t2 = new PerfTest(); now = 0; t2.start(0.05, 'y', now);
  while (!t2.frame(16.67, now += 16.67)) { /* */ }
  const r2 = t2.result({ gpu: 'NVIDIA GeForce RTX 3060 Laptop GPU', outW: 1920, outH: 1080, layersOn: ['a', 'b', 'c', 'd', 'e', 'f', 'video:x'], glow: true, preview: true, audio: 'demo', audioLatencyMs: 10, float16: true, gpuTimer: true }, {}, null, 60);
  assert.equal(r2.passed, true, r2.verdict.join(' '));
});

import { clipForKey, keyLabel, LAYER_KEYS } from '../src/renderer/keys';
import { defaultState, activeClip, layerLive, CLIP_COLS, LAYER_COUNT } from '../src/shared/types';

test('klávesy: každá vrstva má 10 jedinečných kláves', () => {
  const all = LAYER_KEYS.flat();
  assert.equal(LAYER_KEYS.length, LAYER_COUNT);
  assert.ok(LAYER_KEYS.every(r => r.length === CLIP_COLS));
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(clipForKey('KeyQ'), { layer: 6, col: 0 });
  assert.deepEqual(clipForKey('Shift+Digit0'), { layer: 3, col: 9 });
  assert.equal(clipForKey('Escape'), null);
  assert.equal(keyLabel(7, 9), '0');
  assert.equal(keyLabel(2, 1), '⇧W');
  assert.equal(keyLabel(5, 9), ';');
});

test('výchozí stav = sestava brány: 7 hrajících vrstev včetně videa', () => {
  const s = defaultState();
  const live = s.layers.filter(layerLive);
  assert.equal(live.length, 7);
  assert.ok(live.some(l => activeClip(l)!.content.startsWith('video:')));
  assert.ok(s.layers.every(l => l.clips.length === CLIP_COLS));
});
