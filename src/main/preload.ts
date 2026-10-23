// Most mezi okny a hlavním procesem. Okna nemají přímý přístup k disku, jen k těmto funkcím.
import { contextBridge, ipcRenderer } from 'electron';
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
  pickWav: () => ipcRenderer.invoke('dialog:wav'),
  fileUrl: p => ipcRenderer.invoke('file:url', p),
  displays: () => ipcRenderer.invoke('displays'),
  placeOutput: (id, fs) => ipcRenderer.send('output:place', id, fs),
  sendKey: k => ipcRenderer.send('key', k),
  onKey: on('key'),
  onDisplayHz: on('display-hz'),
  isSmoke: () => ipcRenderer.invoke('smoke'),
  smokeDone: (ok, info) => ipcRenderer.send('smoke:done', ok, info),
};

contextBridge.exposeInMainWorld('vj', api);
