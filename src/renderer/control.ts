// Pult (Etapa 0): zapínání vrstev, výběr obsahu, zvuk, výstup, test výkonu a živý náhled.
// Pult je „pravda“ o stavu: každou změnu pošle výstupu a uloží (autosave).
import type { AppState, AudioFrame, ContentItem, LayerScale } from '../shared/types';
import { defaultState, LAYER_COUNT } from '../shared/types';
import { Compositor } from './engine/compositor';

const vj = window.vj;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null)[]) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, String(attrs[k]));
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}

// ---------- stav + autosave ----------
const SAVE_KEY = 'vj.state.v1';
function loadState(): AppState {
  const d = defaultState();
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && Array.isArray(s.layers)) {
      const out = { ...d, ...s, glow: { ...d.glow, ...s.glow }, audio: { ...d.audio, ...s.audio, playing: false } };
      out.layers = d.layers.map((l, i) => ({ ...l, ...(s.layers[i] ?? {}) }));
      out.black = false;
      return out;
    }
  } catch { /* poškozený záznam → výchozí stav */ }
  return d;
}
let state = loadState();
let saveT: ReturnType<typeof setTimeout> | null = null;
function commit() {
  vj.sendState(state);
  previewComp?.setState(state);
  if (saveT) clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* plný disk apod. */ } }, 300);
  render();
}

let content: ContentItem[] = [];
let audioFrame: AudioFrame | null = null;

// ---------- vrstvy ----------
function renderLayers() {
  const wrap = $('layers'); wrap.textContent = '';
  state.layers.forEach((l, i) => {
    const sel = el('select', { title: 'Obsah vrstvy', onchange: (e: Event) => { l.content = (e.target as HTMLSelectElement).value; commit(); } },
      el('option', { value: '' }, '— prázdná —'),
      ...content.map(c => el('option', { value: c.id, selected: c.id === l.content }, (c.kind === 'video' ? '🎞 ' : '◆ ') + c.name)));
    const scale = el('select', { title: 'Rozlišení vrstvy (menší = levnější)', onchange: (e: Event) => { l.scale = +(e.target as HTMLSelectElement).value as LayerScale; commit(); } },
      ...[1, 0.5, 0.25].map(v => el('option', { value: v, selected: v === l.scale }, v === 1 ? 'plné' : v === 0.5 ? '½' : '¼')));
    const op = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: l.opacity, title: 'Průhlednost',
      oninput: (e: Event) => { l.opacity = +(e.target as HTMLInputElement).value; commit(); } });
    const ms = el('span', { class: 'ms', id: 'lms' + i }, '—');
    wrap.append(el('div', { class: 'layer' + (l.on ? ' on' : '') },
      el('kbd', {}, String(i + 1)),
      el('button', { class: 'pill' + (l.on ? ' on' : ''), onclick: () => toggleLayer(i) }, l.on ? 'ZAP' : 'VYP'),
      sel, op, scale, ms));
  });
}
function toggleLayer(i: number) { const l = state.layers[i]; if (!l) return; l.on = !l.on; commit(); }

// ---------- ostatní panely ----------
function render() {
  renderLayers();
  $('black').classList.toggle('active', state.black);
  $<HTMLSelectElement>('outRes').value = `${state.outW}x${state.outH}`;
  $<HTMLInputElement>('glowOn').checked = state.glow.on;
  $<HTMLInputElement>('glowAmt').value = String(state.glow.amount);
  $<HTMLInputElement>('previewOn').checked = state.preview;
  $<HTMLSelectElement>('audioSrc').value = state.audio.source;
  $<HTMLInputElement>('sens').value = String(state.audio.sens);
  $('wavRow').hidden = state.audio.source !== 'wav';
  $('inRow').hidden = state.audio.source !== 'input';
  $('wavName').textContent = state.audio.wavPath ? state.audio.wavPath.split(/[\\/]/).pop()! : '—';
  $('preview').style.visibility = state.preview ? 'visible' : 'hidden';
}

$('black').onclick = () => { state.black = !state.black; commit(); };
$<HTMLSelectElement>('outRes').onchange = e => { const [w, h] = (e.target as HTMLSelectElement).value.split('x').map(Number); state.outW = w; state.outH = h; commit(); };
$<HTMLInputElement>('glowOn').onchange = e => { state.glow.on = (e.target as HTMLInputElement).checked; commit(); };
$<HTMLInputElement>('glowAmt').oninput = e => { state.glow.amount = +(e.target as HTMLInputElement).value; commit(); };
$<HTMLInputElement>('previewOn').onchange = e => { state.preview = (e.target as HTMLInputElement).checked; commit(); };
$<HTMLSelectElement>('audioSrc').onchange = e => { state.audio.source = (e.target as HTMLSelectElement).value as AppState['audio']['source']; state.audio.playing = false; commit(); if (state.audio.source === 'input') void loadDevices(); };
$<HTMLInputElement>('sens').oninput = e => { state.audio.sens = +(e.target as HTMLInputElement).value; commit(); };
$('pickWav').onclick = async () => { const p = await vj.pickWav(); if (p) { state.audio.wavPath = p; state.audio.playing = true; commit(); } };
$('playWav').onclick = () => { state.audio.playing = !state.audio.playing; commit(); };
$<HTMLSelectElement>('device').onchange = e => { state.audio.deviceId = (e.target as HTMLSelectElement).value; commit(); };
$('loadDevices').onclick = () => void loadDevices();

async function loadDevices() {
  try {
    // Popisky vstupů jsou vidět až po prvním povolení přístupu.
    const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop());
  } catch { /* bez povolení jen beze jmen */ }
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  const sel = $<HTMLSelectElement>('device'); sel.textContent = '';
  sel.append(el('option', { value: '' }, 'Výchozí vstup'));
  for (const d of devs) sel.append(el('option', { value: d.deviceId, selected: d.deviceId === state.audio.deviceId }, d.label || 'Vstup ' + d.deviceId.slice(0, 6)));
}

function setPreset(kind: 'gate' | 'all' | 'none') {
  const shaders = content.filter(c => c.kind === 'shader').map(c => c.id);
  const video = content.find(c => c.kind === 'video')?.id ?? '';
  state.layers.forEach((l, i) => {
    if (kind === 'none') { l.on = false; return; }
    if (i < LAYER_COUNT - 1) l.content = shaders[i % Math.max(1, shaders.length)] ?? '';
    else l.content = video;
    l.opacity = 1; l.scale = 1;
    l.on = kind === 'all' ? true : i !== LAYER_COUNT - 2; // brána: 6 shaderů + video = 7
  });
  if (kind !== 'none') { state.glow.on = true; state.outW = 1920; state.outH = 1080; }
  commit();
}
$('presetGate').onclick = () => setPreset('gate');
$('presetAll').onclick = () => setPreset('all');
$('presetNone').onclick = () => setPreset('none');

document.querySelectorAll<HTMLButtonElement>('[data-test]').forEach(b => b.onclick = () => startTest(+b.dataset.test!));
function startTest(min: number) {
  vj.startTest(min);
  $('testStatus').textContent = `Test běží (${min} min)… nesahej na nic, ať je měření čisté.`;
}

async function renderDisplays() {
  const wrap = $('displays'); wrap.textContent = '';
  for (const d of await vj.displays()) {
    wrap.append(el('button', { title: `${d.width}×${d.height} @ ${d.refresh} Hz`, onclick: () => vj.placeOutput(d.id, true) },
      `${d.primary ? 'Notebook' : 'Projektor'}: ${d.label} (${d.refresh} Hz) ⤢`));
  }
  wrap.append(el('button', { onclick: () => vj.placeOutput(0, false) }, 'Výstup v okně'));
}

// ---------- klávesy (z pultu i z výstupního okna) ----------
function onKey(code: string) {
  const m = /^Digit([1-8])$/.exec(code);
  if (m) return toggleLayer(+m[1] - 1);
  if (code === 'Escape') { state.black = !state.black; return commit(); }
  if (code === 'KeyG') { state.glow.on = !state.glow.on; return commit(); }
  if (code === 'Space') { state.audio.playing = !state.audio.playing; return commit(); }
  if (code === 'KeyT') return startTest(1);
}
window.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range' && (e.target as HTMLInputElement).type !== 'checkbox') return;
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'Escape' || /^Digit/.test(e.code)) e.preventDefault();
  onKey(e.code);
});
vj.onKey(onKey);

// ---------- ukazatele zvuku ----------
const meters: Record<string, { i: HTMLElement; b: HTMLElement; flash: number }> = {};
for (const [k, lbl] of [['kick', 'KOPÁK'], ['bass', 'BASA'], ['high', 'VÝŠKY'], ['loud', 'HLAS']]) {
  const i = el('i'), b = el('b');
  $('meters').append(el('div', { class: 'meter', title: lbl }, i, b, el('span', {}, lbl)));
  meters[k] = { i, b, flash: 0 };
}
vj.onAudioFrame(f => {
  audioFrame = f;
  for (const k of ['kick', 'bass', 'high', 'loud'] as const) {
    const m = meters[k];
    m.i.style.height = (f[k].v * 100).toFixed(0) + '%';
    if (f[k].hit) m.flash = 1;
  }
});

// ---------- statistiky z výstupu ----------
const fmt = (v: number | null | undefined, d = 1) => v === null || v === undefined ? '—' : v.toFixed(d);
vj.onStats(s => {

  const okFps = s.fps >= s.refreshHz * 0.97;
  $('topFps').innerHTML = `<span class="${okFps ? 'good' : 'bad'}">${fmt(s.fps)} fps</span>`;
  $('topGpu').textContent = `GPU ${fmt(s.gpuMs, 2)} ms`;
  $('topProj').textContent = `výstup ${state.outW}×${state.outH} · ~${fmt(s.refreshHz, 0)} Hz`;
  const rows: [string, string][] = [
    ['Grafika', s.gpu],
    ['Snímků za sekundu', fmt(s.fps)],
    ['Délka snímku (průměr / nejhorší)', `${fmt(s.frameMs, 2)} / ${fmt(s.worstMs, 2)} ms`],
    ['GPU čas celkem', s.gpuMs === null ? 'grafika neumí měřit' : fmt(s.gpuMs, 2) + ' ms'],
    ['JS čas na snímek', fmt(s.cpuMs, 2) + ' ms'],
    ['Displej výstupu', '~' + fmt(s.refreshHz, 0) + ' Hz' + (Math.abs(s.refreshHz - 60) > 3 ? ' (přepni na 60 Hz)' : '')],
    ['Paměť JS', s.heapMB === null ? '—' : fmt(s.heapMB, 0) + ' MB'],
  ];
  const body = $('statsBody'); body.textContent = '';
  for (const [a, b] of rows) body.append(el('tr', {}, el('td', {}, a), el('td', {}, b)));
  s.layerGpuMs.forEach((v, i) => { const e = document.getElementById('lms' + i); if (e) e.textContent = v === null ? '—' : v.toFixed(2) + ' ms'; });
  $('audioStatus').textContent = s.audio;
  const err = $('errors');
  err.hidden = !s.errors.length; err.textContent = s.errors.join('\n');
  if (s.test) {
    $('testStatus').textContent = s.test.running
      ? `Test běží: ${Math.floor(s.test.elapsed)} / ${Math.round(s.test.duration)} s · ${s.test.label}`
      : `Hotovo: ${s.test.label}`;
  }
});

// ---------- živý náhled (stejný kompozitor, malé rozlišení) ----------
let previewComp: Compositor | null = null;
const SILENT: AudioFrame = { t: 0, kick: { v: 0, hit: false }, bass: { v: 0, hit: false }, high: { v: 0, hit: false }, loud: { v: 0, hit: false } };
let pLast = performance.now(); const pT0 = performance.now();
function previewLoop() {
  requestAnimationFrame(previewLoop);
  const now = performance.now(), dt = Math.min(0.1, (now - pLast) / 1000); pLast = now;
  // úder v ukazateli krátce blikne
  for (const k in meters) { const m = meters[k]; m.b.style.opacity = m.flash.toFixed(2); m.flash *= 0.7; }
  if (previewComp && state.preview) previewComp.render(audioFrame ?? SILENT, dt, (now - pT0) / 1000);
  if (audioFrame) { audioFrame.kick.hit = audioFrame.bass.hit = audioFrame.high.hit = audioFrame.loud.hit = false; }
}

// ---------- start ----------
(async () => {
  content = await vj.listContent();
  // Uložený stav může odkazovat na soubor, který už neexistuje.
  for (const l of state.layers) if (l.content && !content.some(c => c.id === l.content)) l.content = '';
  try {
    previewComp = new Compositor($<HTMLCanvasElement>('preview'), true);
    previewComp.setContent(content);
    previewComp.resize(640, 360);
  } catch (e) { $('errors').hidden = false; $('errors').textContent = 'Náhled: ' + (e as Error).message; }
  commit();
  if (await vj.isSmoke()) { // automatický test bez grafické karty: všech 8 vrstev, malé rozlišení
    setPreset('all'); state.outW = 640; state.outH = 360; commit();
  }
  void renderDisplays();
  requestAnimationFrame(previewLoop);
})();

vj.onContentChanged(list => { content = list; previewComp?.setContent(list); render(); });
