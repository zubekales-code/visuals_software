/*{
  "name": "Červi",
  "popis": "Článkovaní červi (tmavé tělo, jemný světlý lem) plavou prostorem a na úder sebou škubnou.",
  "defaults": {
    "drive": "kick",
    "hard": 0.5,
    "speed": 1,
    "density": 0.3,
    "size": 0.45,
    "colA": "#1b1f1a",
    "colB": "#f4f6f2"
  },
  "labels": {
    "hard": "Škubnutí na úder",
    "speed": "Rychlost plavání",
    "density": "Počet červů",
    "size": "Tloušťka těla"
  },
  "camera": { "distance": 12, "targetY": 0, "orbit": 0.12, "height": 0.3, "dist": 0.5, "fov": 0.35, "spin": 0, "kick": 0.2 }
}*/
// Červi — 3D verze „praskacích teček“ (abstract horror): tělo z koulí, hlava sleduje křivku v prostoru
// a každý článek drží stejnou vzdálenost od předchozího (proto se tělo vlní samo, bez animace).
// Lem = stejné koule zezadu o kousek větší (barva B), tělo = barva A.
// TVRDOST: měkká = plynulé zhoupnutí, ostrá = prudké škubnutí, které rychle odezní.
vjScene({
  create(THREE, ctx) {
    const W = 8, SEG = 40, LINK = 0.17;
    const sph = new THREE.SphereGeometry(1, 16, 12);
    const core = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff }), W * SEG);
    const rim = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), W * SEG);
    for (const im of [core, rim]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; }
    ctx.root.add(rim, core);
    let seed = 5;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const worms = [];
    for (let w = 0; w < W; w++) {
      const seg = new Float32Array(SEG * 3);
      for (let i = 0; i < SEG; i++) seg.set([i * LINK - 3, (w - W / 2) * 0.6, 0], i * 3);
      worms.push({ seg, ph: w * 1.37 + rnd(), tw: 0, tx: 0, ty: 0, tz: 0 });
    }
    const m = new THREE.Matrix4();
    return {
      update(f) {
        core.material.color.copy(f.colA); rim.material.color.copy(f.colB);
        const n = 1 + Math.round(f.density * (W - 1));
        const R = 0.05 + 0.3 * f.size;
        const amp = 0.3 + 2.4 * f.hard, fall = 3 + 15 * f.hard;
        let k = 0;
        for (let w = 0; w < n; w++) {
          const o = worms[w], s = o.seg;
          if (f.newHit) { o.tw = 1; o.tx = rnd() - 0.5; o.ty = rnd() - 0.5; o.tz = rnd() - 0.5; }
          o.tw *= Math.exp(-f.dt * fall);
          const t = f.phase * 0.6 + o.ph, j = o.tw * amp;
          s[0] = Math.sin(t * 0.9 + o.ph) * 4.2 + o.tx * j;
          s[1] = Math.sin(t * 1.3 + o.ph * 2) * 2.2 + o.ty * j;
          s[2] = Math.sin(t * 0.6 + o.ph * 3) * 3 + o.tz * j;
          for (let i = 1; i < SEG; i++) {
            const a = (i - 1) * 3, b = i * 3;
            let dx = s[b] - s[a], dy = s[b + 1] - s[a + 1], dz = s[b + 2] - s[a + 2];
            const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            dx /= l; dy /= l; dz /= l;
            s[b] = s[a] + dx * LINK; s[b + 1] = s[a + 1] + dy * LINK; s[b + 2] = s[a + 2] + dz * LINK;
          }
          for (let i = 0; i < SEG; i++, k++) {
            const r = R * Math.pow(1 - i / SEG, 0.6) * (1 + 0.25 * f.drive) + 0.02;
            const x = s[i * 3], y = s[i * 3 + 1], z = s[i * 3 + 2];
            m.makeScale(r, r, r); m.setPosition(x, y, z); core.setMatrixAt(k, m);
            const rr = r + Math.max(0.02, r * 0.2);
            m.makeScale(rr, rr, rr); m.setPosition(x, y, z); rim.setMatrixAt(k, m);
          }
        }
        core.count = rim.count = k;
        core.instanceMatrix.needsUpdate = true; rim.instanceMatrix.needsUpdate = true;
      },
    };
  },
});
