// Most mezi okny a hlavním procesem. Okna nemají přímý přístup k disku, jen k těmto funkcím.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { VjApi } from '../shared/types';

const on = (ch: string) => (cb: (...a: any[]) => void) => { ipcRenderer.on(ch, (_e, ...a) => cb(...a)); };

const api: VjApi = {
  listContent: () => ipcRenderer.invoke('content:list'),
  onContentChanged: on('content:changed'),
  sendState: s => ipcRenderer.send('state', s),
  onState: on('state'),
  outputReady: () => ipcRenderer.send('output:ready'),
  sendAudioFrame: f => ipcRenderer.send('audio-frame', f),
  onAudioFrame: on('audio-frame'),
  sendStats: s => ipcRenderer.send('stats', s),
  onStats: on('stats'),
  startTest: m => ipcRenderer.send('test:start', m),
  onStartTest: on('test:start'),
  writeReport: r => ipcRenderer.invoke('report:write', r),
  pickImport: kind => ipcRenderer.invoke('library:pick', kind),
  importFiles: paths => ipcRenderer.invoke('library:import', paths),
  onLibraryProgress: on('library:progress'),
  openLibrary: sub => ipcRenderer.send('library:open', sub),
  showInFolder: p => ipcRenderer.send('library:show', p),
  pathForFile: f => webUtils.getPathForFile(f),
  listSady: () => ipcRenderer.invoke('sady:list'),
  saveSada: (n, j) => ipcRenderer.invoke('sady:save', n, j),
  loadSada: n => ipcRenderer.invoke('sady:load', n),
  seekAudio: sec => ipcRenderer.send('audio:seek', sec),
  onSeekAudio: on('audio:seek'),
  onDisplays: on('displays'),
  fileUrl: p => ipcRenderer.invoke('file:url', p),
  displays: () => ipcRenderer.invoke('displays'),
  placeOutput: (id, fs) => ipcRenderer.send('output:place', id, fs),
  sendKey: k => ipcRenderer.send('key', k),
  onKey: on('key'),
  onDisplayHz: on('display-hz'),
  captureSystemAudio: () => ipcRenderer.invoke('audio:system'),
  isSmoke: () => ipcRenderer.invoke('smoke'),
  smokeDone: (ok, info) => ipcRenderer.send('smoke:done', ok, info),
};

contextBridge.exposeInMainWorld('vj', api);
