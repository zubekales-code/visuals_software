# VJ software — v0.4 (Etapa 0: test výkonu + první funkce pultu)

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
1. V horní liště klikni na **Test výkonu** → **Sestava brány** (vrstvy 2–8 = 7 vrstev vč. videa).
2. **Spustit 1 min**. Během testu na nic nesahej.
3. Výsledek se ukáže v pultu a uloží se do `VISUALS SOFTWARE\zpravy\test_….txt` a `.json`. Tam si ho přečte i Claude.
4. Brána: **PROŠLO** = 60 fps, zahozených snímků pod 0,5 %, kreslí RTX.

Pak zkus i **Zátěž: všech 8**, rozlišení 1920×1080 i 2560×1440, glow zap/vyp a náhled v pultu zap/vyp. Každý test dá jednu zprávu.

## Pult
Vypadá podle schváleného konceptu (`INTERFACE KONCEPT`): nahoře lišta, vlevo **knihovna**, uprostřed mřížka **vrstvy × 10 sloupců**, dole **náhled výstupu | vlastnosti klipu | zvuk**.
- **Klip** = vizuál + jeho vlastní hodnoty. **Klik na klip spustí, druhý klik zastaví** (stejně jako klávesa). Svítící rámeček = hraje.
- **Název klipu** je nad klipem. **Klik na název** jen otevře nastavení klipu dole (klip hraje dál). **Dvojklik na název** = přejmenovat (např. „Škrábance hrubé“).
- **Sloupce:** nahoře nad mřížkou jsou hlavičky sloupců 1–10. **Klik na hlavičku** = hraje jen tento sloupec (vše z jiných sloupců se zastaví, vrstvy bez klipu v tomto sloupci ztichnou). Druhý klik zastaví vše. **Dvojklik** = přejmenovat sloupec (např. „Intro“). Plně podbarvená hlavička = hraje celý sloupec, obrys = hraje z něj jen něco.
- **Vrstvy:** dvojklik na název vrstvy = přejmenovat. Názvy vrstev, sloupců i klipů se ukládají do sady.
- **Přetahování:** klip táhni do jiné buňky i jiné vrstvy (na obsazenou buňku se prohodí), **s Ctrl se zkopíruje**. Z knihovny táhni vizuál do buňky.
- **Pravý klik na klip:** změnit vizuál, duplikovat jako variantu, ukázat soubor, odebrat.
- **Hlavička vrstvy:** oko zapne/vypne vrstvu, posuvník = průhlednost, Normál/Add/Screen = prolínání, 1/½/¼ = rozlišení vrstvy (menší = levnější).
- **Velikosti částí:** táhni za proužky mezi knihovnou a mřížkou, nad spodní částí a mezi spodními panely. Dvojklik = výchozí. Knihovnu schováš šipkou ‹.
- **Výstup** (tlačítko v liště): na který monitor, celá obrazovka nebo okno, rozlišení obrazu. Připojený projektor = výstup na něj skočí sám, odpojený = výstup do okna.
- **ZÁMEK** (Ctrl+L): myš nic nezmění, klávesy dál spouští klipy.
- **Test výkonu** je v horní liště.

## Nastavení klipu (panel dole uprostřed)
Všechny vizuály mají **stejné kategorie** (co přesně dělají u daného vizuálu, ukáže bublina po najetí myší):
| Kategorie | Co dělá |
|---|---|
| Reaguje na | kopák / basa / výšky / hlasitost / nic |
| TVRDOST | 0 = plynule, 1 = ostře na úder |
| OSCILACE | rychlost pohybu, kmitání, dýchání |
| MNOŽSTVÍ | počet a hustota prvků |
| TLOUŠŤKA | tloušťka a velikost prvků |
| GLOW | záře jen kolem tohoto klipu (vedle „Glow celku“ v náhledu) |
| STROBO | blikání po snímcích: **Pravidelně** = n snímků svítí / n tma (1 = každý druhý snímek), **Na úder** = svítí n snímků po každém úderu. 0 = vypnuto |

GLOW a STROBO mají i videa. 3D scény mají navíc **3D KAMERA**: rotace kamery, výška kamery, vzdálenost, zorné pole, rotace objektu, úder kamery (přiblížení na úder).

## Zvuk
- **Zvuk PC** = co právě hraje zvuková karta tohoto počítače (Spotify, YouTube, přehrávač…). Bez kabelu a bez nastavování.
- **Kabel** = vstup zvukovky (line-in z druhého počítače). **Wav** = skladba z knihovny. **Demo** = umělý rytmus 122 BPM.
- Když zdroj nejde, napíše to panel Zvuk červeně.

## 3D scény (experimentální)
- Záložka **3D** v knihovně. Scény jsou soubory `.js` ve složce `VISUALS SOFTWARE\knihovna\3d` (Three.js). Přetáhneš je do mřížky jako tvary.
- Základní 4: **Pole sloupců** (3D equalizer), **Mrak bodů** (body se přelévají mezi tvary), **Drátěná tělesa**, **Červi**.
- Mají průhledné pozadí, takže se skládají s ostatními vrstvami. 3D je náročnější: počítej spíš se 2–3 3D vrstvami najednou (ověř testem výkonu).

## Knihovna a sady
- Knihovna je složka **`VISUALS SOFTWARE\knihovna`** (tvary, videa, zvuk, sady). Aktualizace aplikace ji nepřepíše.
- **Přidat soubory:** tlačítko **+ Přidat**, nebo je přetáhni z Průzkumníka do knihovny / rovnou do buňky / wav do panelu Zvuk.
  Video v jiném formátu (.mov, .mkv, .avi…) se samo převede na WebM s průhledností.
- **Sady (estetiky):** klikni na název vlevo nahoře → uložit pod jménem / načíst / nová prázdná. Ctrl+S uloží. Sada = rozložení klipů a jejich nastavení; vizuály jsou soubory v knihovně, takže estetiku vyměníš bez zásahu do systému.
- Nový **druh** tvaru (úplně nové chování) napíše Claude podle reference → přetáhneš ho do knihovny.

## Klávesy
Každá vrstva má svou řadu kláves. Klávesa spustí klip v daném sloupci, druhý stisk ho zastaví. Klávesa je vidět v rohu buňky.

| Vrstva | Klávesy (sloupec 1–10) |
|---|---|
| 8 | 1 2 3 … 0 |
| 7 | Q W E … P |
| 6 | A S D … ; |
| 5 | Z X C … / |
| 4 | Shift + 1 … 0 |
| 3 | Shift + Q … P |
| 2 | F1 … F10 |
| 1 | Shift + F1 … F10 |

| Klávesa | Co dělá |
|---|---|
| Esc | nouzová černá (znovu = zpět) |
| Mezerník | přehrát / pauza hudby (wav) |
| Ctrl+L | zámek |
| Ctrl+S | uložit sadu |

## Obsah = soubory
- `knihovna\tvary\*.glsl` — vizuály (hlavička nahoře, funkce `element`). Uložená změna se hned projeví; chybný shader obraz nesmaže.
- `knihovna\3d\*.js` — 3D scény (hlavička nahoře, `vjScene({ create(THREE, ctx) … })`). Uložená změna se hned projeví.
- `knihovna\videa\` — videa (WebM s průhledností / MP4), `knihovna\zvuk\` — skladby, `knihovna\sady\` — uložené sady.
- `content\` v aplikaci je jen základní balíček: při startu se do knihovny doplní, co v ní ještě nebylo (tvé úpravy nepřepíše, smazané nevrací).
- `test_alfa.webm` a `test_prostredi.mp4` jsou jen testovací.

## Pro vývoj
`npm start` · `npm test` (testy logiky) · `npm run typecheck` · `npm run smoke` (automatický test výstupu). Popis architektury je v `ARCHITEKTURA.md`.
