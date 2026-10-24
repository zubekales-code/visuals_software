/*{
  "name": "Pole sloupců",
  "popis": "3D equalizer: mřížka sloupců, z místa každého úderu se rozběhne vlna.",
  "defaults": {
    "drive": "kick",
    "hard": 0.35,
    "speed": 1,
    "density": 0.45,
    "size": 0.55,
    "colA": "#b6e163",
    "colB": "#3d4a31"
  },
  "labels": {
    "hard": "Ostrost vlny",
    "speed": "Rychlost vln",
    "density": "Počet sloupců",
    "size": "Šířka sloupců"
  },
  "camera": { "distance": 26, "targetY": 0.5, "orbit": 0.15, "height": 0.55, "dist": 0.5, "fov": 0.3, "spin": 0, "kick": 0.25 }
}*/
// Pole sloupců — mřížka hranolů jako 3D equalizer.
// Na úder se z náhodného místa rozběhne vlna (TVRDOST = užší a ostřejší prstenec), síla zvuku zvedá celé pole.
// Barva podle výšky: barva B nízko → barva A vysoko. Nic se za snímek nealokuje.
vjScene({
  create(THREE, ctx) {
    const MAX = 48, SIZE = 20, E = 4, H = 6;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX * MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * MAX * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    ctx.root.add(mesh);
    ctx.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(4, 10, 6); ctx.scene.add(key);

    const ex = new Float32Array(E), ez = new Float32Array(E), age = new Float32Array(E).fill(99);
    let next = 0, seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const m = new THREE.Matrix4(), c = new THREE.Color();

    return {
      update(f) {
        const G = Math.max(4, Math.round(6 + f.density * (MAX - 6)));
        mesh.count = G * G;
        const step = SIZE / G, w = step * (0.18 + 0.78 * f.size);
        if (f.newHit) { const k = next++ % E; ex[k] = (rnd() - 0.5) * SIZE * 0.8; ez[k] = (rnd() - 0.5) * SIZE * 0.8; age[k] = 0; }
        for (let k = 0; k < E; k++) age[k] += f.dt;
        const v = 4 + 10 * f.speed;                     // rychlost šíření vlny
        const sharp = 0.25 + 3.5 * f.hard * f.hard;     // tvrdost = úzký ostrý prstenec
        const decay = 0.6 + 1.6 * f.hard;
        const base = 0.15 + 2.2 * f.drive;               // síla zvuku zvedá celé pole
        let i = 0;
        for (let ix = 0; ix < G; ix++) for (let iz = 0; iz < G; iz++, i++) {
          const x = (ix - (G - 1) / 2) * step, z = (iz - (G - 1) / 2) * step;
          const r = Math.sqrt(x * x + z * z);
          let h = base * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(r * 0.55 - f.phase * 3)));
          for (let k = 0; k < E; k++) {
            if (age[k] > 6) continue;
            const d = Math.sqrt((x - ex[k]) * (x - ex[k]) + (z - ez[k]) * (z - ez[k])) - age[k] * v;
            h += 4.5 * Math.exp(-d * d * sharp) * Math.exp(-age[k] * decay);
          }
          h = Math.max(0.06, h);
          m.makeScale(w, h, w); m.setPosition(x, 0, z);
          mesh.setMatrixAt(i, m);
          c.copy(f.colB).lerp(f.colA, Math.min(1, h / H));
          mesh.setColorAt(i, c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      },
    };
  },
});
