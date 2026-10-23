/*{
  "name": "Pádla",
  "popis": "Obdélníky u okrajů, při úderu skočí nebo dojedou na nové místo.",
  "feedback": false,
  "defaults": {
    "drive": "kick",
    "hard": 0.3,
    "speed": 1,
    "density": 1,
    "size": 1,
    "colA": "#46b654",
    "colB": "#ffffff"
  },
  "labels": {
    "speed": "Rychlost dojezdu",
    "density": "Počet pádel",
    "size": "Velikost"
  }
}*/
// Pádla — obdélníky u okrajů; při úderu skočí (ostré) nebo dojedou (měkké) na nové místo.
vec4 element(vec2 p){
  float A = ASP();
  float n = uHitCount;
  float ks = clamp(uSinceHit*uSpeed*5.0, 0.0, 1.0); ks = 1.0-pow(1.0-ks, 3.0);
  float k = mix(ks, 1.0, uHard);
  int N = 1 + int(uDensity*3.99);
  float pulse = 1.0 + uHit*0.25*(1.0-uHard*0.5);
  vec2 hs = vec2(0.2, 0.055)*uSize*pulse;
  float d = 1e5;
  for(int i=0;i<4;i++){
    if(i>=N) break;
    float fi = float(i);
    float a = mix(h11(n-1.0+fi*13.1), h11(n+fi*13.1), k)*2.0-1.0;
    vec2 c; vec2 s = hs;
    if(i==0){ c = vec2(a*A*0.7, 0.9); }
    else if(i==1){ c = vec2(-a*A*0.7, -0.9); }
    else if(i==2){ c = vec2(-A+0.08, a*0.6); s = hs.yx; }
    else { c = vec2(A-0.08, -a*0.6); s = hs.yx; }
    d = min(d, sdBox(p-c, s));
  }
  float m = fillD(d);
  return vec4(uColA*m, m);
}
