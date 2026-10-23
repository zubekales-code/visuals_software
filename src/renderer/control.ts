// Pult podle schváleného konceptu: horní lišta, knihovna | mřížka vrstvy × klipy, dole náhled | vlastnosti klipu | zvuk.
// Pult je „pravda“ o stavu: každou změnu pošle výstupu a uloží (autosave). Sady (estetiky) se ukládají do knihovny.
import type { AppState, AudioFrame, Blend, ClipParams, ClipState, ContentItem, DisplaysInfo, Drive, LayerScale, LayerState, OutputStats, SadaFile, ShaderHeader } from '../shared/types';
import { defaultState, activeClip, layerLive, LAYER_COUNT, CLIP_COLS } from '../shared/types';
import { parseShaderHeader } from '../shared/shader-header';
import { Compositor } from './engine/compositor';
import { Thumbs } from './thumbs';
import { clipForKey, keyLabel, keyName } from './keys';
import { $, el, svg, slim, setRangeFill, openMenu, closeMenu, setMenuClose, toast, fmt, mmss } from './ui/dom';
import { initLayout } from './ui/layout';

const vj = window.vj;
const EYE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const MIME_CLIP = 'application/x-vj-clip', MIME_ITEM = 'application/x-vj-item';

// ---------- stav + autosave ----------
const SAVE_KEY = 'vj.state.v2';
function sanitizeLayers(src: unknown, fallback: LayerState[]): LayerState[] | null {
  if (!Array.isArray(src) || src.length !== LAYER_COUNT || !src.every((l: any) => Array.isArray(l?.clips))) return null;
  return src.map((l: LayerState, i: number) => ({
    ...fallback[i], ...l,
    clips: Array.from({ length: CLIP_COLS }, (_, c) => { const x = l.clips[c]; return x && typeof x.content === 'string' ? { content: x.content, params: x.params ?? {} } : null; }),
  }));
}
function loadState(): AppState {
  const d = defaultState();
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    const layers = s && sanitizeLayers(s.layers, d.layers);
    if (layers) return { ...d, ...s, layers, glow: { ...d.glow, ...s.glow }, audio: { ...d.audio, ...s.audio, playing: false }, black: false, locked: false, sada: s.sada ?? '' };
  } catch { /* poškozený záznam → výchozí stav */ }
  return d;
}
let state = loadState();
let saveT: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
/** Pošle stav výstupu + uloží. Překreslení si volající řídí sám (při tažení posuvníku se nepřekresluje vše). */
function send(markDirty = true) {
  vj.sendState(state);
  previewComp?.setState(state);
  if (markDirty && !dirty && state.sada) { dirty = true; renderSada(); }
  if (saveT) clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* plný disk apod. */ } }, 300);
}
function commit() { send(); renderAll(); }

let content: ContentItem[] = [];
let byId = new Map<string, ContentItem>();
const headers = new Map<string, ShaderHeader>();
let stats: OutputStats | null = null;
let audioFrame: AudioFrame | null = null;
const thumbs = new Thumbs(() => { scheduleGrid(); scheduleLib(); });

function setContent(list: ContentItem[]) {
  content = list; byId = new Map(list.map(c => [c.id, c]));
  headers.clear();
  for (const c of list) if (c.kind === 'shader' && c.source) { try { headers.set(c.id, parseShaderHeader(c.source).header); } catch { /* chyba se ukáže v testu */ } }
}
const itemName = (id: string) => byId.get(id)?.name ?? id.replace(/^\w+:/, '') + ' (chybí)';
const isAlphaVideo = (id: string) => id.startsWith('video:') && id.toLowerCase().endsWith('.webm');

// ---------- akce s klipy ----------
function launch(layer: number, col: number) {
  const l = state.layers[layer]; if (!l || !l.clips[col]) return;
  l.active = col; send(); renderGrid(); renderProps();
}
function stop(layer: number) { const l = state.layers[layer]; if (!l) return; l.active = -1; send(); renderGrid(); renderProps(); }
function selectedClip(): ClipState | null {
  const s = state.selected; return s ? state.layers[s.layer]?.clips[s.col] ?? null : null;
}
/** Klik na klip: nehraje → spustí, hraje → zastaví. Nastavení klipu se ukáže v obou případech. */
function clickClip(layer: number, col: number) {
  state.selected = { layer, col };
  if (state.layers[layer].active === col) stop(layer); else launch(layer, col);
}
/** Přesun klipu (prohození s cílovou buňkou) nebo kopie (Ctrl). Hrající klip hraje dál, když zůstane ve své vrstvě. */
function moveClip(fl: number, fc: number, tl: number, tc: number, copy: boolean) {
  if (fl === tl && fc === tc) return;
  const A = state.layers[fl], B = state.layers[tl];
  const src = A.clips[fc]; if (!src) return;
  if (copy) {
    B.clips[tc] = JSON.parse(JSON.stringify(src));
  } else if (fl === tl) {
    const dst = B.clips[tc];
    B.clips[tc] = src; B.clips[fc] = dst;
    if (B.active === fc) B.active = tc; else if (B.active === tc) B.active = dst ? fc : -1;
  } else {
    const dst = B.clips[tc];
    B.clips[tc] = src; A.clips[fc] = dst;
    if (A.active === fc) A.active = dst ? fc : -1; // přesunutý hrající klip v nové vrstvě nespouštíme sám
  }
  state.selected = { layer: tl, col: tc };
  commit();
}
const pendingPlaces: { id: string; layer: number; col: number }[] = [];
function placeItem(id: string, layer: number, col: number) {
  const it = byId.get(id);
  if (!it) { pendingPlaces.push({ id, layer, col }); return; } // soubor se do knihovny teprve načítá
  if (it.kind === 'audio') { chooseTrack(id); toast('Skladba patří do panelu Zvuk — spustil jsem ji tam.'); return; }
  const l = state.layers[layer];
  l.clips[col] = { content: id, params: {} };
  state.selected = { layer, col };
  commit();
}
function firstEmpty(layer: number) { return state.layers[layer].clips.findIndex(c => !c); }

// ---------- horní lišta ----------
const topMeters: Record<string, HTMLElement> = {};
for (const [k, s] of [['kick', 'K'], ['bass', 'B'], ['high', 'V'], ['loud', 'H']] as const) {
  const i = el('i');
  $('topMeters').append(el('div', { class: 'vm', title: { K: 'Kopák', B: 'Basa', V: 'Výšky', H: 'Hlasitost' }[s] }, el('div', { class: 'bar' }, i), el('span', {}, s)));
  topMeters[k] = i;
}
const hitDot = el('div', { class: 'hitdot' });
$('topMeters').append(el('div', { class: 'vm', title: 'Úder (kopák)' }, hitDot, el('span', {}, 'úder')));
let hitGlow = 0;

const taps: number[] = [];
let beatT0 = performance.now();
$('tap').onclick = () => {
  const t = performance.now();
  if (taps.length && t - taps[taps.length - 1] > 2000) taps.length = 0;
  taps.push(t); if (taps.length > 6) taps.shift();
  if (taps.length >= 3) {
    const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    state.bpm = Math.round(60000 / iv * 10) / 10; beatT0 = taps[taps.length - 1]; send();
  }
  $('bpm').textContent = state.bpm.toFixed(1);
};

$('black').onclick = () => { state.black = !state.black; send(false); renderTop(); };
$('lock').onclick = () => { state.locked = !state.locked; send(false); renderTop(); };

function renderTop() {
  $('bpm').textContent = state.bpm.toFixed(1);
  $('black').classList.toggle('on', state.black);
  $('lock').classList.toggle('on', state.locked);
  document.body.classList.toggle('locked', state.locked);
  renderSada();
}

// ---------- sady (estetiky) ----------
function renderSada() {
  $('sadaName').textContent = state.sada || 'Pracovní sada';
  $('sadaSub').textContent = state.sada ? (dirty ? 'neuložené změny · Ctrl+S' : 'sada uložena · v0.3') : 'uloženo automaticky · v0.3';
}
async function saveSadaAs(name: string) {
  name = name.trim(); if (!name) return;
  const file: SadaFile = { app: 'vj', version: 1, name, savedAt: new Date().toISOString(), layers: state.layers, glow: state.glow, bpm: state.bpm };
  await vj.saveSada(name, JSON.stringify(file, null, 1));
  state.sada = name; dirty = false; send(false); renderSada();
  toast(`Sada „${name}“ uložena do knihovny.`);
}
async function loadSadaNamed(name: string) {
  const txt = await vj.loadSada(name);
  try {
    const f = JSON.parse(txt ?? 'null') as SadaFile;
    const layers = sanitizeLayers(f?.layers, defaultState().layers);
    if (!layers) throw new Error('neplatný soubor');
    state.layers = layers; state.glow = { ...state.glow, ...f.glow }; state.bpm = f.bpm || state.bpm;
    state.sada = name; state.selected = null; dirty = false;
    send(false); renderAll();
    const missing = layers.flatMap(l => l.clips).filter(c => c && !byId.has(c.content)).length;
    toast(`Sada „${name}“ načtena.` + (missing ? ` Chybí ${missing} souborů v knihovně.` : ''), missing > 0);
  } catch (e) { toast(`Sadu „${name}“ nejde načíst: ${(e as Error).message}`, true); }
}
$('brand').dataset.menuAnchor = '1';
$('brand').onclick = async e => {
  const m = openMenu(e.currentTarget as HTMLElement, 300);
  m.append(el('div', { class: 'mtitle' }, 'Sady — celé rozložení klipů s nastavením (estetika)'));
  const inp = el('input', { type: 'text', value: state.sada || '', placeholder: 'Název, např. Sobota klub' }) as HTMLInputElement;
  inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') { void saveSadaAs(inp.value); closeMenu(); } };
  m.append(el('div', { class: 'mrow' }, inp, el('button', { class: 'btn sm on', onclick: () => { void saveSadaAs(inp.value); closeMenu(); } }, 'Uložit')));
  const list = await vj.listSady();
  if (list.length) {
    m.append(el('div', { class: 'msep' }), el('div', { class: 'mtitle' }, 'Načíst sadu'));
    for (const s of list) m.append(el('button', { class: 'mitem', onclick: () => { closeMenu(); void loadSadaNamed(s.name); } },
      el('span', { style: 'flex:1' }, s.name), el('span', { class: 'muted sm' }, s.savedAt ? new Date(s.savedAt).toLocaleDateString('cs') : '')));
  }
  m.append(el('div', { class: 'msep' }));
  const nb = el('button', { class: 'mitem danger' }, 'Nová prázdná sada…');
  nb.onclick = () => {
    if (nb.dataset.ok !== '1') { nb.dataset.ok = '1'; nb.textContent = 'Opravdu? Vyprázdní mřížku (uložené sady zůstanou) — klikni znovu'; return; }
    state.layers.forEach(l => { l.clips = Array(CLIP_COLS).fill(null); l.active = -1; });
    state.sada = ''; state.selected = null; dirty = false; closeMenu(); commit();
  };
  m.append(nb, el('button', { class: 'mitem', onclick: () => { vj.openLibrary('sady'); closeMenu(); } }, 'Otevřít složku se sadami'));
  setTimeout(() => inp.focus(), 30);
};

// ---------- výstup na monitor ----------
let disp: DisplaysInfo = { displays: [], placement: { displayId: 0, fullscreen: false } };
function renderOutBtn() {
  const d = disp.displays.find(x => x.id === disp.placement.displayId);
  const ext = !!d && !d.primary;
  $('projDot').classList.toggle('ok', ext && disp.placement.fullscreen);
  $('outTxt').textContent = d
    ? `Výstup · ${d.primary ? 'notebook' : 'projektor'}${disp.placement.fullscreen ? ' · celá obr.' : ' · okno'} · ${state.outW}×${state.outH}`
    : `Výstup · ${state.outW}×${state.outH}`;
}
vj.onDisplays(d => { const had = disp.displays.length; disp = d; renderOutBtn(); if (had && d.displays.length !== had) toast(d.displays.length > had ? 'Připojen nový monitor → výstup na něj.' : 'Monitor odpojen → výstup v okně na notebooku.'); });
$('outBtn').dataset.menuAnchor = '1';
$('outBtn').onclick = async e => {
  disp = await vj.displays(); renderOutBtn();
  const m = openMenu(e.currentTarget as HTMLElement, 360);
  m.append(el('div', { class: 'mtitle' }, 'Kam jde výstup'));
  for (const d of disp.displays) {
    const here = d.id === disp.placement.displayId;
    m.append(el('div', { class: 'mrow' },
      el('span', { style: 'flex:1', class: here ? 'accent' : '' }, `${here ? '● ' : ''}${d.primary ? 'Notebook' : 'Projektor / monitor'} · ${d.width}×${d.height} · ${d.refresh} Hz`),
      el('button', { class: 'btn sm' + (here && disp.placement.fullscreen ? ' on' : ''), onclick: () => { vj.placeOutput(d.id, true); closeMenu(); } }, 'Celá obrazovka'),
      el('button', { class: 'btn sm' + (here && !disp.placement.fullscreen ? ' on' : ''), onclick: () => { vj.placeOutput(d.id, false); closeMenu(); } }, 'Okno')));
  }
  if (disp.displays.length < 2) m.append(el('div', { class: 'mrow muted sm' }, 'Je připojený jen notebook. Projektor připoj kdykoliv (HDMI) — výstup na něj skočí sám.'));
  m.append(el('div', { class: 'msep' }));
  const res = el('select', { onchange: (ev: Event) => { const [w, h] = (ev.target as HTMLSelectElement).value.split('x').map(Number); state.outW = w; state.outH = h; send(false); renderOutBtn(); } },
    ...['1920x1080', '1280x720', '2560x1440', '640x360'].map(v => el('option', { value: v, selected: v === `${state.outW}x${state.outH}` || undefined }, v.replace('x', '×') + (v === '640x360' ? ' (zkouška)' : ''))));
  m.append(el('div', { class: 'mrow' }, el('span', { class: 'muted sm' }, 'Rozlišení obrazu'), res));
  const pv = el('input', { type: 'checkbox', checked: state.preview || undefined, onchange: (ev: Event) => { state.preview = (ev.target as HTMLInputElement).checked; send(false); renderAll(); } });
  m.append(el('label', { class: 'mrow' }, pv, 'Živý náhled v pultu'));
  m.append(el('div', { class: 'mrow muted sm' }, 'Displej s výstupem přepni ve Windows na 60 Hz.'));
};

// ---------- test výkonu (Etapa 0) ----------
let lastTest = '';
let testMenuRedraw: (() => void) | null = null;
$('testBtn').dataset.menuAnchor = '1';
$('testBtn').onclick = e => {
  const m = openMenu(e.currentTarget as HTMLElement, 380);
  const draw = () => {
    m.textContent = '';
    m.append(el('div', { class: 'mtitle' }, 'Test výkonu · brána Etapy 0: 60 fps se 7 vrstvami a videem'));
    m.append(el('div', { class: 'mrow' },
      el('button', { class: 'btn sm on', onclick: () => setPreset('gate') }, 'Sestava brány'),
      el('button', { class: 'btn sm', onclick: () => setPreset('all') }, 'Zátěž: všech 8'),
      el('button', { class: 'btn sm', onclick: () => setPreset('none') }, 'Vše zastavit')));
    m.append(el('div', { class: 'mrow' },
      ...[[1, 'Spustit 1 min'], [10, '10 min'], [120, '2 hodiny']].map(([min, t]) =>
        el('button', { class: 'btn sm', onclick: () => { vj.startTest(min as number); lastTest = `Test běží (${min} min)… nesahej na nic.`; draw(); } }, t as string))));
    const live = stats?.test;
    const status = live ? (live.running ? `Běží: ${Math.floor(live.elapsed)} / ${Math.round(live.duration)} s` : live.label) : lastTest || 'Zpráva se uloží do složky „zpravy“.';
    m.append(el('div', { class: 'mrow sm' }, status));
    if (stats) {
      const s = stats;
      const rows: [string, string][] = [
        ['Grafika', s.gpu], ['Snímků za sekundu', fmt(s.fps)], ['Délka snímku (průměr / nejhorší)', `${fmt(s.frameMs, 2)} / ${fmt(s.worstMs, 2)} ms`],
        ['GPU čas celkem', s.gpuMs === null ? 'grafika neumí měřit' : fmt(s.gpuMs, 2) + ' ms'], ['JS čas na snímek', fmt(s.cpuMs, 2) + ' ms'],
        ['Displej výstupu', '~' + fmt(s.refreshHz, 0) + ' Hz' + (Math.abs(s.refreshHz - 60) > 3 ? ' (přepni na 60 Hz)' : '')],
        ['Paměť JS', s.heapMB === null ? '—' : fmt(s.heapMB, 0) + ' MB'],
      ];
      m.append(el('table', {}, el('tbody', {}, ...rows.map(([a, b]) => el('tr', {}, el('td', {}, a), el('td', {}, b))))));
      if (s.errors.length) m.append(el('div', { class: 'err' }, s.errors.join('\n')));
    }
  };
  draw();
  testMenuRedraw = draw;
  setMenuClose(() => { testMenuRedraw = null; });
};

function setPreset(kind: 'gate' | 'all' | 'none') {
  state.layers.forEach((l, i) => {
    if (kind === 'none') { l.active = -1; return; }
    const first = l.clips.findIndex(c => !!c);
    l.on = true; l.opacity = 1; l.scale = 1;
    l.active = kind === 'gate' && i === 0 ? -1 : first; // brána: vrstvy 2–8 (7 vrstev vč. videa)
  });
  if (kind !== 'none') { state.glow.on = true; state.outW = 1920; state.outH = 1080; }
  commit(); renderOutBtn();
}

// ---------- přetahování (drag & drop) ----------
const hasType = (e: DragEvent, t: string) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(t);
const isFileDrag = (e: DragEvent) => hasType(e, 'Files');
// Soubor puštěný mimo cíl nesmí okno „otevřít“ (přepsalo by pult).
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

async function importDropped(e: DragEvent): Promise<string[]> {
  const files = Array.from(e.dataTransfer?.files ?? []);
  const paths = files.map(f => vj.pathForFile(f)).filter(Boolean);
  if (!paths.length) return [];
  const r = await vj.importFiles(paths);
  if (r.errors.length) toast('Nepřidáno:\n' + r.errors.join('\n'), true, 6000);
  else if (r.ids.length) toast(`Přidáno do knihovny: ${r.ids.length}`);
  return r.ids;
}

/** Zóna pro soubory z Průzkumníka (knihovna, panel Zvuk). */
function fileDropZone(area: HTMLElement, overlay: HTMLElement, onIds: (ids: string[]) => void) {
  let depth = 0;
  area.addEventListener('dragenter', e => { if (!isFileDrag(e)) return; depth++; overlay.hidden = false; });
  area.addEventListener('dragleave', e => { if (!isFileDrag(e)) return; if (--depth <= 0) { depth = 0; overlay.hidden = true; } });
  area.addEventListener('dragover', e => { if (isFileDrag(e)) { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; } });
  area.addEventListener('drop', async e => {
    if (!isFileDrag(e)) return;
    e.preventDefault(); e.stopPropagation(); depth = 0; overlay.hidden = true;
    onIds(await importDropped(e));
  });
}

// ---------- mřížka ----------
function layerLabel(l: LayerState): string {
  if (!l.on) return 'vypnutá';
  const c = activeClip(l);
  if (!c) return 'nic nehraje';
  if (c.content.startsWith('video:')) return isAlphaVideo(c.content) ? 'video α' : 'video';
  return 'tvary';
}
const BLENDS: Blend[] = ['normal', 'add', 'screen'];
const BLEND_NAME: Record<Blend, string> = { normal: 'Normál', add: 'Add', screen: 'Screen' };
const SCALE_NAME = (s: number) => s === 1 ? '1' : s === 0.5 ? '½' : '¼';

function renderGrid() {
  const head = $('colHead'); head.textContent = '';
  head.append(el('span', {}, 'VRSTVY · klávesa spustí klip'));
  for (let c = 1; c <= CLIP_COLS; c++) head.append(el('span', {}, String(c)));

  const rows = $('rows'); rows.textContent = '';
  for (let li = LAYER_COUNT - 1; li >= 0; li--) {
    const l = state.layers[li];
    const pct = el('span', { class: 'pct' }, Math.round(l.opacity * 100) + '%');
    const lh = el('div', { class: 'lhead' },
      el('div', { class: 'l1' },
        el('button', { class: 'eye' + (l.on ? ' on' : ''), title: 'Zapnout / vypnout vrstvu', 'aria-label': 'Zapnout nebo vypnout vrstvu', onclick: () => { l.on = !l.on; commit(); } }, svg(EYE)),
        el('span', { class: 'name' }, `Vrstva ${li + 1}`),
        el('span', { class: 'label' }, layerLabel(l)),
        el('span', { class: 'ms', id: 'lms' + li }, '')),
      el('div', { class: 'l2' },
        slim(l.opacity, 0, 1, 0.01, v => { l.opacity = v; pct.textContent = Math.round(v * 100) + '%'; send(); }, () => renderProps()),
        pct,
        el('button', { class: 'chip', title: 'Prolínání (klik = další)', onclick: () => { l.blend = BLENDS[(BLENDS.indexOf(l.blend) + 1) % BLENDS.length]; commit(); } }, BLEND_NAME[l.blend]),
        el('button', { class: 'chip', title: 'Rozlišení vrstvy (klik = další)', onclick: () => { l.scale = (l.scale === 1 ? 0.5 : l.scale === 0.5 ? 0.25 : 1) as LayerScale; commit(); } }, SCALE_NAME(l.scale))));
    const row = el('div', { class: 'cliprow' + (l.on ? '' : ' dim') }, lh);
    for (let c = 0; c < CLIP_COLS; c++) row.append(cellEl(li, c));
    rows.append(row);
  }
}

function cellEl(li: number, c: number) {
  const l = state.layers[li], clip = l.clips[c];
  const playing = l.active === c && !!clip;
  const sel = state.selected?.layer === li && state.selected?.col === c;
  const cls = ['cell', clip ? 'filled' : '', clip && isAlphaVideo(clip.content) ? 'alpha' : '', playing ? 'playing' : '', sel ? 'selected' : ''].join(' ');
  const cell = el('button', { class: cls, draggable: clip ? 'true' : undefined, 'data-menu-anchor': '1',
    title: clip ? `${itemName(clip.content)} — klik spustí / zastaví, táhni = přesun (Ctrl = kopie), pravý klik = menu` : 'Prázdná buňka — přetáhni sem klip z knihovny nebo klikni' });
  if (clip) {
    const url = thumbs.get(byId.get(clip.content), clip.params, scheduleGrid);
    if (url) cell.append(el('img', { src: url, alt: '', draggable: 'false' }));
    if (clip.content.startsWith('video:')) cell.append(el('span', { class: 'vbadge' }, isAlphaVideo(clip.content) ? 'VIDEO α' : 'VIDEO'));
    if (playing) cell.append(el('span', { class: 'play', 'aria-label': 'hraje' }));
  } else {
    cell.append(el('div', { class: 'empty' }));
  }
  cell.append(el('span', { class: 'key' }, keyLabel(li, c)));
  cell.onclick = ev => { if (!clip) addMenu(ev.currentTarget as HTMLElement, li, c); else clickClip(li, c); };
  cell.oncontextmenu = ev => { ev.preventDefault(); if (clip) clipMenu(ev.currentTarget as HTMLElement, li, c); else addMenu(ev.currentTarget as HTMLElement, li, c); };

  // drag & drop
  cell.addEventListener('dragstart', e => {
    if (!clip || state.locked) { e.preventDefault(); return; }
    e.dataTransfer!.setData(MIME_CLIP, JSON.stringify({ layer: li, col: c }));
    e.dataTransfer!.effectAllowed = 'copyMove';
  });
  cell.addEventListener('dragover', e => {
    if (!(hasType(e, MIME_CLIP) || hasType(e, MIME_ITEM) || isFileDrag(e))) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = hasType(e, MIME_CLIP) && !e.ctrlKey ? 'move' : 'copy';
    cell.classList.add('dragover');
  });
  cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
  cell.addEventListener('drop', async e => {
    e.preventDefault(); e.stopPropagation(); cell.classList.remove('dragover');
    const dt = e.dataTransfer!;
    if (hasType(e, MIME_CLIP)) { const f = JSON.parse(dt.getData(MIME_CLIP)); moveClip(f.layer, f.col, li, c, e.ctrlKey); }
    else if (hasType(e, MIME_ITEM)) placeItem(dt.getData(MIME_ITEM), li, c);
    else if (isFileDrag(e)) { const ids = await importDropped(e); const vis = ids.find(id => !id.startsWith('audio:')); if (vis) placeItem(vis, li, c); else if (ids[0]) placeItem(ids[0], li, c); }
  });
  return el('div', { class: 'cellwrap' }, cell, el('span', { class: 'cname' + (playing ? ' on' : '') }, clip ? itemName(clip.content) : ''));
}

let gridT: ReturnType<typeof setTimeout> | null = null;
function scheduleGrid() { if (gridT) return; gridT = setTimeout(() => { gridT = null; renderGrid(); }, 60); }

function addMenu(anchor: HTMLElement, li: number, c: number, replace = false) {
  const m = openMenu(anchor, 240);
  m.append(el('div', { class: 'mtitle' }, `${replace ? 'Změnit' : 'Přidat'} klip · Vrstva ${li + 1}, sloupec ${c + 1}`));
  for (const it of content.filter(x => x.kind !== 'audio')) {
    m.append(el('button', { class: 'mitem', onclick: () => {
      state.layers[li].clips[c] = { content: it.id, params: {} };
      state.selected = { layer: li, col: c }; closeMenu(); commit();
    } }, (it.kind === 'video' ? '🎞  ' : '◆  ') + it.name));
  }
  m.append(el('div', { class: 'msep' }));
  m.append(el('button', { class: 'mitem', onclick: async () => {
    closeMenu();
    const r = await vj.pickImport('all');
    if (r?.errors.length) toast('Nepřidáno:\n' + r.errors.join('\n'), true, 6000);
    const vis = r?.ids.find(id => !id.startsWith('audio:'));
    if (vis) placeItem(vis, li, c);
  } }, '+ Z počítače…'));
}

function clipMenu(anchor: HTMLElement, li: number, c: number) {
  const l = state.layers[li], clip = l.clips[c]!;
  const m = openMenu(anchor);
  m.append(el('div', { class: 'mtitle' }, `${itemName(clip.content)} · klávesa ${keyLabel(li, c)}`));
  if (l.active === c) m.append(el('button', { class: 'mitem', onclick: () => { closeMenu(); stop(li); } }, 'Zastavit'));
  else m.append(el('button', { class: 'mitem', onclick: () => { closeMenu(); state.selected = { layer: li, col: c }; launch(li, c); } }, 'Spustit'));
  m.append(el('button', { class: 'mitem', onclick: () => addMenu(anchor, li, c, true) }, 'Změnit vizuál…'));
  const free = l.clips.findIndex((x, i) => !x && i !== c);
  if (free >= 0) m.append(el('button', { class: 'mitem', onclick: () => {
    l.clips[free] = JSON.parse(JSON.stringify(clip)); state.selected = { layer: li, col: free }; closeMenu(); commit();
  } }, `Duplikovat (varianta do sloupce ${free + 1})`));
  const path = byId.get(clip.content)?.path;
  if (path) m.append(el('button', { class: 'mitem', onclick: () => { vj.showInFolder(path); closeMenu(); } }, 'Ukázat soubor ve složce'));
  m.append(el('div', { class: 'msep' }));
  m.append(el('button', { class: 'mitem danger', onclick: () => {
    l.clips[c] = null; if (l.active === c) l.active = -1;
    if (state.selected?.layer === li && state.selected.col === c) state.selected = null;
    closeMenu(); commit();
  } }, 'Odebrat klip z mřížky'));
}

// ---------- knihovna ----------
let libTab: 'shader' | 'video' | 'audio' = 'shader';
document.querySelectorAll<HTMLButtonElement>('#libTabs button').forEach(b => b.onclick = () => {
  libTab = b.dataset.tab as typeof libTab;
  document.querySelectorAll('#libTabs button').forEach(x => x.classList.toggle('on', x === b));
  renderLib();
});
$<HTMLInputElement>('libSearch').oninput = () => renderLib();
$<HTMLInputElement>('libSearch').onkeydown = e => e.stopPropagation(); // psaní nesmí spouštět klipy
$('libAdd').onclick = async () => {
  const r = await vj.pickImport('all');
  if (!r) return;
  if (r.errors.length) toast('Nepřidáno:\n' + r.errors.join('\n'), true, 6000); else toast(`Přidáno do knihovny: ${r.ids.length}`);
};
$('libFolder').onclick = () => vj.openLibrary(libTab === 'shader' ? 'tvary' : libTab === 'video' ? 'videa' : 'zvuk');
fileDropZone($('lib'), $('libDrop'), ids => { if (ids[0]) { const k = ids[0].split(':')[0]; libTab = k as typeof libTab; document.querySelectorAll<HTMLButtonElement>('#libTabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === libTab)); renderLib(); } });
vj.onLibraryProgress(t => { const f = $('libFoot'); f.classList.toggle('busy', !!t); f.textContent = t || 'Přetáhni do buňky v mřížce. Soubory z počítače přetáhni sem.'; });

function renderLib() {
  const list = $('libList'); list.textContent = '';
  const q = $<HTMLInputElement>('libSearch').value.trim().toLowerCase();
  const items = content.filter(c => c.kind === libTab && (!q || c.name.toLowerCase().includes(q) || c.file.toLowerCase().includes(q)));
  list.classList.toggle('rows', libTab === 'audio');
  if (!items.length) {
    list.append(el('div', { class: 'muted sm' }, q ? 'Nic nenalezeno.' : libTab === 'audio' ? 'Žádné skladby. Přidej wav tlačítkem + Přidat nebo přetažením.' : 'Prázdné. Přidej soubory tlačítkem + Přidat nebo je sem přetáhni.'));
    return;
  }
  for (const it of items) {
    if (it.kind === 'audio') {
      const on = state.audio.source === 'wav' && byId.get(trackId())?.id === it.id;
      list.append(el('button', { class: 'atrack' + (on ? ' on' : ''), title: it.file, onclick: () => chooseTrack(it.id) },
        el('span', {}, on && state.audio.playing ? '▶' : '♪'), el('span', { class: 'n' }, it.name)));
      continue;
    }
    const url = thumbs.get(it, {}, scheduleLib);
    const b = el('button', { class: 'litem', draggable: 'true', title: `${it.name} — přetáhni do buňky · dvojklik = do vybrané vrstvy` },
      el('div', { class: 'thumb' + (isAlphaVideo(it.id) ? ' alpha' : '') }, url ? el('img', { src: url, alt: '', draggable: 'false' }) : null,
        it.kind === 'video' ? el('span', { class: 'vbadge' }, isAlphaVideo(it.id) ? 'VIDEO α' : 'VIDEO') : null),
      el('span', {}, it.name));
    b.addEventListener('dragstart', e => { e.dataTransfer!.setData(MIME_ITEM, it.id); e.dataTransfer!.effectAllowed = 'copy'; });
    b.ondblclick = () => {
      const layer = state.selected?.layer ?? LAYER_COUNT - 1;
      const col = firstEmpty(layer);
      if (col < 0) return toast(`Vrstva ${layer + 1} je plná — přetáhni klip do konkrétní buňky.`, true);
      placeItem(it.id, layer, col);
    };
    b.oncontextmenu = ev => {
      ev.preventDefault();
      const m = openMenu({ x: ev.clientX, y: ev.clientY });
      m.append(el('div', { class: 'mtitle' }, it.file));
      if (it.path) m.append(el('button', { class: 'mitem', onclick: () => { vj.showInFolder(it.path!); closeMenu(); } }, 'Ukázat ve složce'));
    };
    list.append(b);
  }
}
let libT: ReturnType<typeof setTimeout> | null = null;
function scheduleLib() { if (libT) return; libT = setTimeout(() => { libT = null; renderLib(); }, 80); }

// ---------- vlastnosti klipu ----------
const DRIVES: [Drive, string][] = [['kick', 'Kopák'], ['bass', 'Basa'], ['high', 'Výšky'], ['loud', 'Hlasitost'], ['none', 'Nic']];

function renderProps() {
  const p = $('props'); p.textContent = '';
  const s = state.selected, clip = selectedClip();
  if (!s || !clip) {
    p.append(el('div', { class: 'card-head' }, el('span', { class: 'title' }, 'Vlastnosti')),
      el('div', { class: 'hint' }, 'Klikni na klip v mřížce: první klik ho spustí, druhý zastaví. Tady se pak ukáže jeho nastavení. Pravý klik otevře menu, tažením klip přesuneš (s Ctrl zkopíruješ).'));
    return;
  }
  const l = state.layers[s.layer];
  const isVideo = clip.content.startsWith('video:');
  p.append(el('div', { class: 'card-head' },
    el('span', { class: 'title ell' }, itemName(clip.content)),
    el('span', { class: 'muted sm' }, `Vrstva ${s.layer + 1} · ${isVideo ? 'video' : 'shader'} · klávesa ${keyLabel(s.layer, s.col)}`),
    el('div', { class: 'spacer' }),
    el('span', { class: 'muted sm' }, l.active === s.col ? '▶ hraje' : 'nehraje')));

  p.append(el('span', { class: 'sect' }, 'KLIP'));
  if (isVideo) {
    p.append(el('div', { class: 'hint' }, 'Video hraje ve smyčce od začátku při každém spuštění. Na zvuk nereaguje.'));
  } else {
    const h = headers.get(clip.content);
    if (!h) { p.append(el('div', { class: 'hint' }, 'Shader se nepodařilo načíst (chyba v hlavičce).')); }
    else {
      const d = h.defaults;
      // Vždy nový objekt hodnot: kompozitor tak pozná změnu (náhled i výstup se hned překreslí).
      const setP = (k: keyof ClipParams, v: any) => { clip.params = { ...clip.params, [k]: v }; send(); scheduleGrid(); };
      const cur = <K extends keyof ClipParams>(k: K) => (clip.params[k] ?? (d as any)[k]);
      p.append(el('div', { class: 'prow' }, el('span', { class: 'plabel' }, 'Reaguje na'),
        el('div', { class: 'segbtns orange' }, ...DRIVES.map(([k, n]) =>
          el('button', { class: cur('drive') === k ? 'on' : '', onclick: () => { setP('drive', k); renderProps(); } }, n))),
        el('span')));
      const sliders: [keyof ClipParams, string, number, number, string][] = [
        ['hard', 'Tvrdost', 0, 1, '0 = plynule, 1 = ostře na úder'],
        ['speed', h.labels?.speed ?? 'Rychlost', 0, 3, ''],
        ['density', h.labels?.density ?? 'Hustota', 0, 1, ''],
        ['size', h.labels?.size ?? 'Velikost', 0, 1, ''],
      ];
      for (const [k, label, min, max, tip] of sliders) {
        const v0 = cur(k) as number;
        const val = el('span', { class: 'val mono' }, v0.toFixed(2));
        p.append(el('div', { class: 'prow', title: tip }, el('span', { class: 'plabel' }, label),
          slim(v0, min, max, 0.01, v => { val.textContent = v.toFixed(2); setP(k, v); }), val));
      }
      for (const q of h.params ?? []) {
        const v0 = clip.params.custom?.[q.name] ?? q.default;
        const val = el('span', { class: 'val mono' }, v0.toFixed(2));
        p.append(el('div', { class: 'prow' }, el('span', { class: 'plabel' }, q.label ?? q.name),
          slim(v0, q.min ?? 0, q.max ?? 1, 0.01, v => { val.textContent = v.toFixed(2); setP('custom', { ...(clip.params.custom ?? {}), [q.name]: v }); }), val));
      }
      const ca = el('input', { type: 'color', value: cur('colA'), title: 'Barva A' }) as HTMLInputElement;
      const cb = el('input', { type: 'color', value: cur('colB'), title: 'Barva B' }) as HTMLInputElement;
      ca.oninput = () => setP('colA', ca.value); cb.oninput = () => setP('colB', cb.value);
      p.append(el('div', { class: 'prow' }, el('span', { class: 'plabel' }, 'Barvy'),
        el('div', { class: 'colors' }, ca, cb,
          el('button', { class: 'btn sm', title: 'Vrátit hodnoty z hlavičky shaderu', onclick: () => { clip.params = {}; send(); renderProps(); scheduleGrid(); } }, 'Výchozí')),
        el('span')));
      p.append(el('div', { class: 'hint' }, 'Napojení jednotlivých posuvníků na zvuk (množství, náběh, doznění) přijde v Etapě 2.'));
    }
  }

  p.append(el('span', { class: 'sect' }, 'VRSTVA'));
  const opv = el('span', { class: 'val mono' }, String(Math.round(l.opacity * 100)));
  p.append(el('div', { class: 'prow' }, el('span', { class: 'plabel' }, 'Průhlednost'),
    slim(l.opacity, 0, 1, 0.01, v => { l.opacity = v; opv.textContent = String(Math.round(v * 100)); send(); }, () => renderGrid()), opv));
  p.append(el('div', { class: 'prow' }, el('span', { class: 'plabel' }, 'Prolínání'),
    el('div', { class: 'segbtns' }, ...BLENDS.map(b => el('button', { class: l.blend === b ? 'on' : '', onclick: () => { l.blend = b; commit(); } }, BLEND_NAME[b]))), el('span')));
  p.append(el('div', { class: 'prow' }, el('span', { class: 'plabel' }, 'Rozlišení'),
    el('div', { class: 'segbtns' }, ...([1, 0.5, 0.25] as LayerScale[]).map(v => el('button', { class: l.scale === v ? 'on' : '', onclick: () => { l.scale = v; commit(); } }, SCALE_NAME(v)))), el('span')));
}

// ---------- zvuk ----------
const bandEls: Record<string, { bar: HTMLElement; dot: HTMLElement; hit: number }> = {};
for (const [k, n] of [['kick', 'Kopák'], ['bass', 'Basa'], ['high', 'Výšky'], ['loud', 'Hlasitost']]) {
  const bar = el('i'), dot = el('span', { class: 'hd' });
  $('bands').append(el('div', { class: 'band' }, el('span', { class: 'plabel' }, n), el('div', { class: 'track' }, bar), dot));
  bandEls[k] = { bar, dot, hit: 0 };
}
const sens = $<HTMLInputElement>('sens');
sens.oninput = () => { state.audio.sens = +sens.value; setRangeFill(sens); $('sensVal').textContent = Math.round(state.audio.sens * 50).toString(); send(false); };
document.querySelectorAll<HTMLButtonElement>('[data-src]').forEach(b => b.onclick = () => {
  state.audio.source = b.dataset.src as AppState['audio']['source']; state.audio.playing = false; send(false); renderAudio(); renderLib();
  if (state.audio.source === 'input') void loadDevices();
});
const trackId = () => content.find(c => c.kind === 'audio' && c.path === state.audio.wavPath)?.id ?? '';
function chooseTrack(id: string) {
  const it = byId.get(id); if (!it?.path) return;
  state.audio.source = 'wav'; state.audio.wavPath = it.path; state.audio.playing = true;
  send(false); renderAudio(); renderLib();
}
$<HTMLSelectElement>('track').onchange = e => { const v = (e.target as HTMLSelectElement).value; if (v) chooseTrack(v); };
$('addTrack').onclick = async () => {
  const r = await vj.pickImport('audio');
  if (r?.errors.length) toast('Nepřidáno:\n' + r.errors.join('\n'), true, 6000);
  const id = r?.ids.find(x => x.startsWith('audio:'));
  if (id) { pendingTrack = id; tryPendingTrack(); }
};
let pendingTrack = '';
/** Nově přidaná skladba se objeví v knihovně o chvilku později (hlídání složky) — pak ji spustíme. */
function tryPendingTrack() { if (pendingTrack && byId.has(pendingTrack)) { chooseTrack(pendingTrack); pendingTrack = ''; } }
$('playWav').onclick = () => {
  if (state.audio.source !== 'wav' || !state.audio.wavPath) { const first = content.find(c => c.kind === 'audio'); if (first) return chooseTrack(first.id); return toast('Nejdřív přidej skladbu (+ Přidat nebo přetáhni wav do panelu Zvuk).'); }
  state.audio.playing = !state.audio.playing; send(false); renderAudio();
};
const seek = $<HTMLInputElement>('seek');
let seeking = false;
seek.addEventListener('pointerdown', () => { seeking = true; });
seek.addEventListener('input', () => { setRangeFill(seek); const dur = stats?.audioDur ?? 0; $('time').textContent = `${mmss(+seek.value * dur)} / ${mmss(dur)}`; });
seek.addEventListener('change', () => { vj.seekAudio(+seek.value * (stats?.audioDur ?? 0)); seeking = false; });
$<HTMLSelectElement>('device').onchange = e => { state.audio.deviceId = (e.target as HTMLSelectElement).value; send(false); renderAudio(); };
$('loadDevices').onclick = () => void loadDevices();
fileDropZone($('audioCard'), $('audioDrop'), ids => { const id = ids.find(x => x.startsWith('audio:')); if (id) { pendingTrack = id; tryPendingTrack(); } });

let deviceLabels = new Map<string, string>();
async function loadDevices() {
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch { /* bez povolení jen beze jmen */ }
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  deviceLabels = new Map(devs.map(d => [d.deviceId, d.label || 'Vstup ' + d.deviceId.slice(0, 6)]));
  const sel = $<HTMLSelectElement>('device'); sel.textContent = '';
  sel.append(el('option', { value: '' }, 'Výchozí vstup'));
  for (const d of devs) sel.append(el('option', { value: d.deviceId, selected: d.deviceId === state.audio.deviceId || undefined }, deviceLabels.get(d.deviceId)!));
  renderAudio();
}
function renderAudio() {
  const a = state.audio;
  document.querySelectorAll<HTMLButtonElement>('[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === a.source));
  $('inRow').hidden = a.source !== 'input';
  const tracks = content.filter(c => c.kind === 'audio');
  const tid = trackId();
  const sel = $<HTMLSelectElement>('track'); sel.textContent = '';
  sel.append(el('option', { value: '' }, tracks.length ? '— vyber skladbu —' : '— žádné skladby, přidej wav —'));
  for (const t of tracks) sel.append(el('option', { value: t.id, selected: t.id === tid || undefined }, t.name));
  $('playWav').textContent = a.source === 'wav' && a.playing ? '❚❚' : '▶';
  const trackName = byId.get(tid)?.name ?? (a.wavPath ? a.wavPath.split(/[\\/]/).pop()! : '');
  $('audioDev').textContent = a.source === 'input' ? 'Kabel · ' + (deviceLabels.get(a.deviceId) ?? 'výchozí vstup') : a.source === 'wav' ? (trackName || 'vyber skladbu') : 'Demo signál 122 BPM';
  sens.value = String(a.sens); setRangeFill(sens); $('sensVal').textContent = Math.round(a.sens * 50).toString();
}

vj.onAudioFrame(f => {
  audioFrame = f;
  for (const k of ['kick', 'bass', 'high', 'loud'] as const) {
    const pct = (f[k].v * 100).toFixed(0) + '%';
    topMeters[k].style.height = pct; bandEls[k].bar.style.width = pct;
    if (f[k].hit) bandEls[k].hit = 1;
  }
  if (f.kick.hit) hitGlow = 1;
});

// ---------- náhled výstupu ----------
const glowOn = $<HTMLInputElement>('glowOn'), glowAmt = $<HTMLInputElement>('glowAmt');
glowOn.onchange = () => { state.glow.on = glowOn.checked; send(); };
glowAmt.oninput = () => { state.glow.amount = +glowAmt.value; setRangeFill(glowAmt); send(); };

// ---------- statistiky z výstupu ----------
vj.onStats(s => {
  stats = s;
  const ok = s.fps >= s.refreshHz * 0.97;
  $('fps').textContent = fmt(s.fps, 0);
  $('fps').style.color = ok ? '' : '#FF7B7B';
  $('gpuMs').textContent = 'GPU ' + (s.gpuMs === null ? '—' : fmt(s.gpuMs, 1).replace('.', ',')) + ' ms';
  const m = /(RTX|GTX)\s*\w*\s*\d{3,4}\w*|Radeon[^,()]*|Intel[^,()]*|SwiftShader/i.exec(s.gpu);
  $('gpuName').textContent = m ? m[0].replace(/\s+/g, ' ').trim() : s.gpu.slice(0, 24);
  $('gpuName').title = s.gpu;
  $('screenLbl').textContent = `VÝSTUP · ${state.outW}×${state.outH} · ${fmt(s.fps, 0)} fps`;
  s.layerGpuMs.forEach((v, i) => { const e = document.getElementById('lms' + i); if (e) e.textContent = v === null || !layerLive(state.layers[i]) ? '' : v.toFixed(2) + ' ms'; });
  $('errBadge').hidden = !s.errors.length;
  if (!seeking) {
    seek.value = String(s.audioDur ? s.audioPos / s.audioDur : 0); setRangeFill(seek);
    $('time').textContent = `${mmss(s.audioPos)} / ${mmss(s.audioDur)}`;
  }
  testMenuRedraw?.();
});

// ---------- klávesy (z pultu i z výstupního okna) ----------
function onKey(name: string) {
  if (name === 'Escape') { state.black = !state.black; send(false); return renderTop(); }
  if (name === 'Ctrl+KeyL') { state.locked = !state.locked; send(false); return renderTop(); }
  if (name === 'Ctrl+KeyS') { if (state.sada) void saveSadaAs(state.sada); else $('brand').click(); return; }
  if (name === 'Space') { $('playWav').click(); return; }
  const k = clipForKey(name);
  if (k) {
    const l = state.layers[k.layer];
    if (!l.clips[k.col]) return;
    if (l.active === k.col) stop(k.layer); else launch(k.layer, k.col);
  }
}
window.addEventListener('keydown', e => {
  const t = e.target as HTMLElement;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes((t as HTMLInputElement).type))) return;
  if (e.repeat) return;
  const name = keyName(e);
  if (name === 'Escape' || name === 'Space' || name === 'Ctrl+KeyS' || /^F\d+$|^Shift\+F\d+$/.test(name) || clipForKey(name)) e.preventDefault();
  onKey(name);
});
vj.onKey(onKey);

// ---------- smyčka pultu: náhled, ukazatele, takt ----------
let previewComp: Compositor | null = null;
const SILENT: AudioFrame = { t: 0, kick: { v: 0, hit: false }, bass: { v: 0, hit: false }, high: { v: 0, hit: false }, loud: { v: 0, hit: false } };
let pLast = performance.now(); const pT0 = performance.now();
const beatDots = Array.from($('beats').children) as HTMLElement[];
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min(0.1, (now - pLast) / 1000); pLast = now;
  hitDot.style.opacity = (0.15 + 0.85 * hitGlow).toFixed(2);
  hitDot.style.boxShadow = hitGlow > 0.2 ? `0 0 ${Math.round(10 * hitGlow)}px #FF9A3C` : 'none';
  hitGlow *= 0.85;
  for (const k in bandEls) { const b = bandEls[k]; b.dot.classList.toggle('hit', b.hit > 0.3); b.hit *= 0.8; }
  const beat = Math.floor(((now - beatT0) / 1000) * state.bpm / 60) % 4;
  beatDots.forEach((d, i) => d.classList.toggle('on', i === ((beat % 4) + 4) % 4));
  if (previewComp && state.preview) previewComp.render(audioFrame ?? SILENT, dt, (now - pT0) / 1000);
  if (audioFrame) audioFrame.kick.hit = audioFrame.bass.hit = audioFrame.high.hit = audioFrame.loud.hit = false;
}

function renderAll() {
  renderTop(); renderGrid(); renderProps(); renderAudio(); renderLib(); renderOutBtn();
  glowOn.checked = state.glow.on; glowAmt.value = String(state.glow.amount); setRangeFill(glowAmt);
  $('preview').style.visibility = state.preview ? 'visible' : 'hidden';
}

function makePreview() {
  try {
    previewComp?.dispose();
    previewComp = new Compositor($<HTMLCanvasElement>('preview'), true);
    previewComp.setContent(content);
    previewComp.setState(state);
    previewComp.resize(640, 360);
  } catch (e) { previewComp = null; console.error('Náhled:', e); }
}
// Ztráta grafiky v pultu (pád ovladače): náhled se po obnově postaví znovu.
$('preview').addEventListener('webglcontextlost', e => { e.preventDefault(); previewComp = null; });
$('preview').addEventListener('webglcontextrestored', () => makePreview());

// ---------- start ----------
(async () => {
  initLayout();
  setContent(await vj.listContent());
  makePreview();
  send(false); renderAll();
  disp = await vj.displays(); renderOutBtn();
  if (await vj.isSmoke()) { // automatický test bez grafické karty: všech 8 vrstev, malé rozlišení
    (window as any).__vjState = () => state; // jen pro automatický test ovládání
    setPreset('all'); state.outW = 640; state.outH = 360; state.selected = { layer: 3, col: 0 }; commit();
    setTimeout(() => { state.preview = false; send(false); }, 4000); // pult vyfotit s náhledem, měřit bez něj
    setTimeout(() => { const a = content.find(c => c.kind === 'audio'); if (a) chooseTrack(a.id); }, 5000); // zkouška přehrání wav
  }
  requestAnimationFrame(loop);
})();

vj.onContentChanged(list => { setContent(list); previewComp?.setContent(list); renderGrid(); renderProps(); renderLib(); renderAudio(); tryPendingTrack();
  for (const p of pendingPlaces.splice(0)) if (byId.has(p.id)) placeItem(p.id, p.layer, p.col); });
