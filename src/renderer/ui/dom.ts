// Drobné pomocníky pro pult: tvorba prvků, tenké posuvníky, vyskakovací menu, krátké zprávy.

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | false | undefined)[]) {
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

export const svg = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild as Node; };

export function setRangeFill(r: HTMLInputElement) {
  const min = +r.min || 0, max = +r.max || 1;
  r.style.setProperty('--p', ((+r.value - min) / (max - min) * 100).toFixed(1) + '%');
}

/** Tenký posuvník jako v konceptu. onInput při tažení, onChange po puštění. */
export function slim(value: number, min: number, max: number, step: number, onInput: (v: number) => void, onChange?: () => void, cls = '') {
  const r = el('input', { type: 'range', class: 'slim ' + cls, min, max, step, value }) as HTMLInputElement;
  setRangeFill(r);
  r.addEventListener('input', () => { setRangeFill(r); onInput(+r.value); });
  if (onChange) r.addEventListener('change', onChange);
  return r;
}

// ---------- přejmenování na místě (pravý klik na název) ----------
let editInput: HTMLInputElement | null = null;
let editFinish: ((ok: boolean) => void) | null = null;
/** Právě se něco přejmenovává — mřížka se mezitím nepřekresluje (smazala by rozepsaný text).
 *  Pole, které už není na obrazovce, se nepočítá (dřív to uměl zaseknout dvojklik a mřížka se přestala překreslovat). */
export const isEditing = () => !!editInput && editInput.isConnected;
/** Nahradí prvek textovým polem. Enter / klik vedle = uložit, Esc = zrušit. onDone(null) = zrušeno. */
export function inlineEdit(target: HTMLElement, value: string, placeholder: string, onDone: (v: string | null) => void) {
  editFinish?.(true);                       // rozepsané jiné pole nejdřív uložit
  if (!target.isConnected) return;          // prvek mezitím zmizel (překreslení) → nic
  const inp = el('input', { type: 'text', class: 'inedit', value, placeholder, spellcheck: 'false' }) as HTMLInputElement;
  let done = false;
  const finish = (ok: boolean) => {
    if (done) return; done = true;
    if (editInput === inp) { editInput = null; editFinish = null; }
    inp.remove(); target.hidden = false;
    onDone(ok ? inp.value.trim() : null);
  };
  editInput = inp; editFinish = finish;
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
  for (const ev of ['click', 'dblclick', 'mousedown', 'pointerdown', 'contextmenu']) inp.addEventListener(ev, e => e.stopPropagation());
  target.hidden = true; target.after(inp);
  inp.focus(); inp.select();
  if (document.activeElement !== inp) finish(false); // pole nejde aktivovat → hned zrušit, ať nic nevisí
}

// ---------- vyskakovací menu ----------
let onMenuClose: (() => void) | null = null;
export function openMenu(anchor: HTMLElement | { x: number; y: number }, width = 0): HTMLElement {
  const menu = $('menu');
  closeMenu();
  menu.textContent = ''; menu.hidden = false;
  menu.style.minWidth = width ? width + 'px' : '';
  const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const place = () => {
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + mw > innerWidth - 8) x = Math.max(8, innerWidth - mw - 8);
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  };
  menu.style.left = r.left + 'px'; menu.style.top = r.bottom + 6 + 'px';
  requestAnimationFrame(place);
  return menu;
}
export function closeMenu() { const m = $('menu'); if (!m.hidden) { m.hidden = true; const f = onMenuClose; onMenuClose = null; f?.(); } }
export function setMenuClose(f: () => void) { onMenuClose = f; }
document.addEventListener('mousedown', e => {
  const m = $('menu');
  if (!m.hidden && !m.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-menu-anchor]')) closeMenu();
});

// ---------- krátká zpráva dole ----------
let toastT: ReturnType<typeof setTimeout> | null = null;
export function toast(text: string, bad = false, ms = 3500) {
  const t = $('toast');
  t.textContent = text; t.hidden = false; t.classList.toggle('bad', bad);
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, ms);
}

export const fmt = (v: number | null | undefined, d = 1) => v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d);
export const mmss = (s: number) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
