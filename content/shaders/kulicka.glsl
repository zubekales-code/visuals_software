/*{
  "name": "Kulička + stopy",
  "popis": "Kulička kreslí stopy (potřebuje předchozí snímek).",
  "feedback": true,
  "defaults": {
    "drive": "high",
    "hard": 0.3,
    "speed": 0.8,
    "density": 0,
    "size": 0.3,
    "colA": "#ffffff",
    "colB": "#ffffff"
  },
  "labels": {
    "speed": "Rychlost",
    "density": "Počet kuliček",
    "size": "Tloušťka"
  }
}*/
// Kulička + stopy — potřebuje předchozí snímek (feedback). Ostrá tvrdost = skoky = dlouhé rovné tahy.
vec2 ballPos(float t, float i, float hc){
  vec2 b = vec2(sin(t*1.31+i*2.1)*0.75 + 0.18*sin(t*3.7+i*5.0), sin(t*1.73+i*1.3)*0.7 + 0.15*sin(t*5.1+i*0.7));
  b += (vec2(h11(hc*3.1+i), h11(hc*5.7+i+9.0))-0.5)*1.2*uHard*step(0.5, hc);
  return b*vec2(ASP(), 1.0);
}
vec4 element(vec2 p){
  vec4 prev = PREV(FC/uRes);
  float decay = mix(0.985, 0.88, uHard);
  prev = max(prev*decay - 0.003, 0.0);
  int N = 1 + int(uDensity*3.0);
  float w = PX()*mix(0.8, 3.0, uSize);
  float m = 0.0;
  for(int i=0;i<4;i++){
    if(i>=N) break;
    float fi = float(i);
    vec2 a = ballPos(uPhase-uDPhase, fi, uPrevHitCount);
    vec2 b = ballPos(uPhase, fi, uHitCount);
    m = max(m, fillD(sdSeg(p,a,b)-w*0.5));
    m = max(m, fillD(length(p-b)-PX()*mix(3.0,7.0,uSize)));
  }
  vec4 c = vec4(uColA*m, m);
  return c + prev*(1.0-c.a);
}
