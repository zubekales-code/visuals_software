// Hlavní proces: otevře pult a výstupní okno, spravuje knihovnu (VISUALS SOFTWARE\knihovna),
// přeposílá zprávy mezi okny, hlídá monitory a ukládá zprávy z testů do složky zpravy/.
import { app, BrowserWindow, ipcMain, dialog, screen, session, Menu, shell } from 'electron';
import { mkdirSync, writeFileSync, watch, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppState, DisplayInfo, DisplaysInfo, OutputPlacement, ReportPayload } from '../shared/types';
import { APP_DIR, BASE_DIR, LIB, DIRS, ensureLibrary, listLibrary, importFiles, listSady, saveSada, loadSada } from './library';

// Hybridní notebooky: chceme výkonnou grafiku (RTX), ne integrovanou.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-webgl-draft-extensions'); // EXT_disjoint_timer_query (GPU ms), kde je

const SMOKE = process.argv.includes('--smoke');
if (SMOKE) app.commandLine.appendSwitch('enable-unsafe-swiftshader'); // test bez skutečné grafiky

const REPORTS = process.env.VJ_ZPRAVY || join(BASE_DIR, 'zpravy');

let control: BrowserWindow | null = null;
let output: BrowserWindow | null = null;
let lastState: AppState | null = null;

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

// ---------- výstup na monitor ----------
let placement: OutputPlacement = { displayId: 0, fullscreen: false };
const externalDisplay = () => screen.getAllDisplays().find(d => d.id !== screen.getPrimaryDisplay().id);

function placeOutput(displayId: number, fullscreen: boolean) {
  if (!output) return;
  const d = screen.getAllDisplays().find(x => x.id === displayId) ?? screen.getPrimaryDisplay();
  output.setFullScreen(false);
  output.setBounds({ x: d.bounds.x + 60, y: d.bounds.y + 60, width: Math.min(1280, d.workArea.width - 120), height: Math.min(720, d.workArea.height - 120) });
  if (fullscreen) { output.setBounds(d.bounds); output.setFullScreen(true); }
  else { output.show(); output.moveTop(); }
  placement = { displayId: d.id, fullscreen };
  sendDisplays(); sendDisplayHz();
}

function displaysInfo(): DisplaysInfo {
  if (output && !output.isDestroyed()) {
    const d = screen.getDisplayMatching(output.getBounds());
    placement = { displayId: d.id, fullscreen: output.isFullScreen() };
  }
  return { displays: displays(), placement };
}
function sendDisplays() { if (control && !control.isDestroyed()) control.webContents.send('displays', displaysInfo()); }

/** Monitor připojený za běhu → výstup na něj přes celou obrazovku; odpojený → výstup do okna na notebooku. */
function watchDisplays() {
  screen.on('display-added', (_e, d) => { if (!SMOKE && d.id !== screen.getPrimaryDisplay().id) setTimeout(() => placeOutput(d.id, true), 800); else sendDisplays(); });
  screen.on('display-removed', (_e, d) => {
    if (placement.displayId === d.id) placeOutput(screen.getPrimaryDisplay().id, false); else sendDisplays();
  });
  screen.on('display-metrics-changed', () => { sendDisplays(); sendDisplayHz(); });
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

  // Výstup na externí displej, pokud je připojený (projektor); jinak okno nad pultem.
  output.once('ready-to-show', () => {
    const ext = externalDisplay();
    if (ext && !SMOKE) placeOutput(ext.id, true);
    else if (!SMOKE) placeOutput(screen.getPrimaryDisplay().id, false);
  });

  control.on('closed', () => { control = null; if (output && !output.isDestroyed()) output.close(); });
  output.on('closed', () => { output = null; });
  output.on('moved', () => { sendDisplayHz(); sendDisplays(); });
  output.on('enter-full-screen', () => { sendDisplayHz(); sendDisplays(); });
  output.on('leave-full-screen', sendDisplays);
  // Spadlý výstup se sám znovu načte (stav mu pult pošle znovu).
  output.webContents.on('render-process-gone', () => { setTimeout(() => output?.webContents.reload(), 500); });
}

app.whenReady().then(() => {
  // Bez menu: žádné náhodné Ctrl+R (znovunačtení) ani F-kláves obsazených menu během hraní.
  Menu.setApplicationMenu(null);
  // Mikrofon / line-in povolit bez dotazu (jde jen o naše vlastní okna).
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'fullscreen'));

  ensureLibrary();
  syncStav();
  ipcMain.handle('content:list', () => listLibrary());
  ipcMain.on('state', (_e, s: AppState) => { lastState = s; if (output && !output.isDestroyed()) output.webContents.send('state', s); });
  ipcMain.on('output:ready', () => { if (lastState && output) output.webContents.send('state', lastState); sendDisplayHz(); });
  watchDisplays();
  ipcMain.on('audio:seek', (_e, sec: number) => { if (output && !output.isDestroyed()) output.webContents.send('audio:seek', sec); });
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
  // ---------- knihovna ----------
  const progress = (txt: string) => { if (control && !control.isDestroyed()) control.webContents.send('library:progress', txt); };
  const afterImport = <T>(r: T) => { broadcast('content:changed', listLibrary()); return r; };
  ipcMain.handle('library:pick', async (_e, kind: 'all' | 'audio') => {
    const filters = kind === 'audio'
      ? [{ name: 'Zvuk', extensions: ['wav', 'mp3', 'flac', 'ogg', 'aif', 'aiff', 'm4a'] }]
      : [{ name: 'Vizuály, videa a zvuk', extensions: ['glsl', 'frag', 'webm', 'mp4', 'mov', 'mkv', 'avi', 'm4v', 'gif', 'wav', 'mp3', 'flac', 'ogg', 'aif', 'aiff', 'm4a'] }];
    const res = await dialog.showOpenDialog(control!, { title: 'Přidat do knihovny', properties: ['openFile', 'multiSelections'], filters });
    if (res.canceled || !res.filePaths.length) return null;
    return afterImport(await importFiles(res.filePaths, progress));
  });
  ipcMain.handle('library:import', async (_e, paths: string[]) => afterImport(await importFiles(paths, progress)));
  ipcMain.on('library:open', (_e, sub: string) => { void shell.openPath((DIRS as Record<string, string>)[sub] ?? LIB); });
  ipcMain.on('library:show', (_e, p: string) => { if (p.startsWith(LIB)) shell.showItemInFolder(p); });
  ipcMain.handle('sady:list', () => listSady());
  ipcMain.handle('sady:save', (_e, n: string, j: string) => saveSada(n, j));
  ipcMain.handle('sady:load', (_e, n: string) => loadSada(n));
  ipcMain.handle('file:url', (_e, p: string) => pathToFileURL(p).href);
  ipcMain.handle('displays', () => displaysInfo());
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
  for (const p of [DIRS.tvary, DIRS.videa, DIRS.zvuk]) {
    if (existsSync(p)) watch(p, () => { if (t) clearTimeout(t); t = setTimeout(() => broadcast('content:changed', listLibrary()), 300); });
  }
  if (SMOKE) setTimeout(() => { console.log('SMOKE FAIL timeout'); app.exit(1); }, 150000);
  // Automatický test ovládání pultu: klik zap/vyp, přetažení klipu, táhlo spodní části.
  if (SMOKE) setTimeout(async () => {
    const js = `(async () => {
      const st = () => window.__vjState();
      const cell = (row, col) => document.querySelectorAll('#rows .cliprow')[row].querySelectorAll('.cell')[col];
      const out = [];
      const a0 = st().layers[7].active; cell(0, 0).click(); const a1 = st().layers[7].active; cell(0, 0).click(); const a2 = st().layers[7].active;
      out.push('toggle ' + a0 + '>' + a1 + '>' + a2);
      const dt = new DataTransfer();
      cell(0, 1).dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      cell(0, 5).dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      cell(0, 5).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      const L = st().layers[7];
      out.push('move col1=' + (L.clips[1] && L.clips[1].content) + ' col5=' + (L.clips[5] && L.clips[5].content));
      const dt2 = new DataTransfer();
      cell(0, 5).dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt2, bubbles: true }));
      cell(1, 7).dispatchEvent(new DragEvent('drop', { dataTransfer: dt2, bubbles: true, cancelable: true, ctrlKey: true }));
      out.push('copy L7col7=' + (st().layers[6].clips[7] && st().layers[6].clips[7].content) + ' L8col5=' + (st().layers[7].clips[5] && st().layers[7].clips[5].content));
      const h0 = document.getElementById('bottom').getBoundingClientRect().height;
      const sp = document.getElementById('splitBottom'), r = sp.getBoundingClientRect();
      sp.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.x + 5, clientY: r.y + 4, pointerId: 1, bubbles: true }));
      sp.dispatchEvent(new PointerEvent('pointermove', { clientX: r.x + 5, clientY: r.y - 100, pointerId: 1, bubbles: true }));
      sp.dispatchEvent(new PointerEvent('pointerup', { clientX: r.x + 5, clientY: r.y - 100, pointerId: 1, bubbles: true }));
      out.push('bottom ' + Math.round(h0) + '>' + Math.round(document.getElementById('bottom').getBoundingClientRect().height));
      return out.join(' | ');
    })()`;
    try { console.log('UI ' + await control!.webContents.executeJavaScript(js)); } catch (e) { console.log('UI FAIL ' + (e as Error).message); }
  }, 7000);
  // Automatický test importu (soubory připraví testovací skript): kopie zvuku + převod videa ffmpegem.
  if (SMOKE && process.env.VJ_SMOKE_IMPORT) setTimeout(async () => {
    const r = await importFiles(process.env.VJ_SMOKE_IMPORT!.split('|'), () => {});
    console.log(`IMPORT ids=${r.ids.join(',')} errors=${r.errors.join(' | ')}`);
    broadcast('content:changed', listLibrary());
  }, 1500);
});

app.on('window-all-closed', () => app.quit());

/** stav.md z aplikace → VISUALS SOFTWARE\STAV\stav.md (po každé aktualizaci je tam aktuální stav). */
function syncStav() {
  const src = join(APP_DIR, 'stav.md'), dstDir = join(BASE_DIR, 'STAV');
  if (BASE_DIR === APP_DIR || !existsSync(src) || !existsSync(dstDir)) return;
  try { copyFileSync(src, join(dstDir, 'stav.md')); } catch { /* soubor otevřený jinde — nevadí */ }
}
