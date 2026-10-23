// Hlavní proces: otevře pult a výstupní okno, načítá obsah ze složky content/,
// přeposílá zprávy mezi okny a ukládá zprávy z testů do složky zpravy/.
import { app, BrowserWindow, ipcMain, dialog, screen, session, Menu } from 'electron';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, watch, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppState, ContentItem, DisplayInfo, ReportPayload } from '../shared/types';
import { parseShaderHeader } from '../shared/shader-header';

// Hybridní notebooky: chceme výkonnou grafiku (RTX), ne integrovanou.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-webgl-draft-extensions'); // EXT_disjoint_timer_query (GPU ms), kde je

const SMOKE = process.argv.includes('--smoke');
if (SMOKE) app.commandLine.appendSwitch('enable-unsafe-swiftshader'); // test bez skutečné grafiky

const ROOT = app.getAppPath();
const CONTENT = join(ROOT, 'content');
const REPORTS = process.env.VJ_ZPRAVY || join(ROOT, 'zpravy');

let control: BrowserWindow | null = null;
let output: BrowserWindow | null = null;
let lastState: AppState | null = null;

function loadContent(): ContentItem[] {
  const items: ContentItem[] = [];
  const shDir = join(CONTENT, 'shaders');
  if (existsSync(shDir)) for (const f of readdirSync(shDir).sort()) {
    if (extname(f) !== '.glsl') continue;
    const source = readFileSync(join(shDir, f), 'utf8');
    let name = basename(f, '.glsl');
    try { name = parseShaderHeader(source).header.name || name; } catch { /* chybu ukáže až překlad */ }
    items.push({ id: 'shader:' + basename(f, '.glsl'), kind: 'shader', name, file: f, source });
  }
  const vDir = join(CONTENT, 'videos');
  if (existsSync(vDir)) for (const f of readdirSync(vDir).sort()) {
    if (!['.webm', '.mp4'].includes(extname(f).toLowerCase())) continue;
    items.push({ id: 'video:' + f, kind: 'video', name: f, file: f, url: pathToFileURL(join(vDir, f)).href });
  }
  return items;
}

function broadcast(channel: string, ...args: unknown[]) {
  for (const w of [control, output]) if (w && !w.isDestroyed()) w.webContents.send(channel, ...args);
}

function displays(): DisplayInfo[] {
  const prim = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id, label: d.label || `Displej ${i + 1}`, width: d.size.width, height: d.size.height,
    refresh: Math.round(d.displayFrequency || 0), primary: d.id === prim,
  }));
}

function placeOutput(displayId: number, fullscreen: boolean) {
  if (!output) return;
  const d = screen.getAllDisplays().find(x => x.id === displayId) ?? screen.getPrimaryDisplay();
  output.setFullScreen(false);
  output.setBounds({ x: d.bounds.x + 40, y: d.bounds.y + 40, width: 1280, height: 720 });
  if (fullscreen) { output.setBounds(d.bounds); output.setFullScreen(true); }
}

function sendDisplayHz() {
  if (!output || output.isDestroyed()) return;
  const d = screen.getDisplayMatching(output.getBounds());
  output.webContents.send('display-hz', Math.round(d.displayFrequency || 0));
}

function createWindows() {
  const webPreferences = {
    preload: join(__dirname, 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    backgroundThrottling: false, // výstup nesmí zpomalit, když okno není v popředí
  };
  control = new BrowserWindow({ width: SMOKE ? 1707 : 1500, height: SMOKE ? 1067 : 940, minWidth: 1280, minHeight: 760, title: 'VJ pult', backgroundColor: '#111311', webPreferences });
  output = new BrowserWindow({ width: 1280, height: 720, title: 'VJ výstup', backgroundColor: '#000000', webPreferences });
  if (!SMOKE) control.maximize(); // pult vždy přes celou obrazovku notebooku
  control.setMenuBarVisibility(false);
  output.setMenuBarVisibility(false);
  control.loadFile(join(__dirname, 'control.html'));
  if (SMOKE) for (const [w, n] of [[control, 'pult'], [output, 'výstup']] as const) w.webContents.on('console-message', (e: any) => { if (e.level === 'error' || e.level === 'warning') console.log(`[${n}] ${e.message}`); });
  output.loadFile(join(__dirname, 'output.html'));

  // Výstup na externí displej, pokud je připojený (projektor).
  const ext = screen.getAllDisplays().find(d => d.id !== screen.getPrimaryDisplay().id);
  if (ext && !SMOKE) output.once('ready-to-show', () => placeOutput(ext.id, true));

  control.on('closed', () => { control = null; if (output && !output.isDestroyed()) output.close(); });
  output.on('closed', () => { output = null; });
  output.on('moved', sendDisplayHz);
  output.on('enter-full-screen', sendDisplayHz);
  // Spadlý výstup se sám znovu načte (stav mu pult pošle znovu).
  output.webContents.on('render-process-gone', () => { setTimeout(() => output?.webContents.reload(), 500); });
}

app.whenReady().then(() => {
  // Bez menu: žádné náhodné Ctrl+R (znovunačtení) ani F-kláves obsazených menu během hraní.
  Menu.setApplicationMenu(null);
  // Mikrofon / line-in povolit bez dotazu (jde jen o naše vlastní okna).
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'fullscreen'));

  ipcMain.handle('content:list', () => loadContent());
  ipcMain.on('state', (_e, s: AppState) => { lastState = s; if (output && !output.isDestroyed()) output.webContents.send('state', s); });
  ipcMain.on('output:ready', () => { if (lastState && output) output.webContents.send('state', lastState); sendDisplayHz(); });
  screen.on('display-metrics-changed', sendDisplayHz);
  ipcMain.on('audio-frame', (_e, f) => { if (control && !control.isDestroyed()) control.webContents.send('audio-frame', f); });
  ipcMain.on('stats', (_e, s) => { if (control && !control.isDestroyed()) control.webContents.send('stats', s); });
  ipcMain.on('test:start', (_e, minutes: number) => { if (output && !output.isDestroyed()) output.webContents.send('test:start', minutes); });
  ipcMain.on('key', (_e, k: string) => { if (control && !control.isDestroyed()) control.webContents.send('key', k); });
  ipcMain.handle('report:write', (_e, r: ReportPayload) => {
    mkdirSync(REPORTS, { recursive: true });
    const base = join(REPORTS, r.baseName.replace(/[^\w.-]/g, '_'));
    writeFileSync(base + '.json', r.json, 'utf8');
    writeFileSync(base + '.txt', r.txt, 'utf8');
    return base + '.txt';
  });
  ipcMain.handle('dialog:wav', async () => {
    const res = await dialog.showOpenDialog({ title: 'Vyber hudbu', properties: ['openFile'], filters: [{ name: 'Zvuk', extensions: ['wav', 'mp3', 'flac', 'ogg', 'aif', 'aiff'] }] });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle('file:url', (_e, p: string) => pathToFileURL(p).href);
  ipcMain.handle('displays', () => displays());
  ipcMain.on('output:place', (_e, id: number, fs: boolean) => placeOutput(id, fs));
  ipcMain.handle('smoke', () => SMOKE);
  if (SMOKE) ipcMain.on('stats', (_e, s) => console.log(`stats fps=${s.fps.toFixed(1)} errors=${s.errors.length} ${s.errors.join(' | ')}`));
  ipcMain.on('smoke:done', async (_e, ok: boolean, info: string) => {
    console.log((ok ? 'SMOKE OK ' : 'SMOKE FAIL ') + info);
    // snímek výstupu a pultu pro kontrolu očima
    for (const [w, n] of [[output, 'smoke_vystup.png'], [control, 'smoke_pult.png']] as const) {
      if (w) { mkdirSync(REPORTS, { recursive: true }); writeFileSync(join(REPORTS, n), (await w.webContents.capturePage()).toPNG()); }
    }
    app.exit(ok ? 0 : 1);
  });

  createWindows();

  // Živé načítání: uložený shader se hned znovu přeloží (chybný nesmaže obraz).
  let t: NodeJS.Timeout | null = null;
  for (const dir of ['shaders', 'videos']) {
    const p = join(CONTENT, dir);
    if (existsSync(p)) watch(p, () => { if (t) clearTimeout(t); t = setTimeout(() => broadcast('content:changed', loadContent()), 150); });
  }
  if (SMOKE) setTimeout(() => { console.log('SMOKE FAIL timeout'); app.exit(1); }, 150000);
});

app.on('window-all-closed', () => app.quit());
