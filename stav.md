# Stav — VJ software
Aktualizováno: 29. 10. 2026, 21:35 · aktuální verze **v0.6**

Tento soubor je v repu (`stav.md`) a při každém spuštění aplikace se zkopíruje do `VISUALS SOFTWARE\STAV\stav.md`.
Claude ho přepisuje na konci každé práce. Starší podoby jsou v historii GitHubu.

## Kde jsme
**v0.6 (28. 10. večer):** úpravy rozhraní na přání uživatele — skrývání vlastností v panelu klipu, výstup na projektor jde vypnout / zapnout (okno se skryje), vrstvy se číslují shora 1, 2, 3 …. Ověřeno jen v cloudu (SwiftShader); na Legionu a stolním PC čeká na vyzkoušení (viz Neověřeno).
**Testovací .exe (přitaženo dopředu z Etapy 4 na přání uživatele):** sestavuje se na GitHubu (Actions → „Sestavit .exe“) do Releases `test-v0.6.0`, zip 201 MB. Na stolním PC rozbalený v `Desktop\VISUALS\VISUALS SOFTWARE EXE\VISUALS.exe` (zip vedle pro Legion). Bez podpisu: placený podpis pro jednotlivce v EU stojí 150–300 $/rok a SmartScreen stejně hned neumlčí (Azure Artifact Signing ~10 $/měs. jen pro firmy v EU) → zatím ne.

**Etapa 0 (test výkonu)** je postavená a **v0.5 běží na Legionu** (RTX 3060). První měření brány: **těsně neprošlo** —
průměr 59,35 fps, ale 0,95 % zahozených snímků (limit 0,5 %). **Grafika výkonem stačí s velkou rezervou**
(8 vrstev vč. 2 videí ≈ 3,4 ms z 16,7 ms na snímek). Zahozené snímky jsou rozprostřené po celém testu (~1 za 2 s),
nejde tedy o nedostatek výkonu GPU, ale o občasné zaseknutí. Hledá se příčina (viz Čeká nás).

## Měření na Legionu (RTX 3060 Laptop, 1920×1080, glow zap, zvuk wav)
| Čas | Displej | Vrstvy | Průměr fps | 1 % nejhorších | Nejdelší snímek | Zahozené | GPU (vrstvy + skládání) | Výsledek |
|---|---|---|---|---|---|---|---|---|
| 28. 10. 18:51 | 60 Hz | **8** vč. 2 videí (mp4 + webm alfa), 4× 3D | 59,35 | 25,6 | 184 ms | **0,95 %** (34) | ≈ 3,4 ms | ❌ těsně (zahozené) |
| 28. 10. 18:45 | 60 Hz | 6 vč. videa webm alfa, 3× 3D | 59,5 | 28,9 | 334 ms | 0,53 % (19) | ≈ 3,7 ms | ❌ těsně (zahozené) |
| 28. 10. 18:40 | **165 Hz** | 5, bez videa | 150,6 | 32,2 | 346 ms | 5,85 % | ≈ 2,7 ms | ❌ displej na 165 Hz |

Paměť ve všech testech stálá (13–14 MB). Zpoždění zvukového řetězce 52 ms. Před testy nebylo potvrzeno: Hybrid mode vypnutý, Fn+Q (výkon), nabíječka.

## Verze
| Verze | Datum | Co přibylo |
|---|---|---|
| **v0.6** | 28. 10. 2026 | **Testovací .exe** (`VISUALS.exe`, složka s knihovnou / zprávami / STAV vedle sebe, bez Gitu a Node), sestavení přes GitHub Actions do Releases ·  **⚙ Zobrazit** v panelu vlastností klipu: odškrtneš vlastnosti, které nechceš vidět (TLOUŠŤKA, STROBO, barvy, 3D kamera, průhlednost vrstvy…); platí pro všechny klipy, pamatuje se, skryté dál platí · **Výstup jde vypnout a zapnout** (menu Výstup, nahoře přepínač): okno se úplně skryje, ne minimalizuje; náhled v pultu a zvuk jedou dál; bez projektoru startuje výstup vypnutý, projektor ho zapne sám, odpojení ho vypne, křížek okna ho jen skryje · **Vrstvy se číslují shora:** nahoře Vrstva 1, dole nejvyšší číslo (data, kreslení, klávesy a uložené sady beze změny; horní řada má dál klávesy 1–0) · test výkonu upozorní, když je výstup vypnutý · **`start.bat` bez internetu** spustí poslední staženou verzi (dřív skončil chybou a pult se neotevřel) · `start.bat` se po zavření aplikace sám aktualizuje z `app\start.bat` |
| v0.5 | 24. 10. 2026 | **Jen jeden aktivní sloupec** (hrát můžou jen jeho klipy) · klik na klip v jiném sloupci = **PŘIPRAVEN** (žlutě), při přepnutí sloupce se pustí připravené (jinak celý sloupec) · **+ / − sloupce a vrstvy** (pravý klik na hlavičku / vrstvu, + v liště; max 16 vrstev, 30 sloupců), posuvník mřížky · **zmenšení mřížky** 100 / 75 / 50 % · **layouty** (uložit, přepnout, výchozí) · **přejmenování pravým klikem**, levý klik na název = jen vlastnosti · oprava: dvojklik na název zasekl překreslování mřížky (nešlo nic přesouvat) · oprava: rozbitý náhled se generoval pořád dokola · 3D náhledy postupně (pult nezamrzá) · **Poslouchám:** v panelu Zvuk (zvolený zdroj vs. náhradní demo) + samo se znovu připojí · **záznam chyb** `zpravy\chyby.txt` (i zamrzlé / spadlé okno), spadlý pult se sám načte znovu · **oprava (nalezeno testem na PC):** zakrytý / minimalizovaný výstup Windows uspal → nekreslil, neposlouchal zvuk (příčina „nic nereaguje na hudbu“); výstup se už neuspí, minimalizovaný se vrátí, pult ukáže **STOJÍ** · oprava: menu Výstup se neotevřelo · zmenšení mřížky zmenší i buňky |
| v0.4 | 24. 10. 2026 | **Sloupce:** hlavička nad mřížkou, klik = hraje jen tento sloupec (znovu = zastavit vše), dvojklik = přejmenovat · **přejmenování** vrstev, sloupců a klipů (dvojklik), ukládá se do sady · **název klipu nad klipem**, větší; klik na název = jen vlastnosti (klip hraje dál); trojúhelník ▶ v rohu pryč · **sjednocené kategorie** u všech vizuálů: TVRDOST, OSCILACE, MNOŽSTVÍ, TLOUŠŤKA (chování tvarů beze změny, jen jednotné názvy) · **GLOW na klip** · **STROBO** po snímcích (Pravidelně / Na úder, bez pojistky) · **Zvuk PC** = co hraje zvuková karta (Windows loopback, bez kabelu) · **3D scény** (Three.js, knihovna\3d, záložka 3D): Pole sloupců, Mrak bodů, Drátěná tělesa, Červi + **3D KAMERA** (rotace kamery, výška, vzdálenost, zorné pole, rotace objektu, úder kamery) |
| v0.3 | 24. 10. 2026 | Klik na klip = zapnout / druhý klik vypnout · přetahování klipů (Ctrl = kopie) · táhla pro velikost částí pultu · knihovna `VISUALS SOFTWARE\knihovna` (tvary, videa, zvuk, sady) · sady uložit/načíst/nová · panel Zvuk se seznamem skladeb · výstup na monitor (projektor automaticky) |
| v0.2 | 23. 10. 2026 | Pult podle konceptu: horní lišta, mřížka 8 vrstev × 10 sloupců s náhledy klipů, vlastnosti klipu, zvuk, prolínání Normál/Add/Screen, zámek, klávesy po řadách, písma offline |
| v0.1 | 23. 10. 2026 | Základ Etapy 0: Electron + WebGL2, pult + výstupní okno, 8 vrstev s alfou, glow, video WebM s alfou, zvuk (demo / wav / line-in), test výkonu se zprávou, `start.bat`, 8 vizuálů ze sandboxu |

## Paralelní předběžné testování .exe
Vedle `start.bat` se zkouší i testovací `VISUALS.exe` (zamčená verze, sestavená na GitHubu). Sem se zapisuje, co se při tom najde — nová zjištění nahoře.

| Kdy | Kde | Verze | Co se stalo | Příčina / stav |
|---|---|---|---|---|
| 29. 10. 21:17–21:27 | notebook `laptop-o17h7u3o` (RTX 3060 Laptop), složka `C:\Users\zubek\OneDrive\Desktop\VISUALS SOFTWARE EXE`, bez projektoru | test-v0.6.0 | **Ukazatel fps hlásí ~1 fps** (v záznamu „běží: 0 fps“), přitom náhled v pultu jde plynule | **Chyba v0.6:** bez projektoru startuje výstup skrytý a Windows skrytému oknu dovolí jen ~1 snímek za sekundu. Ukazatel fps měří to skryté okno; náhled v pultu se kreslí sám, proto je plynulý. Obejití: Výstup → Zapnout výstup (okno odsunout, neminimalizovat). Oprava navržena, čeká na pokyn. |
| 29. 10. | dtto | test-v0.6.0 | **Zvuk PC začal reagovat až asi po 2 minutách** | Podle `chyby.txt` se zdroj připojil za ~1 s (21:20:25 → 21:20:26), ale rozbor zvuku běží ve skrytém výstupu jen ~1× za sekundu → tvary skoro nereagují a hlídač zvuku ho každých ~30 s znovu připojuje. Stejná příčina jako 1 fps. Po opravě znovu změřit. |
| 29. 10. | dtto | test-v0.6.0 | **`VISUALS.exe` se otevíral asi 1 minutu** | Neověřeno. Záznam aplikace začíná až ve chvíli, kdy se spustila (start 21:17:31 → výstup 21:17:39 → pult 21:17:43, tedy ~12 s); zbytek čekání je před spuštěním. Podezření: Windows Defender / SmartScreen kontroluje nepodepsaný 250MB `.exe` a složka leží v **OneDrive** (synchronizace). Vyzkoušet: zkopírovat složku mimo OneDrive (např. `C:\VISUALS`), spustit 2× po sobě a změřit stopkami. |

## Ověřeno
- **Na PC uživatele (desktop, RTX 4080 SUPER, Claude ovládal pult):** v0.5 běží 58–60 fps; přepnutí sloupce pustí jen připravený klip; klik na klip v jiném sloupci = PŘIPRAVEN; přejmenování pravým klikem; zmenšení 50 / 75 %; + / − sloupce s posuvníkem; menu Layout a Výstup; **Zvuk PC se na Windows připojí** (zeleně „Poslouchám: zvuk tohoto PC“, po startu za ~1 s).
- **Na Legionu (28. 10.):** Git + Node.js nainstalované, `start.bat` stáhl v0.5, aplikace kreslí na **RTX 3060** (Vysoký výkon pro `electron.exe` zabral), test výkonu se zprávou funguje, paměť stálá. Výkon GPU s rezervou (viz Měření).
- **.exe na Windows (GitHub, softwarová grafika):** sestavený `VISUALS.exe` se spustí, projde automatický test pultu i výstupu (SMOKE OK), založí si `knihovna` (15 souborů), `zpravy`, `STAV` vedle sebe.
- V cloudu: 17 testů logiky + automatický test pultu a výstupu (4 3D scény, GLOW, STROBO), 0 chyb.
- **Zjištěno (.exe, 29. 10.):** skrytý výstup = ~1 fps a zvuk skoro nereaguje (viz Paralelní předběžné testování .exe).
- **Neověřeno (.exe):** běh na RTX (Grafika → Vysoký výkon pro `VISUALS.exe`), výkon proti `start.bat`, převod videa (ffmpeg) z .exe, SmartScreen / antivir na Legionu.
- **Neověřeno (start.bat):** spuštění bez internetu a samoaktualizace (dávka pro Windows nejde vyzkoušet v cloudu) → vyzkoušet: vypnout Wi-Fi, spustit `start.bat`.
- **Neověřeno (v0.6):** skryté okno výstupu na Windows s RTX — běží dál obraz a zvuk pro náhled v pultu? (v cloudu s SwiftShader jen potvrzeno, že statistiky chodí dál) · **Zvuk PC** se skrytým výstupem · test výkonu se skrytým výstupem (nemusí mít skutečný rytmus displeje, proto varování; měř se zapnutým výstupem) · projektor: automatické zapnutí při připojení a vypnutí při odpojení.
- **Neověřeno:** brána Etapy 0 (plynulost bez zahozených snímků) · Hybrid mode na Legionu · Zvuk PC při skutečně hrající hudbě · projektor za běhu · 10min a 2h test.

## Čeká nás
- [x] **Krok 0:** na Legionu Git + Node.js LTS, `start.bat` (v0.5), `electron.exe` → Vysoký výkon, displej 60 Hz
- [ ] **Opravit skrytý výstup** (čeká na pokyn): vypnutý výstup musí dál počítat zvuk 60× za s (bez kreslení) a fps ukazovat z toho, co je opravdu vidět · pak nové testovací .exe a znovu změřit dobu, než reaguje Zvuk PC
- [ ] **.exe se otevírá ~1 min:** zkusit složku mimo OneDrive, změřit 1. a 2. spuštění
- [ ] **Najít příčinu zahozených snímků** (od nejlevnějšího, vždy Sestava brány → 1 min):
  - [ ] **.exe na stolním PC:** spustit `Desktop\VISUALS\VISUALS SOFTWARE EXE\VISUALS.exe`, nastavit mu Vysoký výkon, porovnat s `start.bat` · na Legion: zip z Releases (nebo z `Desktop\VISUALS` přes USB) → Vlastnosti → Odblokovat → rozbalit
  - [ ] **Legion: jednou ručně** zkopírovat `app\start.bat` do `VISUALS SOFTWARE` (nahradit) — starý `start.bat` se sám aktualizovat neumí; pak vyzkoušet s vypnutou Wi-Fi
  - [ ] (v0.6) vyzkoušet na PC: menu Výstup → Vypnout / Zapnout výstup (náhled dole vlevo se nesmí zastavit, hudba dál reaguje) · ⚙ Zobrazit v panelu klipu · číslování vrstev shora
  - [ ] Legion: **Hybrid mode vypnout** (Lenovo Vantage / Legion Space → Grafika; po změně restart), nabíječka, **Fn+Q** = výkon (tlačítko napájení svítí červeně) → test
  - [ ] Stejný test s vypnutým **Živým náhledem v pultu** (menu Výstup) → ukáže, jestli zasekává náhled v pultu
  - [ ] Pak **10 min** test (zahozené po startu vs. pravidelně; paměť)
  - [ ] Když to nepomůže: Claude doplní do zprávy časy zaseknutí a rozložení délek snímků (jen se souhlasem — změna kódu)
- [ ] Pustit hudbu v PC se zdrojem **Zvuk PC** → pásma se musí hýbat; kdyby se znovu stalo „nic nereaguje“, Claude si přečte `zpravy\chyby.txt`
- [ ] Etapa 0: další měření — GLOW na několika klipech zároveň · výstup na projektor (HDMI na Legionu 5 obvykle vede přímo z RTX — ověřit)
- [ ] Rozhodnout jeden vs. dva procesy (podle měření)
- [ ] Etapa 1 Jádro — až po bráně
- [ ] Etapa 2 Pult (napojení posuvníků na zvuk: množství / náběh / doznění, MIDI později) · Etapa 3 Videa a spolehlivost · Etapa 4 Na akci

## Otevřená rozhodnutí
- Jeden vs. dva procesy (teď: nezávislé výstupní okno + náhled v pultu) → podle měření.
- Zpoždění zvuk→obraz (kabel i Zvuk PC): zatím jen odhad; skutečné změření v Etapě 1.
- Kolik 3D vrstev najednou utáhne Legion → první měření: 4× 3D + 2 videa + 2 tvary stojí GPU jen ≈ 3,4 ms (výkonem v pohodě; plynulost se ještě řeší).
- Klávesy klipů: řady po vrstvách (od v0.6 číslované shora: 1 = 1–0, 2 = Q–P, 3 = A–;, 4 = Z–/, 5 = ⇧1–0, 6 = ⇧Q–P, 7 = F1–F10, 8 = ⇧F1–F10; klávesy se nezměnily, jen čísla vrstev), jen prvních 8 vrstev × 10 sloupců. Sloupce zatím jen myší.

## Později (nápady mimo etapu)
MIDI + learn · klávesy pro spuštění sloupce · další 3D scény (cel shading, roj, hologram…) · HAP video · banky · cue list · víc modulátorů · efekty · Ableton Link / OSC · pojistka výkonu.

## Poznámka
- Claude vidí složku VISUALS SOFTWARE přes desktopovou aplikaci (chat propojený s počítačem): čte `zpravy\chyby.txt` i zprávy z testů sám.
- Claude umí na PC sám spustit `start.bat` a proklikat pult (ovládání počítače). Testováno na stolním PC (RTX 4080 SUPER, 2 monitory: PA278CV + DELL jako „projektor“). Hrací stroj je dál Legion (RTX 3060).
- `start.bat` před aktualizací vrací `package-lock.json` (jinak `git pull` selže). Když `git pull` selže (bez internetu), přeskočí `npm install` a spustí poslední verzi (podmínka: `app\node_modules\electron\dist\electron.exe` existuje). Po zavření aplikace se nakopíruje `app\start.bat` přes kořenový (vše na jednom řádku, aby přepsání běžící dávky nevadilo).
- `.exe`: zkoušení dál přes `start.bat` (každá změna se stáhne sama); `.exe` = zamčená verze na akci, novou sestaví Claude spuštěním workflow. Knihovna .exe je oddělená od knihovny `start.bat`.
- **Na novém PC:** do složky `VISUALS SOFTWARE` dát **jen `start.bat`** (ne rozbalený zip z GitHubu). Když vedle něj leží `package.json`, myslí si, že je uvnitř aplikace, a spadne na „not a git repository“. Na Legionu je starý rozbalený zip odklizený v `_rozbaleny_zip` (lze smazat).
- Legion: uživatelská složka `C:\Users\Uzivatel\Desktop\VISUALS\VISUALS SOFTWARE\` (na stolním PC `C:\Users\zubek\…`). `electron.exe` je v `app\node_modules\electron\dist\`.
- Přenosná verze „rozbal kdekoli a spusť“ (.exe přes electron-builder, bez Gitu a Node) = **Etapa 4**.
