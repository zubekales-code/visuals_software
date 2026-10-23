# VJ software — v0.1 (Etapa 0: test výkonu)

Vlastní VJ aplikace pro Windows: průhledné vrstvy, vizuály reagující na zvuk, výstup na projektor.
Tahle verze je **test výkonu**. Ověřuje, jestli Legion (RTX 3060) utáhne 7 vrstev s videem na 60 fps bez trhání.

## Spuštění (Windows)
1. Jednou nainstaluj **Git** (https://git-scm.com/download/win) a **Node.js LTS** (https://nodejs.org).
2. Dej `start.bat` do složky `VISUALS SOFTWARE` a dvakrát na něj klikni.
   - Poprvé stáhne aplikaci do podsložky `app` a nainstaluje knihovny. Trvá to pár minut a GitHub se jednou zeptá na přihlášení.
   - Příště si sám stáhne novou verzi a spustí se.
3. Otevřou se dvě okna: **pult** (ovládání) a **výstup** (projektor). Když je připojený projektor, výstup na něj skočí sám přes celou obrazovku.

## Než spustíš test na Legionu
- Lenovo Vantage: **Hybrid mode vypnout** (restart), nabíječka zapojená, **Fn+Q** = výkonný režim.
- Windows → Nastavení → Systém → Obrazovka → Grafika: přidej `app\node_modules\electron\dist\electron.exe` → **Vysoký výkon**.
- Displej, na kterém běží výstup, přepni na **60 Hz** (Upřesnit nastavení zobrazení).

## Test brány Etapy 0
1. V pultu klikni na **Sestava brány (7 vrstev + video)**.
2. **Spustit 1 min** (nebo klávesa T). Během testu na nic nesahej.
3. Výsledek se ukáže v pultu a uloží se do `VISUALS SOFTWARE\zpravy\test_….txt` a `.json`. Tam si ho přečte i Claude.
4. Brána: **PROŠLO** = 60 fps, zahozených snímků pod 0,5 %, kreslí RTX.

Pak zkus i **Zátěž: všech 8**, rozlišení 1920×1080 i 2560×1440, glow zap/vyp a náhled v pultu zap/vyp. Každý test dá jednu zprávu.

## Klávesy
| Klávesa | Co dělá |
|---|---|
| 1–8 | zapnout / vypnout vrstvu |
| Esc | nouzová černá (znovu = zpět) |
| G | glow |
| Mezerník | přehrát / pauza hudby |
| T | test výkonu 1 min |

## Obsah = soubory
- `content/shaders/*.glsl` — vizuály. Nový vizuál = nový soubor (hlavička nahoře, funkce `element`). Uložená změna se v aplikaci hned projeví. Chybný shader obraz nesmaže, chyba se ukáže v pultu.
- `content/videos/` — videa. Video na převod přetáhni na `prevod_videa.bat`: vznikne WebM s průhledností.
- `test_alfa.webm` a `test_prostredi.mp4` jsou jen testovací.

## Pro vývoj
`npm start` · `npm test` (testy logiky) · `npm run typecheck` · `npm run smoke` (automatický test výstupu). Popis architektury je v `ARCHITEKTURA.md`.
