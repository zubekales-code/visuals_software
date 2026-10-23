# Stav — VJ software
Aktualizováno: 24. 10. 2026, 00:45 · aktuální verze **v0.3**

Tento soubor je v repu (`stav.md`) a při každém spuštění aplikace se zkopíruje do `VISUALS SOFTWARE\STAV\stav.md`.
Claude ho přepisuje na konci každé práce. Starší podoby jsou v historii GitHubu.

## Kde jsme
**Etapa 0 (test výkonu)** je postavená, pult už vypadá podle schváleného konceptu a umí knihovnu, sady, přetahování a výstup na monitor.
Čeká se na první měření na Legionu (brána Etapy 0).

## Verze
| Verze | Datum | Co přibylo |
|---|---|---|
| **v0.3** | 24. 10. 2026 | Klik na klip = zapnout / druhý klik vypnout · přetahování klipů mezi buňkami i vrstvami (Ctrl = kopie) · táhla pro velikost částí pultu (pamatují se) · **knihovna** ve složce `VISUALS SOFTWARE\knihovna` (tvary, videa, zvuk, sady) s náhledy, hledáním, + Přidat a přetažením z Průzkumníka; video v jiném formátu se samo převede · **sady** (estetiky) uložit/načíst/nová, Ctrl+S · panel Zvuk: seznam skladeb, přidání wav, přehrát/pauza, posun ve skladbě · **výstup na monitor**: výběr monitoru, celá obrazovka / okno, automaticky při připojení / odpojení projektoru · oprava: posuvníky klipu se v náhledu neprojevovaly · tloušťka čar / stop / škrábanců má větší rozsah |
| v0.2 | 23. 10. 2026 | Pult podle konceptu: horní lišta, mřížka 8 vrstev × 10 sloupců s náhledy klipů, vlastnosti klipu, zvuk, prolínání Normál/Add/Screen, zámek, klávesy po řadách, písma offline |
| v0.1 | 23. 10. 2026 | Základ Etapy 0: Electron + WebGL2, pult + výstupní okno, 8 vrstev s alfou, glow, video WebM s alfou, zvuk (demo / wav / line-in), test výkonu se zprávou, `start.bat`, 8 vizuálů ze sandboxu |

## Ověřeno (automaticky, bez grafické karty)
- Shadery se přeloží, video s alfou se kreslí, test výkonu zapíše zprávu, obnova po ztrátě grafiky funguje.
- Pult: klik zapne/vypne klip, přetažení přesune, Ctrl+přetažení zkopíruje, táhlo mění výšku spodní části.
- Knihovna: import wav (kopie), .mov (převod na WebM), nový tvar .glsl; neznámý soubor odmítne s vysvětlením. Wav se přehrává.
- 9 testů logiky prošlo.
- **Neověřeno:** výkon na RTX 3060, připojení projektoru za běhu (jde jen na skutečném notebooku).

## Čeká nás
- [ ] **Krok 0:** na Legionu Git + Node.js LTS, nastavit Hybrid off / Vysoký výkon / 60 Hz, spustit `start.bat`
- [ ] **Etapa 0:** Test výkonu → Sestava brány → 1 min → poslat zprávu `zpravy\test_….txt` (brána: 60 fps, 7 vrstev + video)
- [ ] Etapa 0: další měření (všech 8, 2560×1440, náhled zap/vyp, 2–3 videa, line-in z kabelu, projektor)
- [ ] Rozhodnout jeden vs. dva procesy (podle měření)
- [ ] Etapa 1 Jádro — až po bráně
- [ ] Etapa 2 Pult (napojení posuvníků na zvuk: množství / náběh / doznění, MIDI později) · Etapa 3 Videa a spolehlivost · Etapa 4 Na akci

## Otevřená rozhodnutí
- Jeden vs. dva procesy (teď: nezávislé výstupní okno + náhled v pultu) → podle měření.
- Zpoždění zvuk→obraz: zatím jen odhad ve zprávě; skutečné změření v Etapě 1.
- Klávesy klipů: řady po vrstvách (8 = 1–0, 7 = Q–P, 6 = A–;, 5 = Z–/, 4 = ⇧1–0, 3 = ⇧Q–P, 2 = F1–F10, 1 = ⇧F1–F10) — změnit, pokud se při hraní neosvědčí.

## Poznámka
Claude zatím nevidí obsah souborů ve složce VISUALS SOFTWARE (blokuje to zářijová aktualizace Windows). Pomůže nainstalovat poslední aktualizace a restartovat. Do té doby zprávy z testů posílej do chatu.
