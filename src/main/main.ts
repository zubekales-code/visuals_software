// Hlavní proces: otevře pult a výstupní okno, spravuje knihovnu (VISUALS SOFTWARE\knihovna),
// přeposílá zprávy mezi okny, hlídá monitory a ukládá zprávy z testů do složky zpravy/.
import { app, BrowserWindow, ipcMain, dialog, screen, session, Menu, shell, desktopCapturer } from 'electron';
import { mkdirSync, writeFileSync, watch, existsSync, copyFileSync, readFileSync, appendFileSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppState, DisplayInfo, DisplaysInfo, OutputPlacement, ReportPayload } from '../shared/types';
import { APP_DIR, BASE_DIR, LIB, DIRS, ensureLibrary, listLibrary, importFiles, listSady, saveSada, loadSada } from './library';

// Hybridní notebooky: chceme výkonnou grafiku (RTX), ne integrovanou.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// Windows: zakryté okno (výstup za pultem) Chromium „uspí“ — přestane kreslit, analyzovat zvuk a posílat údery
// do pultu. Pak tvary v náhledu žijí, ale nereagují na hudbu. Uspávání zakrytých oken proto vypínáme.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-webgl-draft-extensions'); // EXT_disjoint_timer_query (GPU ms), kde je

const SMOKE = process.argv.includes('--smoke');
if (SMOKE) app.commandLine.appendSwitch('enable-unsafe-swiftshader'); // test bez skutečné grafiky

const REPORTS = process.env.VJ_ZPRAVY || join(BASE_DIR, 'zpravy');

// ---------- záznam chyb: VISUALS SOFTWARE\zpravy\chyby.txt ----------
// Aby šlo zpětně zjistit, co se stalo (zamrzlý pult, spadlý výstup, chyba v kódu). Stejná zpráva max. 1× za 10 s.
const LOG = join(REPORTS, 'chyby.txt');
const lastLogged = new Map<string, number>();
function logLine(who: string, text: string) {
  const key = who + text, now = Date.now();
  if ((lastLogged.get(key) ?? 0) > now - 10000) return;
  lastLogged.set(key, now);
  try {
    mkdirSync(REPORTS, { recursive: true });
    if (existsSync(LOG) && statSync(LOG).size > 2_000_000) renameSync(LOG, LOG.replace('.txt', '_stare.txt'));
    const t = new Date().toLocaleString('cs-CZ');
    appendFileSync(LOG, `[${t}] ${who}: ${String(text).slice(0, 2000)}\r\n`, 'utf8');
  } catch { /* zápis se nepovedl — nevadí */ }
}
process.on('uncaughtException', e => logLine('hlavní proces', e.stack || e.message));

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
// Okno výstupu žije vždy (počítá zvuk a obraz pro náhled v pultu); „vypnout výstup“ ho jen SKRYJE (ne minimalizuje).
let placement: OutputPlacement = { displayId: 0, fullscreen: false, visible: false };
let outputVisible = false;
let quitting = false;
const externalDisplay = () => screen.getAllDisplays().find(d => d.id !== screen.getPrimaryDisplay().id);

function placeOutput(displayId: number, fullscreen: boolean) {
  if (!output) return;
  const d = screen.getAllDisplays().find(x => x.id === displayId) ?? screen.getPrimaryDisplay();
  output.setFullScreen(false);
  output.setBounds({ x: d.bounds.x + 60, y: d.bounds.y + 60, width: Math.min(1280, d.workArea.width - 120), height: Math.min(720, d.workArea.height - 120) });
  output.show();
  if (fullscreen) { output.setBounds(d.bounds); output.setFullScreen(true); }
  else output.moveTop();
  outputVisible = true;
  placement = { displayId: d.id, fullscreen, visible: true };
  sendDisplays(); sendDisplayHz();
}

/** Vypnout výstup = skrýt okno. Poslední umístění se pamatuje, zapnutí se tam vrátí. */
function hideOutput() {
  if (!output || output.isDestroyed()) return;
  displaysInfo(); // aktualizuje poslední umístění z okna
  if (output.isFullScreen()) output.setFullScreen(false);
  output.hide();
  outputVisible = false;
  placement = { ...placement, visible: false };
  sendDisplays();
}

/** Zapnout výstup: tam, kde byl naposledy (když ten monitor ještě je), jinak na projektor / monitor přes celou obrazovku, jinak okno na notebooku. */
function showOutput() {
  const last = screen.getAllDisplays().find(d => d.id === placement.displayId);
  if (last) return placeOutput(last.id, placement.fullscreen);
  const ext = externalDisplay();
  if (ext) placeOutput(ext.id, true); else placeOutput(screen.getPrimaryDisplay().id, false);
}
const setOutputVisible = (v: boolean) => { if (v) showOutput(); else hideOutput(); };

function displaysInfo(): DisplaysInfo {
  if (output && !output.isDestroyed() && outputVisible && output.isVisible()) {
    const d = screen.getDisplayMatching(output.getBounds());
    placement = { displayId: d.id, fullscreen: output.isFullScreen(), visible: true };
  } else placement = { ...placement, visible: false };
  return { displays: displays(), placement };
}
function sendDisplays() { if (control && !control.isDestroyed()) control.webContents.send('displays', displaysInfo()); }

/** Monitor připojený za běhu → výstup na něj přes celou obrazovku; odpojený → výstup se vypne (náhled v pultu jede dál). */
function watchDisplays() {
  screen.on('display-added', (_e, d) => { if (!SMOKE && d.id !== screen.getPrimaryDisplay().id) setTimeout(() => placeOutput(d.id, true), 800); else sendDisplays(); });
  screen.on('display-removed', (_e, d) => {
    if (outputVisible && placement.displayId === d.id) { hideOutput(); placement = { ...placement, displayId: 0, fullscreen: false }; sendDisplays(); } else sendDisplays();
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
  // Výstup startuje skrytý (zapne se sám jen na projektoru); okno ale žije dál a počítá obraz + zvuk pro náhled v pultu.
  output = new BrowserWindow({ width: 1280, height: 720, title: 'VJ výstup', backgroundColor: '#000000', show: SMOKE, webPreferences });
  outputVisible = SMOKE;
  if (!SMOKE) control.maximize(); // pult vždy přes celou obrazovku notebooku
  control.setMenuBarVisibility(false);
  output.setMenuBarVisibility(false);
  control.loadFile(join(__dirname, 'control.html'));
  if (SMOKE) for (const [w, n] of [[control, 'pult'], [output, 'výstup']] as const) w.webContents.on('console-message', (e: any) => { if (e.level === 'error' || e.level === 'warning') console.log(`[${n}] ${e.message}`); });
  output.loadFile(join(__dirname, 'output.html'));
  // Diagnostika do zpravy/chyby.txt: jestli se okna načetla a chyby z jejich konzole.
  for (const [w, n] of [[control, 'pult'], [output, 'výstup']] as const) {
    w.webContents.on('did-finish-load', () => logLine(n, 'načteno'));
    w.webContents.on('did-fail-load', (_e, code, desc) => logLine(n, `nejde načíst: ${desc} (${code})`));
    w.webContents.on('console-message', (e: any) => { if (e.level === 'error') logLine(n, 'konzole: ' + e.message); });
  }

  // Výstup na externí displej, pokud je připojený (projektor). Bez projektoru zůstane vypnutý (náhled je v pultu), zapne se v menu Výstup.
  output.once('ready-to-show', () => {
    logLine('výstup', 'připraven (skrytý, dokud ho nezapneš nebo nepřipojíš projektor)');
    const ext = externalDisplay();
    if (ext && !SMOKE) placeOutput(ext.id, true);
    else sendDisplays();
  });

  control.on('closed', () => { control = null; quitting = true; if (output && !output.isDestroyed()) output.destroy(); });
  // Zavření okna výstupu křížkem = jen vypnout výstup (okno musí žít dál, jinak by náhled v pultu oněměl).
  output.on('close', e => { if (!quitting) { e.preventDefault(); hideOutput(); } });
  // Zamrzlé nebo spadlé okno → do záznamu (pult zamrzne = nejde nic přesouvat, výstup jede dál).
  for (const [w, n] of [[control, 'pult'], [output, 'výstup']] as const) {
    w.on('unresponsive', () => logLine(n, 'okno přestalo reagovat (zamrzlo)'));
    w.on('responsive', () => logLine(n, 'okno zase reaguje'));
    w.webContents.on('render-process-gone', (_e, d) => logLine(n, `proces okna spadl: ${d.reason} (kód ${d.exitCode})`));
  }
  output.on('closed', () => { output = null; });
  // Minimalizovaný výstup by přestal kreslit a poslouchat zvuk → hned ho vrátit.
  output.on('minimize', () => { if (!outputVisible) return; logLine('výstup', 'byl minimalizován → vracím'); setTimeout(() => { if (output && !output.isDestroyed() && outputVisible) output.restore(); }, 100); });
  output.on('moved', () => { sendDisplayHz(); sendDisplays(); });
  output.on('enter-full-screen', () => { sendDisplayHz(); sendDisplays(); });
  output.on('leave-full-screen', sendDisplays);
  // Spadlý výstup se sám znovu načte (stav mu pult pošle znovu).
  output.webContents.on('render-process-gone', () => { setTimeout(() => output?.webContents.reload(), 500); });
  // Spadlý pult se taky sám znovu načte (stav má v autosave).
  control.webContents.on('render-process-gone', () => { setTimeout(() => control?.webContents.reload(), 500); });
}

app.whenReady().then(() => {
  // Bez menu: žádné náhodné Ctrl+R (znovunačtení) ani F-kláves obsazených menu během hraní.
  Menu.setApplicationMenu(null);
  // Mikrofon / line-in povolit bez dotazu (jde jen o naše vlastní okna).
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'fullscreen' || perm === 'display-capture'));
  // Zvuk tohoto PC: Windows pošle to, co právě hraje zvuková karta (loopback). Obraz obrazovky výstup hned zahodí.
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then(src => {
        if (!src[0]) return cb(null);
        if (process.platform === 'win32') cb({ video: src[0], audio: 'loopback' });
        else cb({ video: src[0] }); // jinde než na Windows loopback není — výstup ohlásí, že zvuk nepřišel
      })
      .catch(() => cb(null));
  }, { useSystemPicker: false });

  ensureLibrary();
  syncStav();
  ipcMain.handle('content:list', () => listLibrary());
  ipcMain.on('state', (_e, s: AppState) => { lastState = s; if (output && !output.isDestroyed()) output.webContents.send('state', s); });
  ipcMain.on('output:ready', () => { if (lastState && output) output.webContents.send('state', lastState); sendDisplayHz(); });
  watchDisplays();
  ipcMain.on('audio:seek', (_e, sec: number) => { if (output && !output.isDestroyed()) output.webContents.send('audio:seek', sec); });
  ipcMain.on('audio-frame', (_e, f) => { if (control && !control.isDestroyed()) control.webContents.send('audio-frame', f); });
  let firstStats = true;
  ipcMain.on('stats', (_e, s) => { if (firstStats) { firstStats = false; logLine('výstup', `běží: ${Math.round(s.fps)} fps, ${s.gpu}`); } if (control && !control.isDestroyed()) control.webContents.send('stats', s); });
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
      : [{ name: 'Vizuály, 3D scény, videa a zvuk', extensions: ['glsl', 'frag', 'js', 'webm', 'mp4', 'mov', 'mkv', 'avi', 'm4v', 'gif', 'wav', 'mp3', 'flac', 'ogg', 'aif', 'aiff', 'm4a'] }];
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
  ipcMain.on('output:visible', (_e, v: boolean) => setOutputVisible(!!v));
  ipcMain.handle('smoke', () => SMOKE);
  ipcMain.on('log:error', (e, t: string) => logLine(e.sender === control?.webContents ? 'pult' : 'výstup', t));
  logLine('start', `aplikace v${app.getVersion()} spuštěna`);
  // Zachycení zvuku PC musí vypadat jako akce uživatele (jinak ho Chromium odmítne) → spustí se s userGesture.
  ipcMain.handle('audio:system', async () => {
    if (!output || output.isDestroyed()) return 'výstupní okno neběží';
    try { const r = await output.webContents.executeJavaScript('window.__vjCaptureSystem()', true); return typeof r === 'string' ? r : ''; }
    catch (e) { return (e as Error).message || String(e); }
  });
  let smokeStats = 0, smokeFps = 0;
  if (SMOKE) ipcMain.on('stats', (_e, s) => { smokeStats++; smokeFps = s.fps; console.log(`stats fps=${s.fps.toFixed(1)} errors=${s.errors.length} ${s.errors.join(' | ')}`); });
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
  for (const p of [DIRS.tvary, DIRS.sceny, DIRS.videa, DIRS.zvuk]) {
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
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const nm = (row, col) => document.querySelectorAll('#rows .cliprow')[row].querySelectorAll('.cname')[col];
      const menuClick = txt => { const b = Array.from(document.querySelectorAll('#menu .mitem')).find(x => x.textContent.startsWith(txt)); if (b) b.click(); return !!b; };
      const typeIn = txt => { const i = document.querySelector('input.inedit'); if (!i) return false; i.value = txt; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; };
      const ctx = el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      // levý klik na název (i opakovaně) = jen vlastnosti, klip hraje dál
      const act0 = st().layers[7].active; nm(0, 0).click(); nm(0, 0).click(); nm(0, 0).click();
      nm(0, 0).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      out.push('nameClick sel=' + st().selected.layer + '/' + st().selected.col + ' active ' + act0 + '>' + st().layers[7].active + ' edit=' + !!document.querySelector('input.inedit'));
      // pravý klik = přejmenovat klip; vrstva a sloupec přes menu
      ctx(nm(1, 0)); typeIn('Čáry hrubé');
      ctx(document.querySelectorAll('#rows .lhead')[0]); menuClick('Přejmenovat'); typeIn('Horní tvary');
      ctx(document.querySelectorAll('#colHead .colbtn')[2]); menuClick('Přejmenovat'); typeIn('Intro 3D');
      out.push('rename layer=' + st().layers[7].name + ' col=' + st().colNames[2] + ' clip=' + (st().layers[6].clips[0] && st().layers[6].clips[0].name));
      // jen jeden sloupec: přepnutí na 3, klik na klip v jiném sloupci = jen připravit
      document.querySelectorAll('#colHead .colbtn')[2].click();
      const a3 = st().layers.map(l => l.active).join(',');
      document.querySelectorAll('#rows .cliprow')[0].querySelectorAll('.cell')[0].click();
      const one = st().layers.every(l => l.active === -1 || l.active === st().column);
      out.push('column3 active=' + a3 + ' ready=' + st().layers[7].clips[0].ready + ' onlyOne=' + one + ' readyFrame=' + !!document.querySelector('.cell.ready') + ' head=' + document.querySelectorAll('#colHead .colbtn')[2].className);
      // přidat / smazat sloupec a vrstvu
      document.querySelector('#colHead .colbtn.plus').click(); const c1 = st().colNames.length;
      ctx(document.querySelectorAll('#colHead .colbtn')[c1 - 1]); menuClick('Smazat'); menuClick('Opravdu'); const c2 = st().colNames.length;
      document.querySelector('.addlayer').click(); const l1 = st().layers.length;
      ctx(document.querySelectorAll('#rows .lhead')[0]); menuClick('Smazat'); menuClick('Opravdu'); const l2 = st().layers.length;
      out.push('cols ' + c2 + '>' + c1 + '>' + c2 + ' layers 8>' + l1 + '>' + l2 + ' rows=' + document.querySelectorAll('#rows .cliprow').length);
      // zmenšení mřížky + layout uložit / výchozí
      const zb = z => Array.from(document.querySelectorAll('#gridBar .segbtns button')).find(b => b.textContent.startsWith(z));
      zb('50').click(); const z50 = getComputedStyle(document.getElementById('gridZoom')).zoom;
      document.getElementById('layoutBtn').click(); await wait(50);
      const li = document.querySelector('#menu input'); li.value = 'Test'; li.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const lname = document.getElementById('layoutBtn').textContent;
      document.getElementById('layoutBtn').click(); await wait(50); menuClick('Výchozí');
      out.push('zoom50=' + z50 + ' after=' + getComputedStyle(document.getElementById('gridZoom')).zoom + ' layout=' + lname + ' > ' + document.getElementById('layoutBtn').textContent);
      // GLOW a STROBO na 3D vrstvách (výstup je pak vykreslí v testu výkonu)
      window.__vjSet(s => { s.layers[2].clips[2].params = { glow: 0.8 }; s.layers[3].clips[2].params = { strobe: 1 }; s.layers[4].clips[2].params = { strobe: 2, strobeMode: 'hit', glow: 0.5 }; s.selected = { layer: 4, col: 2 }; s.preview = true; });
      out.push('props=' + Array.from(document.querySelectorAll('#props .plabel')).map(e => e.textContent).filter(Boolean).join('/'));
      // číslování vrstev: nahoře 1, 2, 3 …
      out.push('layerNames=' + Array.from(document.querySelectorAll('#rows .lhead .name')).map(e => e.textContent).join(','));
      // skrývání properties: ⚙ Zobrazit → odškrtnout TLOUŠŤKA → zmizí z panelu; „Zobrazit vše“ ji vrátí
      const menuLabel = t => Array.from(document.querySelectorAll('#menu label.mrow')).find(x => x.textContent.startsWith(t));
      const plabels = () => Array.from(document.querySelectorAll('#props .plabel')).map(e => e.textContent).filter(Boolean).join('/');
      const withSize = plabels();
      document.getElementById('propsGear').click(); await wait(30);
      const cbSize = menuLabel('TLOUŠŤKA').querySelector('input'); cbSize.checked = false; cbSize.dispatchEvent(new Event('change', { bubbles: true })); await wait(30);
      const noSize = plabels(), gearTxt = document.getElementById('propsGear').textContent;
      menuClick('Zobrazit vše'); const allBtn = Array.from(document.querySelectorAll('#menu button')).find(b => b.textContent === 'Zobrazit vše'); if (allBtn) allBtn.click(); await wait(30);
      const back = plabels();
      out.push('hideProps size:' + withSize.includes('TLOUŠŤKA') + '>' + noSize.includes('TLOUŠŤKA') + '>' + back.includes('TLOUŠŤKA') + ' gear=' + gearTxt);
      return out.join(' | ');
    })()`;
    try { console.log('UI ' + await control!.webContents.executeJavaScript(js)); } catch (e) { console.log('UI FAIL ' + (e as Error).message); }
    // Jen pro vývoj: vlastní krok testu (např. jedna scéna ve velkém rozlišení na kontrolní snímek).
    if (process.env.VJ_SMOKE_JS) {
      try { console.log('JS ' + await control!.webContents.executeJavaScript(readFileSync(process.env.VJ_SMOKE_JS, 'utf8'))); } catch (e) { console.log('JS FAIL ' + (e as Error).message); }
    }
  }, 7000);
  // Automatický test výstupu: skrytí okna (ne minimalizace) nesmí zastavit obraz a zvuk pro náhled v pultu.
  if (SMOKE) setTimeout(async () => {
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    const b0 = smokeStats; await wait(2500); const base = smokeStats - b0; // srovnání: stejně dlouhý úsek, dokud je výstup vidět
    const n0 = smokeStats; hideOutput(); await wait(2500);
    const vis = output && !output.isDestroyed() ? output.isVisible() : false;
    console.log(`OUT hidden visible=${vis} placement.visible=${displaysInfo().placement.visible} statsDelta=${smokeStats - n0} (viditelný: ${base}) fps=${smokeFps.toFixed(1)}`);
    showOutput(); await wait(800);
    console.log(`OUT shown visible=${output && !output.isDestroyed() ? output.isVisible() : false} placement.visible=${displaysInfo().placement.visible}`);
  }, 9000);
  // Automatický test importu (soubory připraví testovací skript): kopie zvuku + převod videa ffmpegem.
  if (SMOKE && process.env.VJ_SMOKE_IMPORT) setTimeout(async () => {
    const r = await importFiles(process.env.VJ_SMOKE_IMPORT!.split('|'), () => {});
    console.log(`IMPORT ids=${r.ids.join(',')} errors=${r.errors.join(' | ')}`);
    broadcast('content:changed', listLibrary());
  }, 1500);
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());

/** stav.md z aplikace → VISUALS SOFTWARE\STAV\stav.md (po každé aktualizaci je tam aktuální stav). */
function syncStav() {
  const src = join(APP_DIR, 'stav.md'), dstDir = join(BASE_DIR, 'STAV');
  if (BASE_DIR === APP_DIR || !existsSync(src) || !existsSync(dstDir)) return;
  try { copyFileSync(src, join(dstDir, 'stav.md')); } catch { /* soubor otevřený jinde — nevadí */ }
}
