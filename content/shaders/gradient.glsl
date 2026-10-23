/*{
  "name": "Gradient podklad",
  "popis": "Měkký post-internetový přechod. Barva A nahoře, B dole.",
  "feedback": false,
  "defaults": {
    "drive": "loud",
    "hard": 0.1,
    "speed": 0.4,
    "density": 0.35,
    "size": 1,
    "colA": "#3d4a31",
    "colB": "#b6e163"
  },
  "labels": {
    "speed": "Dýchání",
    "density": "Zrnitost",
    "size": "Krytí"
  }
}*/
// Gradient podklad — měkký post-internetový přechod. Barva A = nahoře, B = dole.
vec4 element(vec2 p){
  float t = (p.y+1.0)*0.5;
  t += 0.08*sin(p.x*1.3 + uPhase*0.7) + 0.08*uDrive;
  t += (vnoise(p*2.5 + uPhase*0.25)-0.5)*0.2*uDensity;
  t = smoothstep(0.0, 1.0, t);
  vec3 col = mix(uColB, uColA, t);
  col += (h21(FC + uFrame)-0.5)*0.05*uDensity;
  float a = clamp(uSize, 0.0, 1.0);
  return vec4(col*a, a);
}
