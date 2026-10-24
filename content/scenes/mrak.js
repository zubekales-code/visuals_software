/*{
  "name": "Mrak bodů",
  "popis": "Body se na údery přelévají mezi tvary: koule, mřížková krychle, vlnitá rovina, prstence, šroubovice.",
  "defaults": {
    "drive": "kick",
    "hard": 0.5,
    "speed": 1,
    "density": 0.55,
    "size": 0.35,
    "colA": "#ffffff",
    "colB": "#4b9be2"
  },
  "labels": {
    "hard": "Rychlost proměny + glitch",
    "speed": "Víření",
    "density": "Počet bodů",
    "size": "Velikost bodů"
  },
  "camera": { "distance": 9, "targetY": 0, "orbit": 0.25, "height": 0.4, "dist": 0.5, "fov": 0.35, "spin": 0.15, "kick": 0.3 }
}*/
// Mrak bodů — až 40 000 hranatých bodů (datový vzhled). Všech 5 tvarů leží v grafice najednou,
// proměna je jen číslo 0→1 v shaderu (nic se znovu nenahrává). Body startují s různým zpožděním → proměna vlní.
// TVRDOST: rychlá proměna na každý úder + glitch (část bodů na chvilku odskočí); měkká: pomalá proměna jednou za pár úderů.
vjScene({
  create(THREE, ctx) {
    const N = 40000;
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    const shapes = [0, 1, 2, 3, 4].map(() => new Float32Array(N * 3));
    for (let i = 0; i < N; i++) {
      // 0 koule
      let x = gauss(), y = gauss(), z = gauss(); const l = Math.hypot(x, y, z) || 1;
      shapes[0].set([x / l * 2.2, y / l * 2.2, z / l * 2.2], i * 3);
      // 1 krychle z mřížky čar (jako milimetrový papír ve 3D)
      const face = Math.floor(rnd() * 6), a = rnd() * 2 - 1, b = rnd() * 2 - 1, q = 1 / 4;
      const qa = rnd() < 0.5 ? Math.round(a / q) * q : a, qb = qa === a ? Math.round(b / q) * q : b;
      const S = 1.8, v = [qa * S, qb * S, (face & 1 ? 1 : -1) * S];
      const ax = face >> 1;
      shapes[1].set(ax === 0 ? [v[2], v[0], v[1]] : ax === 1 ? [v[0], v[2], v[1]] : [v[0], v[1], v[2]], i * 3);
      // 2 vlnitá rovina (mřížka bodů)
      const px = Math.round((rnd() * 2 - 1) * 16) / 16 * 4, pz = Math.round((rnd() * 2 - 1) * 16) / 16 * 4;
      shapes[2].set([px, 0.55 * Math.sin(px * 1.3) * Math.cos(pz * 1.1), pz], i * 3);
      // 3 tři prstence v různých sklonech
      const ring = Math.floor(rnd() * 3), t = rnd() * Math.PI * 2, R = 1.3 + ring * 0.6, w = gauss() * 0.04;
      const cx = Math.cos(t) * (R + w), cy = gauss() * 0.04, cz = Math.sin(t) * (R + w), tilt = ring * 1.05;
      shapes[3].set([cx, cy * Math.cos(tilt) - cz * Math.sin(tilt), cy * Math.sin(tilt) + cz * Math.cos(tilt)], i * 3);
      // 4 dvojitá šroubovice s příčkami
      const hT = rnd() * 6 - 3, rung = rnd() < 0.22, hA = hT * 2.2 + (i % 2) * Math.PI, rr = rung ? rnd() * 2 - 1 : 1;
      shapes[4].set([Math.cos(hA) * rr * 1.1, hT, Math.sin(hA) * rr * 1.1], i * 3);
    }
    const rand = new Float32Array(N); for (let i = 0; i < N; i++) rand[i] = rnd();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(shapes[0], 3));
    for (let k = 1; k < 5; k++) geo.setAttribute('aS' + k, new THREE.BufferAttribute(shapes[k], 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rand, 1));
    const U = {
      uFrom: { value: 0 }, uTo: { value: 1 }, uMix: { value: 0 }, uPhase: { value: 0 }, uPx: { value: 2 },
      uHit: { value: 0 }, uHard: { value: 0.5 }, uSeed: { value: 0 }, uDrive: { value: 0 },
      uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `
        attribute vec3 aS1, aS2, aS3, aS4; attribute float aRnd;
        uniform float uFrom, uTo, uMix, uPhase, uPx, uHit, uHard, uSeed, uDrive;
        varying float vR;
        vec3 pick(float i){ if(i < 0.5) return position; if(i < 1.5) return aS1; if(i < 2.5) return aS2; if(i < 3.5) return aS3; return aS4; }
        float h(float n){ return fract(sin(n)*43758.5453); }
        void main(){
          float d = aRnd*0.6;
          float m = smoothstep(d, d + 0.4, uMix);
          vec3 p = mix(pick(uFrom), pick(uTo), m);
          float w = sin(m*3.14159);
          p += w*vec3(sin(aRnd*41.0 + uPhase*1.7), cos(aRnd*29.0 + uPhase*1.3), sin(aRnd*23.0 + uPhase))*0.7;
          p += 0.03*vec3(sin(uPhase*2.0 + p.y*3.0), 0.0, cos(uPhase*2.0 + p.x*3.0));
          p *= 1.0 + 0.12*uDrive;
          float g = step(1.0 - 0.25*uHard, h(aRnd*91.7 + uSeed))*uHit*uHard;
          p += (vec3(h(aRnd*13.1 + uSeed), h(aRnd*17.3 + uSeed), h(aRnd*19.9 + uSeed)) - 0.5)*g*1.5;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.0);
          gl_PointSize = uPx*(0.7 + 0.6*aRnd);
          vR = aRnd;
        }`,
      fragmentShader: `
        uniform vec3 uColA, uColB; varying float vR;
        void main(){ gl_FragColor = vec4(vR < 0.18 ? uColB : uColA, 1.0); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    ctx.root.add(pts);

    let cur = 0, hits = 0;
    U.uMix.value = 1; U.uFrom.value = 0; U.uTo.value = 0;
    return {
      update(f) {
        geo.setDrawRange(0, Math.round(2000 + f.density * (N - 2000)));
        U.uPx.value = Math.max(1, (1 + 6 * f.size * f.size) * f.h / 1080);
        U.uPhase.value = f.phase; U.uHit.value = f.hit; U.uHard.value = f.hard; U.uSeed.value = f.hitCount % 997; U.uDrive.value = f.drive;
        U.uColA.value.copy(f.colA); U.uColB.value.copy(f.colB);
        const dur = 2.2 - 1.85 * f.hard;                         // tvrdost = rychlejší proměna
        U.uMix.value = Math.min(1, U.uMix.value + f.dt / dur);
        const every = f.hard > 0.66 ? 1 : f.hard > 0.33 ? 2 : 4;  // měkké = mění se jen jednou za pár úderů
        if (f.newHit && ++hits % every === 0 && U.uMix.value >= 1) {
          U.uFrom.value = cur; cur = (cur + 1 + Math.floor(rnd() * 3)) % 5; U.uTo.value = cur; U.uMix.value = 0;
        }
      },
    };
  },
});
