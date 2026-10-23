/*{
  "name": "Škrábance",
  "popis": "Film frame scratches: vlnité čáry, oblouky a prach.",
  "feedback": false,
  "defaults": {
    "drive": "high",
    "hard": 0.8,
    "speed": 1,
    "density": 0.3,
    "size": 0.3,
    "colA": "#f1f2ec",
    "colB": "#ffffff"
  },
  "labels": {
    "speed": "Tempo změn",
    "density": "Hustota",
    "size": "Tloušťka"
  }
}*/
// Škrábance — "film frame scratches": vlnité čáry, oblouky a prach. Ostrá tvrdost = nové každý snímek.
vec4 element(vec2 p){
  float A = ASP();
  float seed = (uHard>0.5) ? uFrame : floor(uPhase*3.0);
  seed += uHitCount*17.0;
  int N = int(2.0 + uDensity*10.0 + uDrive*8.0 + uHit*6.0);
  float w = PX()*mix(0.6, 2.2, uSize);
  float m = 0.0;
  for(int i=0;i<26;i++){
    if(i>=N) break;
    float fi = float(i) + seed*1.37;
    float inten = 0.35 + 0.65*h11(fi*9.1);
    float d;
    if(h11(fi*3.3) < 0.65){
      float cx = (h11(fi)*2.0-1.0)*A;
      float amp = 0.02 + 0.25*h11(fi*2.7)*h11(fi*4.1);
      float fr = 1.0 + 6.0*h11(fi*5.3);
      float ph = h11(fi*7.7)*6.28;
      float y0 = h11(fi*1.9)*2.0-1.0;
      float y1 = y0 + 0.2 + 1.6*h11(fi*8.3);
      float x = cx + amp*sin(p.y*fr + ph) + 0.4*amp*sin(p.y*fr*2.3 + ph*1.7);
      float dx = amp*fr*cos(p.y*fr + ph);
      d = abs(p.x - x)/sqrt(1.0 + dx*dx);
      d = max(d - w*0.5, max(y0 - p.y, p.y - y1));
    } else {
      vec2 c = (h22(vec2(fi, 3.1))*2.0-1.0)*vec2(A*1.2, 1.2);
      float r = 0.3 + 1.2*h11(fi*6.1);
      float ang = atan(p.y-c.y, p.x-c.x);
      float a0 = h11(fi*2.2)*6.28318;
      float span = 0.3 + 1.2*h11(fi*4.4);
      float da = abs(mod(ang - a0 + 3.14159, 6.28318) - 3.14159);
      d = max(abs(length(p-c)-r) - w*0.5, (da - span)*r);
    }
    m = max(m, fillD(d)*inten);
  }
  vec2 g = floor(FC/3.0);
  m = max(m, step(0.9993 - 0.0015*uDrive, h21(g + seed*13.1))*0.8);
  return vec4(uColA*m, m);
}
