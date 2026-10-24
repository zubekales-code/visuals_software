# Stav — VJ software
Aktualizováno: 24. 10. 2026, 13:55 · aktuální verze **v0.5**

Tento soubor je v repu (`stav.md`) a při každém spuštění aplikace se zkopíruje do `VISUALS SOFTWARE\STAV\stav.md`.
Claude ho přepisuje na konci každé práce. Starší podoby jsou v historii GitHubu.

## Kde jsme
**Etapa 0 (test výkonu)** je postavená. Pult umí: jeden aktivní sloupec + připravené klipy, přidat / smazat sloupce a vrstvy,
zmenšení mřížky, layouty, přejmenování pravým klikem, sjednocené posuvníky, GLOW, STROBO, Zvuk PC a 3D scény.
v0.5 opravuje zaseknutou mřížku (dvojklik na název) a ukazuje, co se opravdu poslouchá. Chyby se zapisují do `zpravy\chyby.txt`.
Pořád se čeká na první měření na Legionu (brána Etapy 0).

## Verze
| Verze | Datum | Co přibylo |
|---|---|---|
| **v0.5** | 24. 10. 2026 | **Jen jeden aktivní sloupec** (hrát můžou jen jeho klipy) · klik na klip v jiném sloupci = **PŘIPRAVEN** (žlutě), při přepnutí sloupce se pustí připravené (jinak celý sloupec) · **+ / − sloupce a vrstvy** (pravý klik na hlavičku / vrstvu, + v liště; max 16 vrstev, 30 sloupců), posuvník mřížky · **zmenšení mřížky** 100 / 75 / 50 % · **layouty** (uložit, přepnout, výchozí) · **přejmenování pravým klikem**, levý klik na název = jen vlastnosti · oprava: dvojklik na název zasekl překreslování mřížky (nešlo nic přesouvat) · oprava: rozbitý náhled se generoval pořád dokola · 3D náhledy postupně (pult nezamrzá) · **Poslouchám:** v panelu Zvuk (zvolený zdroj vs. náhradní demo) + samo se znovu připojí · **záznam chyb** `zpravy\chyby.txt` (i zamrzlé / spadlé okno), spadlý pult se sám načte znovu · **oprava (nalezeno testem na PC):** zakrytý / minimalizovaný výstup Windows uspal → nekreslil, neposlouchal zvuk (příčina „nic nereaguje na hudbu“); výstup se už neuspí, minimalizovaný se vrátí, pult ukáže **STOJÍ** · oprava: menu Výstup se neotevřelo · zmenšení mřížky zmenší i buňky |
| v0.4 | 24. 10. 2026 | **Sloupce:** hlavička nad mřížkou, klik = hraje jen tento sloupec (znovu = zastavit vše), dvojklik = přejmenovat · **přejmenování** vrstev, sloupců a klipů (dvojklik), ukládá se do sady · **název klipu nad klipem**, větší; klik na název = jen vlastnosti (klip hraje dál); trojúhelník ▶ v rohu pryč · **sjednocené kategorie** u všech vizuálů: TVRDOST, OSCILACE, MNOŽSTVÍ, TLOUŠŤKA (chování tvarů beze změny, jen jednotné názvy) · **GLOW na klip** · **STROBO** po snímcích (Pravidelně / Na úder, bez pojistky) · **Zvuk PC** = co hraje zvuková karta (Windows loopback, bez kabelu) · **3D scény** (Three.js, knihovna\3d, záložka 3D): Pole sloupců, Mrak bodů, Drátěná tělesa, Červi + **3D KAMERA** (rotace kamery, výška, vzdálenost, zorné pole, rotace objektu, úder kamery) |
| v0.3 | 24. 10. 2026 | Klik na klip = zapnout / druhý klik vypnout · přetahování klipů (Ctrl = kopie) · táhla pro velikost částí pultu · knihovna `VISUALS SOFTWARE\knihovna` (tvary, videa, zvuk, sady) · sady uložit/načíst/nová · panel Zvuk se seznamem skladeb · výstup na monitor (projektor automaticky) |
| v0.2 | 23. 10. 2026 | Pult podle konceptu: horní lišta, mřížka 8 vrstev × 10 sloupců s náhledy klipů, vlastnosti klipu, zvuk, prolínání Normál/Add/Screen, zámek, klávesy po řadách, písma offline |
| v0.1 | 23. 10. 2026 | Základ Etapy 0: Electron + WebGL2, pult + výstupní okno, 8 vrstev s alfou, glow, video WebM s alfou, zvuk (demo / wav / line-in), test výkonu se zprávou, `start.bat`, 8 vizuálů ze sandboxu |

## Ověřeno
- **Na PC uživatele (desktop, RTX 4080 SUPER, Claude ovládal pult):** v0.5 běží 58–60 fps; přepnutí sloupce pustí jen připravený klip; klik na klip v jiném sloupci = PŘIPRAVEN; přejmenování pravým klikem; zmenšení 50 / 75 %; + / − sloupce s posuvníkem; menu Layout a Výstup; **Zvuk PC se na Windows připojí** (zeleně „Poslouchám: zvuk tohoto PC“, po startu za ~1 s).
- V cloudu: 17 testů logiky + automatický test pultu a výstupu (4 3D scény, GLOW, STROBO), 0 chyb.
- **Neověřeno:** Zvuk PC při skutečně hrající hudbě (při testu nic nehrálo) · Legion (RTX 3060) · projektor za běhu.

## Čeká nás
- [ ] **Krok 0:** na Legionu Git + Node.js LTS, nastavit Hybrid off / Vysoký výkon / 60 Hz, spustit `start.bat` (stáhne v0.5)
- [ ] Pustit hudbu v PC se zdrojem **Zvuk PC** → pásma se musí hýbat; kdyby se znovu stalo „nic nereaguje“, Claude si přečte `zpravy\chyby.txt`
- [ ] **Etapa 0:** Test výkonu → Sestava brány → 1 min → zpráva `zpravy\test_….txt` (brána: 60 fps, 7 vrstev + video)
- [ ] Etapa 0: další měření — mimo jiné **sloupec 3 (4× 3D scéna)** a GLOW na několika klipech zároveň
- [ ] Rozhodnout jeden vs. dva procesy (podle měření)
- [ ] Etapa 1 Jádro — až po bráně
- [ ] Etapa 2 Pult (napojení posuvníků na zvuk: množství / náběh / doznění, MIDI později) · Etapa 3 Videa a spolehlivost · Etapa 4 Na akci

## Otevřená rozhodnutí
- Jeden vs. dva procesy (teď: nezávislé výstupní okno + náhled v pultu) → podle měření.
- Zpoždění zvuk→obraz (kabel i Zvuk PC): zatím jen odhad; skutečné změření v Etapě 1.
- Kolik 3D vrstev najednou utáhne Legion → podle měření (odhad 2–3 těžké).
- Klávesy klipů: řady po vrstvách (8 = 1–0, 7 = Q–P, 6 = A–;, 5 = Z–/, 4 = ⇧1–0, 3 = ⇧Q–P, 2 = F1–F10, 1 = ⇧F1–F10), jen prvních 8 vrstev × 10 sloupců. Sloupce zatím jen myší.

## Později (nápady mimo etapu)
MIDI + learn · klávesy pro spuštění sloupce · další 3D scény (cel shading, roj, hologram…) · HAP video · banky · cue list · víc modulátorů · efekty · Ableton Link / OSC · pojistka výkonu.

## Poznámka
- Claude vidí složku VISUALS SOFTWARE přes desktopovou aplikaci (chat propojený s počítačem): čte `zpravy\chyby.txt` i zprávy z testů sám.
- Claude umí na PC sám spustit `start.bat` a proklikat pult (ovládání počítače). Testováno na stolním PC (RTX 4080 SUPER, 2 monitory: PA278CV + DELL jako „projektor“). Hrací stroj je dál Legion (RTX 3060).
- `start.bat` před aktualizací vrací `package-lock.json` (jinak `git pull` selže).
