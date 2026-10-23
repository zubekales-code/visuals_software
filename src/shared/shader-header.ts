// Čte hlavičku shaderu: JSON v komentáři /*{ ... }*/ na začátku souboru.
// Díky ní se posuvníky (a jejich výchozí hodnoty) vytvoří samy — nový vizuál = jen nový soubor.
import type { ShaderHeader, Drive } from './types';

const DRIVES: Drive[] = ['kick', 'bass', 'high', 'loud', 'none'];

export const DEFAULTS: ShaderHeader['defaults'] = {
  drive: 'loud', hard: 0.3, speed: 1, density: 0.5, size: 0.5, colA: '#ffffff', colB: '#ffffff',
};

export function parseShaderHeader(src: string): { header: ShaderHeader; body: string } {
  const m = /^\s*\/\*\s*(\{[\s\S]*?\})\s*\*\//.exec(src);
  if (!m) return { header: { name: '', defaults: { ...DEFAULTS } }, body: src };
  let raw: any;
  try { raw = JSON.parse(m[1]); }
  catch (e) { throw new Error('Hlavička shaderu není platný JSON: ' + (e as Error).message); }
  const d = { ...DEFAULTS, ...(raw.defaults ?? {}) };
  if (!DRIVES.includes(d.drive)) d.drive = 'loud';
  for (const k of ['hard', 'speed', 'density', 'size'] as const) d[k] = Number.isFinite(+d[k]) ? +d[k] : DEFAULTS[k];
  const params = Array.isArray(raw.params) ? raw.params
    .filter((p: any) => typeof p?.name === 'string' && /^[A-Za-z_]\w*$/.test(p.name))
    .map((p: any) => ({ name: p.name, label: p.label, default: +p.default || 0, min: p.min ?? 0, max: p.max ?? 1 })) : [];
  const header: ShaderHeader = {
    name: String(raw.name ?? ''), popis: raw.popis, feedback: !!raw.feedback, defaults: d, labels: raw.labels, params,
  };
  // Tělo = zbytek souboru; počet řádků hlavičky zachováme prázdnými řádky, aby čísla řádků v chybách seděla.
  const headLines = m[0].split('\n').length - 1;
  return { header, body: '\n'.repeat(headLines) + src.slice(m[0].length) };
}

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(String(h).replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
