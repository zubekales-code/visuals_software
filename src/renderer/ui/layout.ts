// Táhla mezi částmi pultu: šířka knihovny, výška spodní části, šířky tří spodních panelů.
// Velikosti se pamatují (localStorage). Dvojklik na táhlo = výchozí velikost.
import { $ } from './dom';

interface Layout { libW: number; bottomH: number; cols: [number, number, number]; libHidden: boolean }
const KEY = 'vj.layout.v1';
const DEF: Layout = { libW: 250, bottomH: 0, cols: [1.25, 1, 0.8], libHidden: false };
let L: Layout = { ...DEF, cols: [...DEF.cols] as Layout['cols'] };
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) L = { ...L, ...s }; } catch { /* výchozí */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch { /* nevadí */ } };

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

function drag(handle: HTMLElement, cursor: string, onMove: (dx: number, dy: number) => void) {
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('resizing'); document.body.style.cursor = cursor;
    const move = (ev: PointerEvent) => { onMove(ev.clientX - x0, ev.clientY - y0); apply(); };
    const up = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up);
      handle.classList.remove('dragging'); document.body.classList.remove('resizing'); document.body.style.cursor = '';
      save();
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
  });
}

export function initLayout() {
  apply();
  addEventListener('resize', apply);

  const lib = $('splitLib');
  let w0 = 0;
  lib.addEventListener('pointerdown', () => { w0 = L.libW; });
  drag(lib, 'col-resize', dx => { L.libW = Math.max(180, Math.min(520, w0 + dx)); });
  lib.ondblclick = () => { L.libW = DEF.libW; apply(); save(); };

  const hs = $('splitBottom');
  let h0 = 0;
  hs.addEventListener('pointerdown', () => { h0 = $('bottom').getBoundingClientRect().height; });
  drag(hs, 'row-resize', (_dx, dy) => { L.bottomH = Math.max(180, Math.min(innerHeight - 260, h0 - dy)); });
  hs.ondblclick = () => { L.bottomH = 0; apply(); save(); };

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
    sp.ondblclick = () => { L.cols = [...DEF.cols] as Layout['cols']; apply(); save(); };
  });

  $('libHide').onclick = () => { L.libHidden = true; apply(); save(); };
  $('libShow').onclick = () => { L.libHidden = false; apply(); save(); };
}
