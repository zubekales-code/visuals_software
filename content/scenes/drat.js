/*{
  "name": "Drátěná tělesa",
  "popis": "Vnořená drátěná tělesa a kruhy. Na úder cuknou; ostrá tvrdost = tvar se vymění.",
  "defaults": {
    "drive": "kick",
    "hard": 0.6,
    "speed": 1,
    "density": 0.4,
    "size": 0.25,
    "colA": "#f1f2ec",
    "colB": "#46b654"
  },
  "labels": {
    "hard": "Cuknutí a výměna tvaru",
    "speed": "Rychlost otáčení",
    "density": "Počet těles",
    "size": "Tloušťka čar"
  },
  "camera": { "distance": 9, "targetY": 0, "orbit": 0.1, "height": 0.35, "dist": 0.5, "fov": 0.35, "spin": 0.1, "kick": 0.25 }
}*/
// Drátěná tělesa — hrany těles jako tlusté čáry (tloušťka v pixelech = TLOUŠŤKA).
// Tělesa jsou vnořená do sebe (MNOŽSTVÍ = kolik), každé se točí jinak (OSCILACE = rychlost).
// Úder: měkká tvrdost = tělesa se nadechnou, ostrá = cuknou do strany a vnější tvar se vymění.
vjScene({
  create(THREE, ctx) {
    const { LineSegments2, LineSegmentsGeometry, LineMaterial } = ctx.addons;
    const toLines = g => {
      const e = new THREE.EdgesGeometry(g, 1);
      const lg = new LineSegmentsGeometry(); lg.setPositions(e.attributes.position.array);
      e.dispose(); g.dispose();
      return lg;
    };
    const kinds = [
      toLines(new THREE.IcosahedronGeometry(1, 0)), toLines(new THREE.OctahedronGeometry(1.1, 0)),
      toLines(new THREE.BoxGeometry(1.3, 1.3, 1.3)), toLines(new THREE.DodecahedronGeometry(1, 0)),
      toLines(new THREE.TetrahedronGeometry(1.25, 0)), toLines(new THREE.IcosahedronGeometry(1, 1)),
    ];
    const circle = (r, n) => {
      const a = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
        a.set([Math.cos(t0) * r, 0, Math.sin(t0) * r, Math.cos(t1) * r, 0, Math.sin(t1) * r], i * 6);
      }
      const lg = new LineSegmentsGeometry(); lg.setPositions(a); return lg;
    };
    const matA = new LineMaterial({ color: 0xffffff, linewidth: 2, worldUnits: false });
    const matB = new LineMaterial({ color: 0xffffff, linewidth: 2, worldUnits: false });
    const MAX = 6;
    const solids = [];
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < MAX; i++) {
      const g = new THREE.Group();
      const s = new LineSegments2(kinds[i % kinds.length], i % 2 ? matB : matA);
      s.frustumCulled = false;
      g.add(s); ctx.root.add(g);
      solids.push({ g, s, base: 0.8 + i * 0.5, kx: (rnd() - 0.5) * 1.2, ky: 0.3 + rnd() * 0.6, dir: i % 2 ? -1 : 1 });
    }
    const rings = [circle(3.6, 96), circle(4.1, 96)].map((geo, i) => {
      const r = new LineSegments2(geo, matB); r.frustumCulled = false; r.rotation.x = 0.4 + i * 0.9; ctx.root.add(r); return r;
    });
    let jx = 0, jy = 0, jz = 0;
    return {
      update(f) {
        matA.color.copy(f.colA); matB.color.copy(f.colB);
        const lw = Math.max(1, (1 + 7 * f.size * f.size) * f.h / 1080);
        matA.linewidth = matB.linewidth = lw;
        matA.resolution.set(f.w, f.h); matB.resolution.set(f.w, f.h);
        const n = 1 + Math.round(f.density * (MAX - 1));
        if (f.newHit) {
          jx = (rnd() - 0.5) * 0.6; jy = (rnd() - 0.5) * 0.6; jz = (rnd() - 0.5) * 0.6;
          if (f.hard > 0.5) { const o = solids[n - 1]; o.s.geometry = kinds[(f.hitCount + n) % kinds.length]; }
        }
        const jerk = f.hard > 0.3 && f.sinceHit < 0.03 + 0.07 * f.hard ? f.hard : 0;   // cuknutí jen pár snímků
        const breathe = 1 + 0.14 * f.drive * (1 - f.hard) + 0.12 * f.hit * (1 - f.hard);
        for (let i = 0; i < MAX; i++) {
          const o = solids[i];
          o.g.visible = i < n;
          if (i >= n) continue;
          o.g.rotation.x = f.phase * (0.25 + o.kx * 0.3) * o.dir;
          o.g.rotation.y = f.phase * o.ky * o.dir;
          o.g.scale.setScalar(o.base * breathe);
          o.g.position.set(jx * jerk * (i + 1), jy * jerk * (i + 1), jz * jerk * (i + 1));
        }
        for (let i = 0; i < rings.length; i++) {
          rings[i].visible = n >= 3 + i;
          rings[i].rotation.y = f.phase * (0.2 + 0.15 * i) * (i ? -1 : 1);
          rings[i].scale.setScalar(1 + 0.05 * f.drive);
        }
      },
    };
  },
});
