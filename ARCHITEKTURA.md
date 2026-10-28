# Architektura (pro AI i lidi)

Electron + WebGL2 + TypeScript. Sestavuje esbuild (`build.mjs`) do `dist/`. Žádný framework v UI.

## Procesy a okna
```
main (Node)  ── src/main/main.ts      okna, monitory (hot-plug), IPC, zápis zpráv, živé načítání knihovny
             ── src/main/library.ts   knihovna VISUALS SOFTWARE\\knihovna: základní balíček, import (+ převod videa), sady
  ├─ pult    ── src/renderer/control.ts  PRAVDA o stavu (AppState), autosave, klávesy, náhled
  └─ výstup  ── src/renderer/output.ts   zvuk + kompozitor na projektor, měření, test výkonu
preload      ── src/main/preload.ts   jediné API oken (window.vj, typ VjApi v src/shared/types.ts)
```
Stav (`AppState`, src/shared/types.ts): 8 vrstev × 10 klipů + `colNames` (názvy sloupců). Klip = `{ content, params, name? }`, params přepisují výchozí hodnoty z hlavičky.
Vrstva: `name?`, `on`, `opacity`, `scale`, `blend` (normal/add/screen), `active` = hrající sloupec. Kompozitor kreslí `activeClip(vrstva)`.
Pořadí: `layers[0]` = SPODNÍ řada (kreslí se první). V pultu se vrstvy číslují shora (`layerNo(i) = layers.length - i`, horní řada = „Vrstva 1“); data, kreslení, sady i klávesy se kvůli číslování nezměnily.
Sloupce: `state.column` = jediný aktivní sloupec; hrát smí jen `l.active === state.column` (`normalizePlay()` to vynutí).
Logika v `types.ts` (testy `test/v05.test.ts`): `clickColumnLogic`, `clickClipLogic` (jiný sloupec = `clip.ready`), `startColumn`
(připravené, jinak celý sloupec), `addColumn/deleteColumn/addLayer/deleteLayer`, `sanitizeGrid` (načtení autosave / sady).
Počet vrstev (1–16) a sloupců (1–30) je proměnný; kompozitor si sloty přidává / uvolňuje, GPU timer má MAX_LAYERS+1 slotů.
Layout pultu (`ui/layout.ts`): velikosti panelů + zmenšení mřížky (CSS zoom na #gridZoom), pojmenované layouty v localStorage.
Přejmenování (`inlineEdit`): pole mimo dokument se nepočítá jako rozepsané — dřív dvojklik zasekl překreslování mřížky.
Záznam chyb: okna posílají `vj.logError`, main zapisuje `zpravy/chyby.txt` (+ zamrzlé / spadlé okno, změny stavu zvuku).
Params klipu: drive, hard (TVRDOST), speed (OSCILACE), density (MNOŽSTVÍ), size (TLOUŠŤKA), colA/colB, glow, strobe + strobeMode, cam (3D), custom.
Klávesy klipů: `src/renderer/keys.ts`. Náhledy klipů (1 snímek): `src/renderer/thumbs.ts`. Vzhled pultu = `INTERFACE KONCEPT/interface_koncept.html`.
Pult: `control.ts` (lišta, mřížka, knihovna, vlastnosti, zvuk), `ui/dom.ts` (prvky, menu, zprávy), `ui/layout.ts` (táhla, velikosti v localStorage).
Hodnoty klipu se vždy nahrazují novým objektem (`clip.params = {...}`) — kompozitor pozná změnu podle reference.
Cesty: `BASE_DIR` = VISUALS SOFTWARE (když aplikace běží z `…\app` vedle start.bat), knihovna `BASE_DIR\knihovna`, zprávy `BASE_DIR\zpravy`.
`stav.md` v repu = průběžný stav projektu; při startu se kopíruje do `VISUALS SOFTWARE\STAV\stav.md`.
Tok: pult → `state` → main → výstup. Výstup → `audio-frame` (každý snímek) + `stats` (2×/s) → pult.
Klávesy stisknuté ve výstupu jdou do pultu (`key`). Výstup je nezávislé okno: když pult zamrzne, obraz běží dál.
Okno výstupu žije stále (počítá zvuk a obraz pro náhled v pultu). „Vypnout výstup“ = `hide()` (ne minimalizace); `OutputPlacement.visible` říká, jestli je vidět. Křížek okna ho jen skryje (`close` se ruší, dokud se aplikace nevypíná). Bez projektoru startuje skrytý; připojený projektor ho zapne, odpojený vypne. IPC `output:visible`.
Skrývání vlastností klipu: `renderProps` skládá řádky do seznamu (`PropEntry` s pevným id), skryté id jsou v `localStorage` `vj.hiddenProps`; menu ⚙ Zobrazit.
Náhled v pultu = stejný `Compositor` v malém rozlišení, krmený audio snímky z výstupu.

## Kompozitor (`src/renderer/engine/`)
- `compositor.ts` — 8 vrstev. Každá vrstva má vlastní buffer RGBA16F v rozlišení výstupu × (1 | ½ | ¼).
  Premultiplied alfa všude. Vypnutá vrstva se nekreslí. Buffery se alokují jen při změně velikosti nebo obsahu.
  Skládání: blend ONE, ONE_MINUS_SRC_ALPHA, pořadí 1 = dole. Glow: ½ → ¼ → 4× blur na ¼ → finál.
  GLOW klipu = stejný řetěz nad bufferem vrstvy (sdílí g2/g4), přičte se jen světlo (FS_LAYER, alfa z vrstvy → bez tmavých lemů).
  STROBO = `strobeGate()` při skládání: vrstva se kreslí dál (stopy), jen se v daném snímku nepřidá.
- `scene-host.ts` — 3D scény (Three.js) na SDÍLENÉM kontextu: render do WebGLRenderTarget (MSAA 4×, průhledné pozadí) → kopie do bufferu vrstvy.
  Před i po kreslení Three.js `renderer.resetState()`; `Gl.draw` proto vždy znovu naváže svůj VAO. Barvy bez převodu (ColorManagement off).
  Registr scén (jeden na okno) nahrává soubory `<script src=file://…?v=N>`, soubor volá `vjScene(def)`. Nová verze souboru = nová instance.
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

## Formát 3D scény (`content/scenes/*.js` → `knihovna\3d`)
```js
/*{ "name": "Pole sloupců", "defaults": { …jako u shaderu… }, "labels": { … },
    "camera": { "distance": 26, "targetY": 0.5, "orbit": 0.15, "height": 0.55, "dist": 0.5, "fov": 0.3, "spin": 0, "kick": 0.25 } }*/
vjScene({ create(THREE, ctx) {          // ctx: scene, root (otáčí ROTACE OBJEKTU), camera (řídí hostitel), addons (tlusté čáry)
  …postavit scénu do ctx.root…
  return { update(f) { … }, dispose() { … } };   // f: SceneFrame (phase, drive, hit, newHit, hard, speed, density, size, colA, colB, w, h…)
} });
```
Kameru řídí hostitel (3D KAMERA v pultu), scéna jen staví a hýbe objekty. V `update` nealokovat. Bez bloomu (GLOW už je).
Test v Node: `test/v04.test.ts` spustí každou scénu 180 snímků bez grafiky.

## Zvuk (`src/renderer/audio.ts`)
Zdroj: demo 122 BPM | wav (přehrává se a analyzuje) | vstup (getUserMedia bez echoCancellation/noiseSuppression/AGC)
| zvuk PC (Windows loopback: výstup zavolá `vj.captureSystemAudio()` → main spustí `getDisplayMedia` s userGesture,
`setDisplayMediaRequestHandler` dá obrazovku + `audio: 'loopback'`; video stopa se hned zastaví).
FFT 2048 → pásma kopák 40–110 Hz, basa 40–250 Hz, výšky 6–14 kHz, hlasitost RMS. Úder = spektrální tok nad adaptivním prahem.

## Test výkonu (`src/renderer/perf-test.ts`)
Délky snímků se předalokují, nic se za běhu nealokuje. Frekvenci displeje posílá main (Windows), ne odhad.
Zpráva: `zpravy/test_<datum>.txt` + `.json` (složku nastavuje `VJ_ZPRAVY` ze start.bat = `VISUALS SOFTWARE\zpravy`).
Prošlo = průměr ≥ 97 % frekvence displeje, zahozených (> 1,5× interval) ≤ 0,5 %, ne softwarová grafika, u ≥ 10 min bez růstu paměti > 50 MB.

## Pravidla
- Žádný vizuál natvrdo v kódu, obsah = soubory v `content/`.
- Malé moduly, testy logiky v `test/` (`npm test`). `npm run smoke` = výstup v SwiftShaderu (xvfb), snímky do zpravy/.
  Smoke vždy začíná od výchozí sady; `VJ_SMOKE_JS=soubor.js` = vlastní krok navíc (jen vývoj, např. jedna scéna na kontrolní snímek).
- Za snímek nealokovat (předpřipravené uniformy, Float32Array).
- Rozsah drží destilát: nápady mimo etapu → „Později“ (stav.md).
