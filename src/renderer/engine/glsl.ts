// GLSL rámec, do kterého se vkládá tělo vizuálu ze složky content/shaders.
// PRELUDE je 1:1 ze sandboxu „Elementy“, aby se shadery chovaly stejně jako v prohlížeči i v TouchDesigneru.
import type { ShaderParam } from '../../shared/types';

export const PRELUDE = `
uniform vec2  uRes;
uniform float uTime, uFrame, uHard, uSpeed, uDensity, uSize;
uniform float uDrive, uHit, uSinceHit, uHitCount, uPrevHitCount, uLoud;
uniform float uPhase, uDPhase, uRot3D, uRot3DAng, uMirror, uFade;
uniform vec3  uColA, uColB;
uniform vec4  uXf;            // posunX, posunY, měřítko, rotace
uniform float uHitAge[8];     // stáří posledních 8 úderů v sekundách

float h11(float n){ return fract(sin(n*127.1+0.31)*43758.5453); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
vec2  h22(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float sdBox(vec2 p, vec2 b){ vec2 d=abs(p)-b; return length(max(d,0.0))+min(max(d.x,d.y),0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0); return length(pa-ba*h); }
mat2  rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float PX(){ return 2.0/uRes.y; }
float ASP(){ return uRes.x/uRes.y; }
float fillD(float d){ return clamp(0.5 - d/PX(), 0.0, 1.0); }

// pixel -> prostor elementu (střed 0,0; y od -1 do 1): 3D náklon, zrcadlo, 2D transformace
vec2 toSpace(vec2 fc){
  vec2 p = (fc*2.0 - uRes)/uRes.y;
  if(uRot3D > 0.001){
    float ax = uRot3DAng*uRot3D, ay = uRot3DAng*0.73*uRot3D;
    vec3 ro = vec3(0.0,0.0,-2.2), rd = normalize(vec3(p, 2.2));
    mat2 rx = rot(-ax), ry = rot(-ay);
    ro.yz = rx*ro.yz; rd.yz = rx*rd.yz;
    ro.xz = ry*ro.xz; rd.xz = ry*rd.xz;
    if(abs(rd.z) < 1e-4) return vec2(1e5);
    float t = -ro.z/rd.z;
    if(t < 0.0) return vec2(1e5);
    p = (ro + rd*t).xy;
  }
  if(uMirror==1.0 || uMirror==3.0) p.x = -abs(p.x);
  if(uMirror==2.0 || uMirror==3.0) p.y = -abs(p.y);
  p = rot(-uXf.w)*(p - uXf.xy)/max(uXf.z, 0.05);
  return p;
}
`;

export const GL_HEAD = `#version 300 es
precision highp float;
#define FC gl_FragCoord.xy
uniform sampler2D uPrev;
#define PREV(uv) texture(uPrev, uv)
`;

export const GL_MAIN = `
out vec4 outColor;
void main(){ vec2 p = toSpace(FC); outColor = (p.x > 1e4) ? vec4(0.0) : element(p); }
`;

export function buildElementSource(body: string, params: ShaderParam[] = []): string {
  const extra = params.map(p => `uniform float ${p.name};\n`).join('');
  // #line 1: chyby překladu ukazují čísla řádků v souboru vizuálu, ne v celém složeném shaderu
  return GL_HEAD + PRELUDE + extra + '#line 1\n' + body + GL_MAIN;
}

export const VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** Kopie vrstvy do kompozice (premultiplied, násobená průhledností vrstvy). */
export const FS_COPY = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uRes; uniform float uMul; out vec4 o;
void main(){ o = texture(uTex, gl_FragCoord.xy/uRes)*uMul; }`;

/** Vrstva s vlastním GLOW: k vrstvě se přičte rozmazaná záře (jen světlo, alfa zůstává z vrstvy → žádné tmavé lemy). */
export const FS_LAYER = `#version 300 es
precision highp float; uniform sampler2D uTex, uGlow; uniform vec2 uRes; uniform float uMul, uGlowAmt; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy/uRes; vec4 e = texture(uTex, uv);
  vec3 g = texture(uGlow, uv).rgb*uGlowAmt;
  o = vec4(e.rgb + g*(1.0 - e.a*0.85), e.a)*uMul; }`;

/** Video: straight alfa z dekodéru → premultiplied; „contain“ do poměru vrstvy. */
export const FS_VIDEO = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uFit; out vec4 o;
void main(){
  vec2 uv = (gl_FragCoord.xy/uRes - 0.5)/uFit + 0.5;
  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0){ o = vec4(0.0); return; }
  vec4 c = texture(uTex, vec2(uv.x, 1.0-uv.y));
  o = vec4(c.rgb*c.a, c.a);
}`;

/** Zmenšení na polovinu (4 vzorky) — glow se počítá na malých kopiích, je to levné. */
export const FS_DOWN = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uSrcPx; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy/uRes; vec2 d = uSrcPx*0.5;
  o = 0.25*(texture(uTex,uv+vec2(-d.x,-d.y))+texture(uTex,uv+vec2(d.x,-d.y))+texture(uTex,uv+vec2(-d.x,d.y))+texture(uTex,uv+vec2(d.x,d.y))); }`;

export const FS_BLUR = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uDir; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy/uRes; vec4 c = texture(uTex,uv)*0.2270270270;
  c += (texture(uTex,uv+uDir*1.3846153846)+texture(uTex,uv-uDir*1.3846153846))*0.3162162162;
  c += (texture(uTex,uv+uDir*3.2307692308)+texture(uTex,uv-uDir*3.2307692308))*0.0702702703;
  o = c; }`;

/** Finál: kompozice + glow přes černou. Glow hlavně kolem tvarů (jako v sandboxu). */
export const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uEl, uGlow; uniform vec2 uRes; uniform float uGlowAmt, uGate;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec4 e = texture(uEl, uv);
  vec4 g = texture(uGlow, uv)*uGlowAmt;
  float outside = 1.0 - e.a*0.85;
  vec3 c = e.rgb + g.rgb*outside;
  o = vec4(c*uGate, 1.0);
}`;
