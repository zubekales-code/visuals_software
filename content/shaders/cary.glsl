/*{
  "name": "Svislé čáry",
  "popis": "Kmitají podle síly zvuku, ostrá tvrdost = trhnutí na úder.",
  "feedback": false,
  "defaults": {
    "drive": "bass",
    "hard": 0.2,
    "speed": 1,
    "density": 0,
    "size": 0.4,
    "colA": "#4b9be2",
    "colB": "#ffffff"
  },
  "labels": {
    "speed": "Rychlost kmitu",
    "density": "Počet čar",
    "size": "Tloušťka"
  }
}*/
// Svislé čáry — kmitají podle síly zvuku; ostrá tvrdost = trhnutí na úder.
vec4 element(vec2 p){
  float A = ASP();
  int N = 2 + int(uDensity*10.0);
  float w = PX()*mix(1.5, 24.0, uSize*uSize); // rozšířený rozsah (VJ app v0.3)
  float m = 0.0;
  for(int i=0;i<12;i++){
    if(i>=N) break;
    float fi = float(i);
    float x = mix(-A*0.55, A*0.55, fi/float(N-1));
    float osc = sin(uPhase*(5.0+fi*1.3) + fi*1.7)*uDrive*0.12*(1.0-0.6*uHard);
    float jit = (h11(uHitCount*7.3+fi)-0.5)*0.25*uHard*step(uSinceHit, 0.12);
    float wob = sin(p.y*6.0 + uPhase*8.0 + fi)*0.02*uDrive*(1.0-uHard);
    float len = 0.55 + 0.4*uDrive;
    float d = max(abs(p.x - x - osc - jit - wob) - w*0.5, abs(p.y) - len);
    m = max(m, fillD(d));
  }
  return vec4(uColA*m, m);
}
