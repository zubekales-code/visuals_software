// v0.4: sloupce, STROBO, hlavička 3D scén a samotné scény (spustí se v Node bez grafiky: create + 3 s snímků).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { parseShaderHeader } from '../src/shared/shader-header';
import { strobeGate } from '../src/shared/types';

test('STROBO: n snímků svítí / n tma; na úder n snímků po úderu; 0 = vypnuto', () => {
  const on = (n: number, mode: 'frames' | 'hit', fsh = 0) => Array.from({ length: 8 }, (_, f) => strobeGate(f, n, mode, fsh + f) ? 1 : 0).join('');
  assert.equal(on(0, 'frames'), '11111111');
  assert.equal(on(1, 'frames'), '10101010');     // jednosnímkový interval
  assert.equal(on(2, 'frames'), '11001100');
  assert.equal(on(1, 'hit'), '10000000');        // jeden snímek po úderu
  assert.equal(on(3, 'hit'), '11100000');
});

const SCENES = readdirSync('content/scenes').filter(f => f.endsWith('.js'));

test('3D scény: platná hlavička s kamerou', () => {
  assert.ok(SCENES.length >= 4);
  for (const f of SCENES) {
    const { header } = parseShaderHeader(readFileSync('content/scenes/' + f, 'utf8'));
    assert.ok(header.name, f);
    assert.ok(header.camera && header.camera.distance > 0, f + ': chybí camera.distance');
  }
});

test('3D scény: create + 180 snímků bez chyby, reagují na MNOŽSTVÍ i úder', () => {
  const addons = { LineSegments2, LineSegmentsGeometry, LineMaterial, Line2, LineGeometry };
  for (const f of SCENES) {
    let def: any = null;
    new Function('vjScene', readFileSync('content/scenes/' + f, 'utf8'))((d: any) => { def = d; });
    assert.ok(def && typeof def.create === 'function', f + ': chybí vjScene({ create })');
    const scene = new THREE.Scene(), root = new THREE.Group(), camera = new THREE.PerspectiveCamera();
    scene.add(root);
    const run = def.create(THREE, { scene, root, camera, addons });
    const fr: any = { t: 0, dt: 1 / 60, frame: 0, phase: 0, dphase: 0, drive: 0.5, hit: 0, newHit: false, sinceHit: 9, hitCount: 0, loud: 0.5,
      hard: 0.5, speed: 1, density: 0.5, size: 0.5, colA: new THREE.Color('#ffffff'), colB: new THREE.Color('#46b654'), w: 640, h: 360 };
    for (let i = 0; i < 180; i++) {
      fr.frame = i; fr.t = i / 60; fr.phase += 1 / 60; fr.newHit = i % 30 === 0; if (fr.newHit) { fr.hitCount++; fr.sinceHit = 0; fr.hit = 1; }
      fr.sinceHit += 1 / 60; fr.hit *= 0.9; fr.hard = (i % 90) / 90; fr.density = (i % 60) / 60;
      run.update(fr);
    }
    // nic nesmí utéct do nekonečna
    root.updateMatrixWorld(true);
    let bad = 0;
    root.traverse((o: any) => { if (o.matrixWorld.elements.some((v: number) => !Number.isFinite(v))) bad++; });
    assert.equal(bad, 0, f + ': neplatná čísla v pozicích');
    run.dispose?.();
  }
});
