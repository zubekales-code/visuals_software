# Architektura (pro AI i lidi)

Electron + WebGL2 + TypeScript. Sestavuje esbuild (`build.mjs`) do `dist/`. Žádný framework v UI.

## Procesy a okna
```
main (Node)  ── src/main/main.ts      okna, obsah z disku, IPC, zápis zpráv, živé načítání shaderů
  ├─ pult    ── src/renderer/control.ts  PRAVDA o stavu (AppState), autosave, klávesy, náhled
  └─ výstup  ── src/renderer/output.ts   zvuk + kompozitor na projektor, měření, test výkonu
preload      ── src/main/preload.ts   jediné API oken (window.vj, typ VjApi v src/shared/types.ts)
```
Stav (`AppState`, src/shared/types.ts): 8 vrstev × 10 klipů. Klip = `{ content, params }`, params přepisují výchozí hodnoty z hlavičky shaderu.
Vrstva: `on`, `opacity`, `scale`, `blend` (normal/add/screen), `active` = hrající sloupec. Kompozitor kreslí `activeClip(vrstva)`.
Klávesy klipů: `src/renderer/keys.ts`. Náhledy klipů (1 snímek): `src/renderer/thumbs.ts`. Vzhled pultu = `INTERFACE KONCEPT/interface_koncept.html`.
Tok: pult → `state` → main → výstup. Výstup → `audio-frame` (každý snímek) + `stats` (2×/s) → pult.
Klávesy stisknuté ve výstupu jdou do pultu (`key`). Výstup je nezávislé okno: když pult zamrzne, obraz běží dál.
Náhled v pultu = stejný `Compositor` v malém rozlišení, krmený audio snímky z výstupu.

## Kompozitor (`src/renderer/engine/`)
- `compositor.ts` — 8 vrstev. Každá vrstva má vlastní buffer RGBA16F v rozlišení výstupu × (1 | ½ | ¼).
  Premultiplied alfa všude. Vypnutá vrstva se nekreslí. Buffery se alokují jen při změně velikosti nebo obsahu.
  Skládání: blend ONE, ONE_MINUS_SRC_ALPHA, pořadí 1 = dole. Glow: ½ → ¼ → 4× blur na ¼ → finál.
- `glsl.ts` — rámec shaderu (PRELUDE 1:1 ze sandboxu „Elementy“), video, blur, finál.
- `layer-runtime.ts` — reakce vrstvy na zvuk (drive, údery, fáze, plynulé zap/vyp), logika ze sandboxu.
- `gpu-timer.ts` — GPU ms na vrstvu (EXT_disjoint_timer_query_webgl2, když je).
- Video: `<video>` → textura jen při novém snímku dekodéru (requestVideoFrameCallback), straight → premultiplied v shaderu.
- Shader se před prvním použitím zahřeje (jeden tah). Chyba překladu → zůstává stará verze, chyba jde do stats.errors.
- Ztráta WebGL kontextu → výstup postaví kompozitor znovu po `webglcontextrestored`. Spadlý výstup se znovu načte.

## Formát vizuálu (`content/shaders/*.glsl`)
```glsl
/*{ "name": "Pádla", "feedback": false,
    "defaults": { "drive": "kick", "hard": 0.3, "speed": 1, "density": 1, "size": 1, "colA": "#46b654", "colB": "#ffffff" },
    "labels": { "speed": "Rychlost dojezdu" },
    "params": [ { "name": "uWarp", "label": "Vlnění", "default": 0.3, "min": 0, "max": 1 } ] }*/
vec4 element(vec2 p) { ... }   // p: střed 0,0, y od -1 do 1; vrací premultiplied RGBA
```
Uniformy z PRELUDE: uRes, uTime, uFrame, uHard, uSpeed, uDensity, uSize, uDrive, uHit, uSinceHit, uHitCount,
uPrevHitCount, uLoud, uPhase, uDPhase, uColA, uColB, uHitAge[8], …; `PREV(uv)` = předchozí snímek (jen feedback: true).
`params` se deklarují samy jako `uniform float`. Parser: `src/shared/shader-header.ts`.

## Zvuk (`src/renderer/audio.ts`)
Zdroj: demo 122 BPM | wav (přehrává se a analyzuje) | vstup (getUserMedia bez echoCancellation/noiseSuppression/AGC).
FFT 2048 → pásma kopák 40–110 Hz, basa 40–250 Hz, výšky 6–14 kHz, hlasitost RMS. Úder = spektrální tok nad adaptivním prahem.

## Test výkonu (`src/renderer/perf-test.ts`)
Délky snímků se předalokují, nic se za běhu nealokuje. Frekvenci displeje posílá main (Windows), ne odhad.
Zpráva: `zpravy/test_<datum>.txt` + `.json` (složku nastavuje `VJ_ZPRAVY` ze start.bat = `VISUALS SOFTWARE\zpravy`).
Prošlo = průměr ≥ 97 % frekvence displeje, zahozených (> 1,5× interval) ≤ 0,5 %, ne softwarová grafika, u ≥ 10 min bez růstu paměti > 50 MB.

## Pravidla
- Žádný vizuál natvrdo v kódu, obsah = soubory v `content/`.
- Malé moduly, testy logiky v `test/` (`npm test`). `npm run smoke` = výstup v SwiftShaderu (xvfb), snímky do zpravy/.
- Za snímek nealokovat (předpřipravené uniformy, Float32Array).
- Rozsah drží destilát: nápady mimo etapu → „Později“ (stav.md).
