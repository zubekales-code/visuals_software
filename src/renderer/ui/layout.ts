// Layout pultu = jak je pult rozložený (ne co hraje): šířka knihovny, výška spodní části, šířky tří spodních panelů,
// schovaná knihovna a zmenšení mřížky. Pracovní layout se pamatuje sám; pojmenované layouty jde uložit, přepínat
// a vrátit výchozí. Vše v localStorage (na tomto počítači). Dvojklik na táhlo = výchozí velikost té části.
import { $ } from './dom';

export interface Layout { libW: number; bottomH: number; cols: [number, number, number]; libHidden: boolean; zoom: number }
const KEY = 'vj.layout.v1', PRESETS = 'vj.layouts.v1', CURRENT = 'vj.layout.name';
const ZOOMS = [1, 0.75, 0.5];
const DEF: Layout = { libW: 250, bottomH: 0, cols: [1.25, 1, 0.8], libHidden: false, zoom: 1 };
const clone = (l: Layout): Layout => ({ ...l, cols: [...l.cols] as Layout['cols'] });

function sanitize(s: any): Layout {
  const L = clone(DEF);
  if (!s || typeof s !== 'object') return L;
  if (Number.isFinite(s.libW)) L.libW = Math.max(180, Math.min(520, s.libW));
  if (Number.isFinite(s.bottomH)) L.bottomH = Math.max(0, s.bottomH);
  if (Array.isArray(s.cols) && s.cols.length === 3 && s.cols.every((v: unknown) => Number.isFinite(v) && (v as number) > 0)) L.cols = [...s.cols] as Layout['cols'];
  L.libHidden = !!s.libHidden;
  if (ZOOMS.includes(s.zoom)) L.zoom = s.zoom;
  return L;
}
const read = <T>(k: string, def: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? def; } catch { return def; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* nevadí */ } };

let L: Layout = sanitize(read(KEY, null));
let name: string = read(CURRENT, '');
let onChange: () => void = () => {};

const save = () => write(KEY, L);
/** Ruční změna (táhlo, zmenšení) = už to není přesně uložený layout. */
const touched = () => { if (name) { name = ''; write(CURRENT, ''); } };

function apply() {
  const root = document.documentElement;
  root.style.setProperty('--libW', L.libW + 'px');
  // 0 = výchozí (38 % výšky okna, v mezích)
  const h = L.bottomH || Math.round(Math.min(460, Math.max(300, innerHeight * 0.38)));
  root.style.setProperty('--bottomH', Math.min(h, innerHeight - 260) + 'px');
  $('bottom').style.gridTemplateColumns = `minmax(0, ${L.cols[0]}fr) 8px minmax(0, ${L.cols[1]}fr) 8px minmax(0, ${L.cols[2]}fr)`;
  $('lib').hidden = L.libHidden;
  $('splitLib').hidden = L.libHidden;
  $('libShow').hidden = !L.libHidden;
}
const applyAll = () => { apply(); onChange(); };

// ---------- veřejné API pro pult ----------
export const getZoom = () => L.zoom;
export function setZoom(z: number) { if (!ZOOMS.includes(z)) return; L.zoom = z; touched(); save(); applyAll(); }
export const currentLayoutName = () => name;
export function listLayouts(): string[] { return Object.keys(read<Record<string, Layout>>(PRESETS, {})).sort((a, b) => a.localeCompare(b, 'cs')); }
export function saveLayoutAs(n: string) {
  const all = read<Record<string, Layout>>(PRESETS, {});
  all[n] = clone(L); write(PRESETS, all);
  name = n; write(CURRENT, n);
}
export function loadLayout(n: string): boolean {
  const all = read<Record<string, Layout>>(PRESETS, {});
  if (!all[n]) return false;
  L = sanitize(all[n]); save();
  name = n; write(CURRENT, n);
  applyAll(); return true;
}
export function deleteLayout(n: string) {
  const all = read<Record<string, Layout>>(PRESETS, {});
  delete all[n]; write(PRESETS, all);
  if (name === n) { name = ''; write(CURRENT, ''); }
}
export function resetLayout() { L = clone(DEF); save(); name = ''; write(CURRENT, ''); applyAll(); }

function drag(handle: HTMLElement, cursor: string, onMove: (dx: number, dy: number) => void) {
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('resizing'); document.body.style.cursor = cursor;
    const move = (ev: PointerEvent) => { onMove(ev.clientX - x0, ev.clientY - y0); applyAll(); };
    const up = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up);
      handle.classList.remove('dragging'); document.body.classList.remove('resizing'); document.body.style.cursor = '';
      touched(); save(); onChange();
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
  });
}

/** onLayoutChange = pult si překreslí, co na layoutu závisí (šířka mřížky, lišta). */
export function initLayout(onLayoutChange: () => void) {
  onChange = onLayoutChange;
  apply();
  addEventListener('resize', apply);

  const lib = $('splitLib');
  let w0 = 0;
  lib.addEventListener('pointerdown', () => { w0 = L.libW; });
  drag(lib, 'col-resize', dx => { L.libW = Math.max(180, Math.min(520, w0 + dx)); });
  lib.ondblclick = () => { L.libW = DEF.libW; touched(); save(); applyAll(); };

  const hs = $('splitBottom');
  let h0 = 0;
  hs.addEventListener('pointerdown', () => { h0 = $('bottom').getBoundingClientRect().height; });
  drag(hs, 'row-resize', (_dx, dy) => { L.bottomH = Math.max(180, Math.min(innerHeight - 260, h0 - dy)); });
  hs.ondblclick = () => { L.bottomH = 0; touched(); save(); applyAll(); };

  document.querySelectorAll<HTMLElement>('.vsplit.col').forEach(sp => {
    const i = +sp.dataset.split!; // 0 = mezi náhledem a vlastnostmi, 1 = mezi vlastnostmi a zvukem
    let start: number[] = [], total = 0, px = 0;
    sp.addEventListener('pointerdown', () => {
      start = [...L.cols]; total = start.reduce((a, b) => a + b, 0);
      px = $('bottom').getBoundingClientRect().width - 32 - 16;
    });
    drag(sp, 'col-resize', dx => {
      const d = dx / px * total, min = total * 0.12;
      const a = Math.max(min, start[i] + d), b = Math.max(min, start[i + 1] - (a - start[i]));
      const cols = [...start]; cols[i] = start[i] + start[i + 1] - b; cols[i + 1] = b;
      L.cols = cols as Layout['cols'];
    });
    sp.ondblclick = () => { L.cols = [...DEF.cols] as Layout['cols']; touched(); save(); applyAll(); };
  });

  $('libHide').onclick = () => { L.libHidden = true; touched(); save(); applyAll(); };
  $('libShow').onclick = () => { L.libHidden = false; touched(); save(); applyAll(); };
}
