// Knihovna = složka VISUALS SOFTWARE\knihovna (vedle aplikace, aktualizace ji nepřepíše).
//   tvary\*.glsl   3d\*.js (3D scény)   videa\*.webm|*.mp4   zvuk\*.wav…   sady\*.json
// Obsah aplikace (content\) je jen základní balíček: při startu se do knihovny doplní, co v ní ještě nebylo.
import { app } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { ContentItem, ImportResult, SadaInfo } from '../shared/types';
import { parseShaderHeader } from '../shared/shader-header';

export const APP_DIR = app.getAppPath();
/** Složka VISUALS SOFTWARE, když aplikace běží ze start.bat (…\VISUALS SOFTWARE\app); jinak složka aplikace. */
export const BASE_DIR = process.env.VJ_ZAKLAD
  || (basename(APP_DIR).toLowerCase() === 'app' && existsSync(join(dirname(APP_DIR), 'start.bat')) ? dirname(APP_DIR) : APP_DIR);
export const LIB = process.env.VJ_KNIHOVNA || join(BASE_DIR, 'knihovna');
export const DIRS = { tvary: join(LIB, 'tvary'), sceny: join(LIB, '3d'), videa: join(LIB, 'videa'), zvuk: join(LIB, 'zvuk'), sady: join(LIB, 'sady') };

const VIDEO_OK = ['.webm', '.mp4'];
const VIDEO_CONVERT = ['.mov', '.mkv', '.avi', '.m4v', '.gif', '.wmv'];
const AUDIO = ['.wav', '.mp3', '.flac', '.ogg', '.aif', '.aiff', '.m4a'];
const SHADER = ['.glsl', '.frag'];
const SCENE = ['.js'];

/** Založí složky a doplní základní balíček.
 *  Soubor ze základu se do knihovny zkopíruje jednou. Novou verzi ze základu dostane jen tehdy,
 *  když ho v knihovně nikdo neupravil; smazaný soubor se nevrací. */
export function ensureLibrary() {
  for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });
  const markFile = join(LIB, '.zaklad.json');
  let seeded: Record<string, string> = {};
  try { const m = JSON.parse(readFileSync(markFile, 'utf8')); if (m && !Array.isArray(m)) seeded = m; } catch { /* první start */ }
  const hash = (f: string) => createHash('md5').update(readFileSync(f)).digest('hex');
  const pairs: [string, string][] = [[join(APP_DIR, 'content', 'shaders'), DIRS.tvary], [join(APP_DIR, 'content', 'scenes'), DIRS.sceny], [join(APP_DIR, 'content', 'videos'), DIRS.videa]];
  for (const [src, dst] of pairs) {
    if (!existsSync(src)) continue;
    for (const f of readdirSync(src)) {
      const key = basename(dst) + '/' + f, from = join(src, f), to = join(dst, f);
      const newHash = hash(from);
      if (!(key in seeded)) {
        if (!existsSync(to)) copyFileSync(from, to);
        seeded[key] = existsSync(to) ? hash(to) : newHash;
      } else if (existsSync(to) && seeded[key] !== newHash && hash(to) === seeded[key]) {
        copyFileSync(from, to); seeded[key] = newHash; // neupravený soubor → nová verze ze základu
      }
    }
  }
  writeFileSync(markFile, JSON.stringify(seeded, null, 1));
}

export function listLibrary(): ContentItem[] {
  const items: ContentItem[] = [];
  const files = (d: string) => existsSync(d) ? readdirSync(d).filter(f => !f.startsWith('.')).sort((a, b) => a.localeCompare(b, 'cs')) : [];
  for (const f of files(DIRS.tvary)) {
    if (extname(f) !== '.glsl') continue;
    const path = join(DIRS.tvary, f);
    const source = readFileSync(path, 'utf8');
    let name = basename(f, '.glsl');
    try { name = parseShaderHeader(source).header.name || name; } catch { /* chybu ukáže až překlad */ }
    items.push({ id: 'shader:' + basename(f, '.glsl'), kind: 'shader', name, file: f, path, source });
  }
  for (const f of files(DIRS.sceny)) {
    if (extname(f) !== '.js') continue;
    const path = join(DIRS.sceny, f);
    const source = readFileSync(path, 'utf8');
    let name = basename(f, '.js');
    try { name = parseShaderHeader(source).header.name || name; } catch { /* chybu ukáže až načtení */ }
    items.push({ id: 'scene:' + basename(f, '.js'), kind: 'scene', name, file: f, path, source, url: pathToFileURL(path).href });
  }
  for (const f of files(DIRS.videa)) {
    if (!VIDEO_OK.includes(extname(f).toLowerCase())) continue;
    const path = join(DIRS.videa, f);
    items.push({ id: 'video:' + f, kind: 'video', name: basename(f, extname(f)), file: f, path, url: pathToFileURL(path).href });
  }
  for (const f of files(DIRS.zvuk)) {
    if (!AUDIO.includes(extname(f).toLowerCase())) continue;
    const path = join(DIRS.zvuk, f);
    items.push({ id: 'audio:' + f, kind: 'audio', name: basename(f, extname(f)), file: f, path, url: pathToFileURL(path).href });
  }
  return items;
}

function uniqueName(dir: string, file: string): string {
  if (!existsSync(join(dir, file))) return file;
  const ext = extname(file), base = basename(file, ext);
  for (let i = 2; ; i++) { const f = `${base} (${i})${ext}`; if (!existsSync(join(dir, f))) return f; }
}

/** Převede video do WebM VP9 (zachová průhlednost). Volá se jen u formátů, které přehrávač neumí. */
function convertVideo(src: string, dst: string, onProgress: (txt: string) => void): Promise<void> {
  // ffmpeg-static se načítá až tady: v dist/ je externí modul (cesta k binárce musí sedět).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpeg: string = require('ffmpeg-static');
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-y', '-i', src, '-an', '-vf', 'scale=min(1920\\,iw):-2',
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '30', '-b:v', '0', '-auto-alt-ref', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', dst];
    const p = spawn(ffmpeg, args, { windowsHide: true });
    let dur = 0, err = '';
    p.stderr.on('data', (b: Buffer) => {
      const s = b.toString(); err = (err + s).slice(-2000);
      const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(s); if (d) dur = +d[1] * 3600 + +d[2] * 60 + +d[3];
      const t = /time=(\d+):(\d+):([\d.]+)/.exec(s);
      if (t && dur) onProgress(`Převádím ${basename(src)}: ${Math.min(100, Math.round((+t[1] * 3600 + +t[2] * 60 + +t[3]) / dur * 100))} %`);
    });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error('převod videa selhal: ' + err.split('\n').slice(-3).join(' '))));
  });
}

/** Zkopíruje soubory z počítače do knihovny (video v jiném formátu převede). */
export async function importFiles(paths: string[], onProgress: (txt: string) => void): Promise<ImportResult> {
  const res: ImportResult = { ids: [], errors: [] };
  for (const src of paths) {
    const ext = extname(src).toLowerCase(), name = basename(src);
    try {
      if (!existsSync(src) || !statSync(src).isFile()) throw new Error('soubor nenalezen');
      if (SHADER.includes(ext)) {
        const text = readFileSync(src, 'utf8');
        if (!/vec4\s+element\s*\(/.test(text)) throw new Error('není to vizuál pro tuto aplikaci (chybí funkce element)');
        parseShaderHeader(text); // vyhodí chybu u rozbité hlavičky
        const f = uniqueName(DIRS.tvary, basename(src, ext) + '.glsl');
        writeFileSync(join(DIRS.tvary, f), text);
        res.ids.push('shader:' + basename(f, '.glsl'));
      } else if (SCENE.includes(ext)) {
        const text = readFileSync(src, 'utf8');
        if (!/vjScene\s*\(/.test(text)) throw new Error('není to 3D scéna pro tuto aplikaci (chybí vjScene)');
        parseShaderHeader(text);
        const f = uniqueName(DIRS.sceny, basename(src));
        writeFileSync(join(DIRS.sceny, f), text);
        res.ids.push('scene:' + basename(f, '.js'));
      } else if (VIDEO_OK.includes(ext)) {
        onProgress(`Kopíruji ${name}…`);
        const f = uniqueName(DIRS.videa, name);
        copyFileSync(src, join(DIRS.videa, f));
        res.ids.push('video:' + f);
      } else if (VIDEO_CONVERT.includes(ext)) {
        const f = uniqueName(DIRS.videa, basename(src, ext) + '.webm');
        onProgress(`Převádím ${name}…`);
        await convertVideo(src, join(DIRS.videa, f), onProgress);
        res.ids.push('video:' + f);
      } else if (AUDIO.includes(ext)) {
        onProgress(`Kopíruji ${name}…`);
        const f = uniqueName(DIRS.zvuk, name);
        copyFileSync(src, join(DIRS.zvuk, f));
        res.ids.push('audio:' + f);
      } else {
        throw new Error('tento typ souboru knihovna nezná (tvary .glsl, 3D scény .js, videa, zvuk)');
      }
    } catch (e) {
      res.errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  onProgress('');
  return res;
}

// ---------- sady (estetiky) ----------
const sadaFile = (name: string) => join(DIRS.sady, name.replace(/[\\/:*?"<>|]/g, '_').trim() + '.json');

export function listSady(): SadaInfo[] {
  if (!existsSync(DIRS.sady)) return [];
  return readdirSync(DIRS.sady).filter(f => f.endsWith('.json')).map(f => {
    let savedAt = '';
    try { savedAt = JSON.parse(readFileSync(join(DIRS.sady, f), 'utf8')).savedAt ?? ''; } catch { /* nečitelná sada */ }
    return { name: basename(f, '.json'), savedAt };
  }).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export function saveSada(name: string, json: string) { writeFileSync(sadaFile(name), json, 'utf8'); }
export function loadSada(name: string): string | null { const f = sadaFile(name); return existsSync(f) ? readFileSync(f, 'utf8') : null; }
