// Klávesy klipů: každá vrstva má svou řadu kláves, sloupec 1–10 = klávesa v řadě.
// Stisk = spustí klip; stisk hrajícího klipu = zastaví ho. Funguje z pultu i z výstupního okna.
import { CLIP_COLS, LAYER_COUNT } from '../shared/types';

const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const QROW = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
const AROW = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
const ZROW = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'];
const FROW = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
const shift = (r: string[]) => r.map(k => 'Shift+' + k);

/** Řady kláves podle vrstvy (index 0 = Vrstva 1 dole). Horní vrstvy mají nejpohodlnější klávesy. */
export const LAYER_KEYS: string[][] = [
  shift(FROW),   // Vrstva 1 (prostředí)  ⇧F1–⇧F10
  FROW,          // Vrstva 2              F1–F10
  shift(QROW),   // Vrstva 3              ⇧Q–⇧P
  shift(DIGITS), // Vrstva 4              ⇧1–⇧0
  ZROW,          // Vrstva 5              Z–/
  AROW,          // Vrstva 6              A–;
  QROW,          // Vrstva 7              Q–P
  DIGITS,        // Vrstva 8              1–0
];

/** Název stisku: "Shift+KeyQ", "Ctrl+KeyL", "Escape"… (shodný v pultu i výstupu). */
export function keyName(e: KeyboardEvent): string {
  return (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code;
}

export function clipForKey(name: string): { layer: number; col: number } | null {
  for (let l = 0; l < LAYER_COUNT; l++) {
    const col = LAYER_KEYS[l].indexOf(name);
    if (col >= 0 && col < CLIP_COLS) return { layer: l, col };
  }
  return null;
}

/** Krátký popisek klávesy do rohu buňky: "Q", "⇧1", "F5", ";". */
export function keyLabel(layer: number, col: number): string {
  const k = LAYER_KEYS[layer]?.[col];
  if (!k) return '';
  const base = k.replace('Shift+', '');
  const short = base.startsWith('Digit') ? base.slice(5) : base.startsWith('Key') ? base.slice(3)
    : ({ Semicolon: ';', Comma: ',', Period: '.', Slash: '/' } as Record<string, string>)[base] ?? base;
  return (k.startsWith('Shift+') ? '⇧' : '') + short;
}
