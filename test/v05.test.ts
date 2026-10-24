// v0.5: vždy jen jeden aktivní sloupec, „připraveno“, přidat / smazat sloupce a vrstvy, načtení starých sad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, clickColumnLogic, clickClipLogic, normalizePlay, addColumn, deleteColumn, addLayer, deleteLayer, sanitizeGrid, MAX_COLS, MAX_LAYERS } from '../src/shared/types';
import type { AppState } from '../src/shared/types';

const playing = (s: AppState) => s.layers.map(l => l.active).join(',');
const onlyColumn = (s: AppState) => s.layers.every(l => l.active === -1 || l.active === s.column);

test('sloupec: přepnutí = hraje jen nový sloupec, nikdy dva najednou', () => {
  const s = defaultState();
  clickColumnLogic(s, 2);
  assert.equal(s.column, 2);
  assert.equal(playing(s), '-1,-1,2,2,2,2,-1,-1');
  clickColumnLogic(s, 1);
  assert.equal(s.column, 1); assert.ok(onlyColumn(s));
  // klik na klip v jiném sloupci ho NEPUSTÍ, jen připraví
  assert.equal(clickClipLogic(s, 3, 0), 'ready');
  assert.equal(s.layers[3].active, 1); assert.ok(onlyColumn(s));
  assert.equal(s.layers[3].clips[0]!.ready, true);
  assert.equal(clickClipLogic(s, 3, 0), 'unready');
  // klik v aktivním sloupci = zapnout / vypnout
  assert.equal(clickClipLogic(s, 3, 1), 'stop'); assert.equal(s.layers[3].active, -1);
  assert.equal(clickClipLogic(s, 3, 1), 'play'); assert.equal(s.layers[3].active, 1);
});

test('sloupec: připravené klipy se pustí při přepnutí (a jen ony); bez připravených celý sloupec', () => {
  const s = defaultState();
  clickColumnLogic(s, 1);
  clickClipLogic(s, 2, 0); clickClipLogic(s, 5, 0);       // připravit 2 klipy ve sloupci 1
  clickColumnLogic(s, 0);
  assert.equal(playing(s), '-1,-1,0,-1,-1,0,-1,-1');
  assert.ok(s.layers.every(l => !l.clips[0]?.ready), 'připravení se spotřebovalo');
  clickColumnLogic(s, 0);                                    // aktivní sloupec, něco hraje → zastavit vše
  assert.equal(playing(s), '-1,-1,-1,-1,-1,-1,-1,-1');
  clickColumnLogic(s, 0);                                    // nic nehraje → pustit celý sloupec
  assert.equal(playing(s), '0,0,0,0,0,0,0,0');
});

test('přidat / smazat sloupec: klipy, hrající sloupec a výběr se posunou správně', () => {
  const s = defaultState();
  clickColumnLogic(s, 1);
  s.selected = { layer: 3, col: 1 };
  assert.ok(addColumn(s, 0));
  assert.equal(s.colNames.length, 11); assert.equal(s.column, 2);
  assert.equal(s.layers[3].clips[2]!.content, 'shader:padla'); assert.equal(s.layers[3].active, 2);
  assert.deepEqual(s.selected, { layer: 3, col: 2 });
  assert.ok(s.layers.every(l => l.clips.length === 11));
  assert.ok(deleteColumn(s, 2));                             // smazat hrající sloupec
  assert.equal(s.colNames.length, 10); assert.ok(onlyColumn(s));
  assert.equal(s.selected, null);
  while (s.colNames.length > 1) deleteColumn(s, 0);
  assert.equal(deleteColumn(s, 0), false, 'poslední sloupec zůstane');
  while (addColumn(s, 0)) { /* */ }
  assert.equal(s.colNames.length, MAX_COLS);
});

test('přidat / smazat vrstvu', () => {
  const s = defaultState();
  assert.ok(addLayer(s, 8)); assert.equal(s.layers.length, 9);
  assert.equal(s.layers[8].clips.length, s.colNames.length);
  s.selected = { layer: 5, col: 0 };
  assert.ok(deleteLayer(s, 2)); assert.deepEqual(s.selected, { layer: 4, col: 0 });
  while (addLayer(s, 0)) { /* */ }
  assert.equal(s.layers.length, MAX_LAYERS);
  while (s.layers.length > 1) deleteLayer(s, 0);
  assert.equal(deleteLayer(s, 0), false, 'poslední vrstva zůstane');
});

test('stará sada (v0.4: hrají dva sloupce, bez aktivního sloupce) se načte uklizená', () => {
  const s = defaultState();
  s.layers[2].active = 2; s.layers[7].active = 0;            // chaos z v0.4
  const g = sanitizeGrid(JSON.parse(JSON.stringify(s.layers)), s.colNames, undefined)!;
  const st = { ...s, ...g };
  normalizePlay(st);
  assert.ok(onlyColumn(st));
  assert.equal(sanitizeGrid([], [], 0), null);
  const g2 = sanitizeGrid([{ clips: [null, { content: 'shader:x', params: {} }] }], undefined, 9)!;
  assert.equal(g2.colNames.length, 2); assert.equal(g2.column, 0); // neplatný sloupec → první
});
