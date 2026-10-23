// Pult podle schváleného konceptu: horní lišta, mřížka vrstvy × klipy, dole náhled | vlastnosti klipu | zvuk.
// Pult je „pravda“ o stavu: každou změnu pošle výstupu a uloží (autosave).
import type { AppState, AudioFrame, Blend, ClipParams, ClipState, ContentItem, Drive, LayerScale, LayerState, OutputStats, ShaderHeader } from '../shared/types';
import { defaultState, activeClip, layerLive, LAYER_COUNT, CLIP_COLS } from '../shared/types';
import { parseShaderHeader } from '../shared/shader-header';
import { Compositor } from './engine/compositor';
import { Thumbs } from './thumbs';
import { clipForKey, keyLabel, keyName } from './keys';

const vj = window.vj;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | false | undefined)[]) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') e.className = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false && v !== null) e.setAttribute(k, String(v));
  }
  for (const c of kids) if (c != null && c !== false) e.append(c);
  return e;
}
const svg = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild as Node; };
const EYE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

// ---------- stav + autosave ----------
const SAVE_KEY = 'vj.state.v2';
function loadState(): AppState {
  const d = defaultState();
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && Array.isArray(s.layers) && s.layers.length === LAYER_COUNT && s.layers.every((l: any) => Array.isArray(l?.clips))) {
      const out: AppState = { ...d, ...s, glow: { ...d.glow, ...s.glow }, audio: { ...d.audio, ...s.audio, playing: false } };
      out.layers = s.layers.map((l: LayerState, i: number) => ({ ...d.layers[i], ...l, clips: Array.from({ length: CLIP_COLS }, (_, c) => l.clips[c] ?? null) }));
      out.black = false; out.locked = false;
      return out;
    }
  } catch { /* poškozený záznam → výchozí stav */ }
  return d;
}
let state = loadState();
let saveT: ReturnType<typeof setTimeout> | null = null;
/** Pošle stav výstupu + uloží. Překreslení si volající řídí sám (při tažení posuvníku se nepřekresluje vše). */
function send() {
  vj.sendState(state);
  previewComp?.setState(state);
  if (saveT) clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* plný disk apod. */ } }, 300);
}
function commit() { send(); renderAll(); }

let content: ContentItem[] = [];
let byId = new Map<string, ContentItem>();
const headers = new Map<string, ShaderHeader>();
let stats: OutputStats | null = null;
let audioFrame: AudioFrame | null = null;
const thumbs = new Thumbs(() => scheduleGrid());

function setContent(list: ContentItem[]) {
  content = list; byId = new Map(list.map(c => [c.id, c]));
  headers.clear();
  for (const c of list) if (c.kind === 'shader' && c.source) { try { headers.set(c.id, parseShaderHeader(c.source).header); } catch { /* chyba se ukáže v testu */ } }
}
const itemName = (id: string) => byId.get(id)?.name ?? id.replace(/^\w+:/, '') + ' (chybí)';
const isAlphaVideo = (id: string) => id.startsWith('video:') && id.toLowerCase().endsWith('.webm');

// ---------- akce ----------
function launch(layer: number, col: number) {
  const l = state.layers[layer]; if (!l || !l.clips[col]) return;
  l.active = col; send(); renderGrid(); renderProps();
}
function stop(layer: number) { const l = state.layers[layer]; if (!l) return; l.active = -1; send(); renderGrid(); renderProps(); }
function select(layer: number, col: number) { state.selected = { layer, col }; send(); renderGrid(); renderProps(); }
function selectedClip(): ClipState | null {
  const s = state.selected; return s ? state.layers[s.layer]?.clips[s.col] ?? null : null;
}

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
let beatT0 = performance.now();

$('black').onclick = () => { state.black = !state.black; send(); renderTop(); };
$('lock').onclick = () => { state.locked = !state.locked; send(); renderTop(); };

function renderTop() {
  $('bpm').textContent = state.bpm.toFixed(1);
  $('black').classList.toggle('on', state.black);
  $('lock').classList.toggle('on', state.locked);
  document.body.classList.toggle('locked', state.locked);
}

// projektor / výstup
let displaysCache: Awaited<ReturnType<typeof vj.displays>> = [];
async function refreshDisplays() {
  displaysCache = await vj.displays();
  const ext = displaysCache.find(d => !d.primary);
  $('projDot').classList.toggle('ok', !!ext);
  $('projTxt').textContent = (ext ? 'Projektor' : 'Bez projektoru') + ` · ${state.outW}×${state.outH}`;
}
$('projBtn').onclick = e => {
  const m = openMenu(e.currentTarget as HTMLElement);
  m.append(el('div', { class: 'mtitle' }, 'Výstup'));
  const res = el('select', { onchange: (ev: Event) => { const [w, h] = (ev.target as HTMLSelectElement).value.split('x').map(Number); state.outW = w; state.outH = h; send(); void refreshDisplays(); } },
    ...['1920x1080', '1280x720', '2560x1440', '640x360'].map(v => el('option', { value: v, selected: v === `${state.outW}x${state.outH}` }, v.replace('x', '×') + (v === '640x360' ? ' (zkouška)' : ''))));
  m.append(el('div', { class: 'mrow' }, el('span', { class: 'muted sm' }, 'Rozlišení'), res));
  m.append(el('div', { class: 'msep' }));
  for (const d of displaysCache) {
    m.append(el('button', { class: 'mitem', onclick: () => { vj.placeOutput(d.id, true); closeMenu(); } },
      `${d.primary ? 'Notebook' : 'Projektor'} · ${d.label} · ${d.width}×${d.height} · ${d.refresh} Hz`, el('span', { class: 'muted' }, '⤢')));
  }
  m.append(el('button', { class: 'mitem', onclick: () => { vj.placeOutput(0, false); closeMenu(); } }, 'Výstup v okně'));
  m.append(el('div', { class: 'msep' }));
  const pv = el('input', { type: 'checkbox', checked: state.preview || undefined, onchange: (ev: Event) => { state.preview = (ev.target as HTMLInputElement).checked; send(); renderAll(); } });
  m.append(el('label', { class: 'mrow' }, pv, 'Živý náhled v pultu'));
  m.append(el('div', { class: 'mrow muted sm' }, 'Displej, na kterém běží výstup, přepni na 60 Hz.'));
};

// test výkonu (Etapa 0)
let lastTest = '';
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
};
let testMenuRedraw: (() => void) | null = null;

function setPreset(kind: 'gate' | 'all' | 'none') {
  state.layers.forEach((l, i) => {
    if (kind === 'none') { l.active = -1; return; }
    const first = l.clips.findIndex(c => !!c);
    l.on = true; l.opacity = 1; l.scale = 1;
    l.active = kind === 'gate' && i === 0 ? -1 : first; // brána: vrstvy 2–8 (7 vrstev vč. videa)
  });
  if (kind !== 'none') { state.glow.on = true; state.outW = 1920; state.outH = 1080; }
  commit(); void refreshDisplays();
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

function setRangeFill(r: HTMLInputElement) {
  const min = +r.min || 0, max = +r.max || 1;
  r.style.setProperty('--p', ((+r.value - min) / (max - min) * 100).toFixed(1) + '%');
}
function slim(value: number, min: number, max: number, step: number, onInput: (v: number) => void, onChange?: () => void, cls = '') {
  const r = el('input', { type: 'range', class: 'slim ' + cls, min, max, step, value }) as HTMLInputElement;
  setRangeFill(r);
  r.addEventListener('input', () => { setRangeFill(r); onInput(+r.value); });
  if (onChange) r.addEventListener('change', onChange);
  return r;
}

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
  const cell = el('button', { class: cls, title: clip ? itemName(clip.content) : 'Prázdná buňka — klikni a přidej klip' });
  if (clip) {
    const url = thumbs.get(byId.get(clip.content), clip.params, scheduleGrid);
    if (url) cell.append(el('img', { src: url, alt: '', draggable: 'false' }));
    if (clip.content.startsWith('video:')) cell.append(el('span', { class: 'vbadge' }, isAlphaVideo(clip.content) ? 'VIDEO α' : 'VIDEO'));
    if (playing) cell.append(el('span', { class: 'play', 'aria-label': 'hraje' }));
  } else {
    cell.append(el('div', { class: 'empty' }));
  }
  cell.append(el('span', { class: 'key' }, keyLabel(li, c)));
  cell.onclick = ev => {
    if (!clip) return addMenu(ev.currentTarget as HTMLElement, li, c);
    if (playing) select(li, c);
    else { state.selected = { layer: li, col: c }; launch(li, c); }
  };
  cell.oncontextmenu = ev => { ev.preventDefault(); if (clip) clipMenu(ev.currentTarget as HTMLElement, li, c); else addMenu(ev.currentTarget as HTMLElement, li, c); };
  return el('div', { class: 'cellwrap' }, cell, el('span', { class: 'cname' + (playing ? ' on' : '') }, clip ? itemName(clip.content) : ''));
}

let gridT: ReturnType<typeof setTimeout> | null = null;
function scheduleGrid() { if (gridT) return; gridT = setTimeout(() => { gridT = null; renderGrid(); }, 60); }

function addMenu(anchor: HTMLElement, li: number, c: number, replace = false) {
  const m = openMenu(anchor);
  m.append(el('div', { class: 'mtitle' }, `${replace ? 'Změnit' : 'Přidat'} klip · Vrstva ${li + 1}, sloupec ${c + 1}`));
  for (const it of content) {
    m.append(el('button', { class: 'mitem', onclick: () => {
      state.layers[li].clips[c] = { content: it.id, params: replace ? {} : {} };
      state.selected = { layer: li, col: c }; closeMenu(); commit();
    } }, (it.kind === 'video' ? '🎞  ' : '◆  ') + it.name));
  }
  if (!content.length) m.append(el('div', { class: 'mrow muted sm' }, 'Složka content je prázdná.'));
}

function clipMenu(anchor: HTMLElement, li: number, c: number) {
  const l = state.layers[li], clip = l.clips[c]!;
  const m = openMenu(anchor);
  m.append(el('div', { class: 'mtitle' }, `${itemName(clip.content)} · klávesa ${keyLabel(li, c)}`));
  if (l.active === c) m.append(el('button', { class: 'mitem', onclick: () => { closeMenu(); stop(li); } }, 'Zastavit'));
  else m.append(el('button', { class: 'mitem', onclick: () => { closeMenu(); launch(li, c); } }, 'Spustit'));
  m.append(el('button', { class: 'mitem', onclick: () => addMenu(anchor, li, c, true) }, 'Změnit vizuál…'));
  const free = l.clips.findIndex((x, i) => !x && i !== c);
  if (free >= 0) m.append(el('button', { class: 'mitem', onclick: () => {
    l.clips[free] = JSON.parse(JSON.stringify(clip)); state.selected = { layer: li, col: free }; closeMenu(); commit();
  } }, `Duplikovat (varianta do sloupce ${free + 1})`));
  m.append(el('div', { class: 'msep' }));
  m.append(el('button', { class: 'mitem danger', onclick: () => {
    l.clips[c] = null; if (l.active === c) l.active = -1;
    if (state.selected?.layer === li && state.selected.col === c) state.selected = null;
    closeMenu(); commit();
  } }, 'Odebrat klip'));
}

// ---------- vlastnosti klipu ----------
const DRIVES: [Drive, string][] = [['kick', 'Kopák'], ['bass', 'Basa'], ['high', 'Výšky'], ['loud', 'Hlasitost'], ['none', 'Nic']];
const fmt = (v: number | null | undefined, d = 1) => v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d);

function renderProps() {
  const p = $('props'); p.textContent = '';
  const s = state.selected, clip = selectedClip();
  if (!s || !clip) {
    p.append(el('div', { class: 'card-head' }, el('span', { class: 'title' }, 'Vlastnosti')),
      el('div', { class: 'hint' }, 'Klikni na klip v mřížce. Klik spustí klip a ukáže tady jeho nastavení. Pravý klik otevře menu (změnit, duplikovat, odebrat).'));
    return;
  }
  const l = state.layers[s.layer];
  const isVideo = clip.content.startsWith('video:');
  p.append(el('div', { class: 'card-head' },
    el('span', { class: 'title ell' }, itemName(clip.content)),
    el('span', { class: 'muted sm' }, `Vrstva ${s.layer + 1} · ${isVideo ? 'video' : 'shader'} · klávesa ${keyLabel(s.layer, s.col)}`),
    el('div', { class: 'spacer' }),
    el('span', { class: 'muted sm' }, l.active === s.col ? '▶ hraje' : '')));

  p.append(el('span', { class: 'sect' }, 'KLIP'));
  if (isVideo) {
    p.append(el('div', { class: 'hint' }, 'Video hraje ve smyčce od začátku při každém spuštění. Na zvuk nereaguje.'));
  } else {
    const h = headers.get(clip.content);
    if (!h) { p.append(el('div', { class: 'hint' }, 'Shader se nepodařilo načíst (chyba v hlavičce).')); }
    else {
      const d = h.defaults, P = clip.params;
      const setP = (k: keyof ClipParams, v: any) => { (P as any)[k] = v; send(); scheduleGrid(); };
      p.append(el('div', { class: 'prow' }, el('span', { class: 'plabel' }, 'Reaguje na'),
        el('div', { class: 'segbtns orange' }, ...DRIVES.map(([k, n]) =>
          el('button', { class: (P.drive ?? d.drive) === k ? 'on' : '', onclick: () => { setP('drive', k); renderProps(); } }, n))),
        el('span')));
      const sliders: [keyof ClipParams, string, number, number][] = [
        ['hard', 'Tvrdost', 0, 1],
        ['speed', h.labels?.speed ?? 'Rychlost', 0, 3],
        ['density', h.labels?.density ?? 'Hustota', 0, 1],
        ['size', h.labels?.size ?? 'Velikost', 0, 1],
      ];
      for (const [k, label, min, max] of sliders) {
        const cur = (P[k] as number | undefined) ?? (d as any)[k] as number;
        const val = el('span', { class: 'val mono' }, cur.toFixed(2));
        p.append(el('div', { class: 'prow', title: k === 'hard' ? '0 = plynule, 1 = ostře na úder' : '' }, el('span', { class: 'plabel' }, label),
          slim(cur, min, max, 0.01, v => { val.textContent = v.toFixed(2); setP(k, v); }), val));
      }
      for (const q of h.params ?? []) {
        const cur = P.custom?.[q.name] ?? q.default;
        const val = el('span', { class: 'val mono' }, cur.toFixed(2));
        p.append(el('div', { class: 'prow' }, el('span', { class: 'plabel' }, q.label ?? q.name),
          slim(cur, q.min ?? 0, q.max ?? 1, 0.01, v => { val.textContent = v.toFixed(2); P.custom = { ...(P.custom ?? {}), [q.name]: v }; send(); scheduleGrid(); }), val));
      }
      const ca = el('input', { type: 'color', value: P.colA ?? d.colA, title: 'Barva A' }) as HTMLInputElement;
      const cb = el('input', { type: 'color', value: P.colB ?? d.colB, title: 'Barva B' }) as HTMLInputElement;
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
sens.oninput = () => { state.audio.sens = +sens.value; setRangeFill(sens); $('sensVal').textContent = Math.round(state.audio.sens * 50).toString(); send(); };
document.querySelectorAll<HTMLButtonElement>('[data-src]').forEach(b => b.onclick = () => {
  state.audio.source = b.dataset.src as AppState['audio']['source']; state.audio.playing = false; send(); renderAudio();
  if (state.audio.source === 'input') void loadDevices();
});
$('pickWav').onclick = async () => { const p = await vj.pickWav(); if (p) { state.audio.wavPath = p; state.audio.playing = true; send(); renderAudio(); } };
$('playWav').onclick = () => { state.audio.playing = !state.audio.playing; send(); };
$<HTMLSelectElement>('device').onchange = e => { state.audio.deviceId = (e.target as HTMLSelectElement).value; send(); renderAudio(); };
$('loadDevices').onclick = () => void loadDevices();
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
  $('wavRow').hidden = a.source !== 'wav';
  const wav = a.wavPath ? a.wavPath.split(/[\\/]/).pop()! : '—';
  $('wavName').textContent = wav;
  $('audioDev').textContent = a.source === 'input' ? (deviceLabels.get(a.deviceId) ?? 'Výchozí vstup') : a.source === 'wav' ? wav : 'Demo signál 122 BPM';
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
  testMenuRedraw?.();
});

// ---------- klávesy (z pultu i z výstupního okna) ----------
function onKey(name: string) {
  if (name === 'Escape') { state.black = !state.black; send(); return renderTop(); }
  if (name === 'Ctrl+KeyL') { state.locked = !state.locked; send(); return renderTop(); }
  if (name === 'Space') { state.audio.playing = !state.audio.playing; return send(); }
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
  if (name === 'Escape' || name === 'Space' || /^F\d+$|^Shift\+F\d+$/.test(name) || clipForKey(name)) e.preventDefault();
  onKey(name);
});
vj.onKey(onKey);

// ---------- vyskakovací menu ----------
const menu = $('menu');
function openMenu(anchor: HTMLElement, width = 0): HTMLElement {
  menu.textContent = ''; menu.hidden = false; testMenuRedraw = null;
  menu.style.minWidth = width ? width + 'px' : '';
  const r = anchor.getBoundingClientRect();
  requestAnimationFrame(() => {
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + mw > innerWidth - 8) x = innerWidth - mw - 8;
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  });
  menu.style.left = r.left + 'px'; menu.style.top = r.bottom + 6 + 'px';
  return menu;
}
function closeMenu() { menu.hidden = true; testMenuRedraw = null; }
document.addEventListener('mousedown', e => { if (!menu.hidden && !menu.contains(e.target as Node) && !(e.target as HTMLElement).closest('#testBtn,#projBtn')) closeMenu(); });

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
  renderTop(); renderGrid(); renderProps(); renderAudio();
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
  setContent(await vj.listContent());
  makePreview();
  send(); renderAll();
  if (await vj.isSmoke()) { // automatický test bez grafické karty: všech 8 vrstev, malé rozlišení
    setPreset('all'); state.outW = 640; state.outH = 360; state.selected = { layer: 3, col: 0 }; commit();
    setTimeout(() => { state.preview = false; send(); }, 4000); // pult vyfotit s náhledem, měřit bez něj
  }
  void refreshDisplays();
  requestAnimationFrame(loop);
})();

vj.onContentChanged(list => { setContent(list); previewComp?.setContent(list); renderGrid(); renderProps(); });
