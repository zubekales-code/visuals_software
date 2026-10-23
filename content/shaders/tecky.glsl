/*{
  "name": "Praskací tečky",
  "popis": "Na úder vzniknou tečky a natáhnou se do červíků (abstract horror).",
  "feedback": false,
  "defaults": {
    "drive": "kick",
    "hard": 0.5,
    "speed": 1,
    "density": 0.3,
    "size": 0.5,
    "colA": "#1b1f1a",
    "colB": "#f4f6f2"
  },
  "labels": {
    "speed": "Rychlost růstu",
    "density": "Teček na úder",
    "size": "Velikost"
  }
}*/
// Praskací tečky -> křivky ("abstract horror"): na úder vzniknou tečky a natáhnou se do červíků.
vec4 element(vec2 p){
  float A = ASP();
  float life = mix(0.9, 0.3, uHard)/max(uSpeed, 0.15);
  int M = 1 + int(uDensity*3.0);
  float r0 = 0.014*mix(0.5, 2.0, uSize);
  float seg = 0.03*mix(0.6, 1.6, uSize);
  float core = 0.0, rim = 0.0;
  for(int j=0;j<8;j++){
    float age = uHitAge[j];
    if(age > life) continue;
    float g = age/life;
    float id = uHitCount - float(j);
    float grow = smoothstep(0.05, 0.6, g);
    float vis = 1.0 - smoothstep(0.75, 1.0, g);
    for(int q=0;q<4;q++){
      if(q>=M) break;
      float s = id*7.13 + float(q)*1.91;
      vec2 pt = (vec2(h11(s), h11(s+4.2))*2.0-1.0)*vec2(A*0.85, 0.85);
      float ang = h11(s+8.8)*6.283;
      float d = length(p-pt) - r0;
      for(int k=1;k<10;k++){
        float fk = float(k)/9.0;
        if(fk > grow) break;
        ang += (h11(s+float(k)*3.7)-0.5)*2.4;
        pt += vec2(cos(ang), sin(ang))*seg;
        d = min(d, length(p-pt) - r0*(1.0-0.3*fk));
      }
      core = max(core, fillD(d)*vis);
      rim  = max(rim,  fillD(d - PX()*2.0)*vis);
    }
  }
  float rimOnly = max(rim - core, 0.0);
  return vec4(uColA*core + uColB*rimOnly, max(core, rim));
}
