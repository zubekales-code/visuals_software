/*{
  "name": "Šedé bloky",
  "popis": "Velké matné tvary s oblouky, horní hrana dýchá s hlasitostí.",
  "feedback": false,
  "defaults": {
    "drive": "loud",
    "hard": 0.2,
    "speed": 1,
    "density": 0.25,
    "size": 0.55,
    "colA": "#a6a9a1",
    "colB": "#8b8e86"
  },
  "labels": {
    "speed": "Rychlost",
    "density": "Počet oblouků",
    "size": "Výška"
  }
}*/
// Šedé bloky — velké matné tvary s oblouky (jako písmena n/m). Horní hrana dýchá s hlasitostí.
vec4 element(vec2 p){
  float A = ASP();
  float top = -0.6 + 0.55*uSize + 0.22*uDrive;
  float d = max(abs(p.x)-A*0.94, max(p.y-top, -1.5-p.y));
  int M = 1 + int(uDensity*4.0);
  float wcell = 2.0*A*0.94/float(M);
  for(int i=0;i<5;i++){
    if(i>=M) break;
    float cx = -A*0.94 + wcell*(float(i)+0.5);
    float hw = wcell*0.22;
    float archTop = top - 0.2 - 0.05*uHit*(1.0-uHard);
    float cy = archTop - hw;
    float dc = min(sdBox(p-vec2(cx,(cy-1.5)*0.5), vec2(hw,(cy+1.5)*0.5)), length(p-vec2(cx,cy))-hw);
    d = max(d, -dc);
    if(i>0) d = max(d, -(abs(p.x-(cx-wcell*0.5))-0.008));
  }
  float t = clamp((p.y+1.0)/max(top+1.0,0.01), 0.0, 1.0);
  vec3 col = mix(uColB, uColA, t);
  float m = fillD(d);
  return vec4(col*m, m);
}
