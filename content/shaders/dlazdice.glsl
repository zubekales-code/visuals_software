/*{
  "name": "Kompresní dlaždice",
  "popis": "Zrnité pixelované čtverečky, ostrá tvrdost = blik na 1 snímek.",
  "feedback": false,
  "defaults": {
    "drive": "high",
    "hard": 1,
    "speed": 1,
    "density": 0.45,
    "size": 0.3,
    "colA": "#7c8b78",
    "colB": "#d7e0d2"
  },
  "labels": {
    "speed": "Doznívání",
    "density": "Hustota",
    "size": "Velikost dlaždic"
  }
}*/
// Kompresní dlaždice — zrnité pixelované čtverečky. Ostrá tvrdost = blik na 1 snímek.
vec4 element(vec2 p){
  float bs = floor(mix(8.0, 40.0, uSize));
  vec2 cell = floor(FC/bs);
  float seed = (uHard>0.5) ? uFrame : uHitCount;
  float env = (uHard>0.5) ? step(uSinceHit, 0.07) : exp(-uSinceHit*5.0*max(uSpeed,0.1));
  float thr = ((uDensity*0.12 + 0.02)*(0.3 + uDrive) + uHit*0.15)*env;
  float on = step(h21(cell + seed*1.731), thr);
  on = max(on, step(h21(vec2(floor(cell.x/4.0), cell.y) + seed*0.37), thr*0.6));
  vec2 f = fract(FC/bs);
  float v = h21(floor(f*4.0) + cell*3.1 + seed);
  float dct = cos(f.x*3.14159*floor(1.0+h21(cell)*4.0))*cos(f.y*3.14159*floor(1.0+h21(cell+5.0)*4.0));
  v = mix(v, dct*0.5+0.5, 0.5);
  vec3 col = mix(uColA, uColB, v);
  float a = on*0.92;
  return vec4(col*a, a);
}
