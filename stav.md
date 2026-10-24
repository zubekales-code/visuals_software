# Stav — VJ software
Aktualizováno: 24. 10. 2026, 12:20 · aktuální verze **v0.4**

Tento soubor je v repu (`stav.md`) a při každém spuštění aplikace se zkopíruje do `VISUALS SOFTWARE\STAV\stav.md`.
Claude ho přepisuje na konci každé práce. Starší podoby jsou v historii GitHubu.

## Kde jsme
**Etapa 0 (test výkonu)** je postavená. Na přání uživatele přibyly do pultu sloupce, přejmenování, sjednocené posuvníky,
GLOW a STROBO na klip, zvuk tohoto PC a experimentální 3D scény (Three.js).
Pořád se čeká na první měření na Legionu (brána Etapy 0) — teď nově i s 3D scénami.

## Verze
| Verze | Datum | Co přibylo |
|---|---|---|
| **v0.4** | 24. 10. 2026 | **Sloupce:** hlavička nad mřížkou, klik = hraje jen tento sloupec (znovu = zastavit vše), dvojklik = přejmenovat · **přejmenování** vrstev, sloupců a klipů (dvojklik), ukládá se do sady · **název klipu nad klipem**, větší; klik na název = jen vlastnosti (klip hraje dál); trojúhelník ▶ v rohu pryč · **sjednocené kategorie** u všech vizuálů: TVRDOST, OSCILACE, MNOŽSTVÍ, TLOUŠŤKA (chování tvarů beze změny, jen jednotné názvy) · **GLOW na klip** · **STROBO** po snímcích (Pravidelně / Na úder, bez pojistky) · **Zvuk PC** = co hraje zvuková karta (Windows loopback, bez kabelu) · **3D scény** (Three.js, knihovna\3d, záložka 3D): Pole sloupců, Mrak bodů, Drátěná tělesa, Červi + **3D KAMERA** (rotace kamery, výška, vzdálenost, zorné pole, rotace objektu, úder kamery) |
| v0.3 | 24. 10. 2026 | Klik na klip = zapnout / druhý klik vypnout · přetahování klipů (Ctrl = kopie) · táhla pro velikost částí pultu · knihovna `VISUALS SOFTWARE\knihovna` (tvary, videa, zvuk, sady) · sady uložit/načíst/nová · panel Zvuk se seznamem skladeb · výstup na monitor (projektor automaticky) |
| v0.2 | 23. 10. 2026 | Pult podle konceptu: horní lišta, mřížka 8 vrstev × 10 sloupců s náhledy klipů, vlastnosti klipu, zvuk, prolínání Normál/Add/Screen, zámek, klávesy po řadách, písma offline |
| v0.1 | 23. 10. 2026 | Základ Etapy 0: Electron + WebGL2, pult + výstupní okno, 8 vrstev s alfou, glow, video WebM s alfou, zvuk (demo / wav / line-in), test výkonu se zprávou, `start.bat`, 8 vizuálů ze sandboxu |

## Ověřeno (automaticky v cloudu, bez grafické karty)
- 13 testů logiky prošlo: sloupce (hraje jen označený sloupec), STROBO (1 snímek svítí / 1 tma; na úder), hlavičky 3D scén, všechny 4 scény 180 snímků bez chyby.
- Pult (Electron): klik na název klipu nezastaví klip, přejmenování vrstvy / sloupce / klipu funguje, hlavička sloupce spustí jen svůj sloupec, panel ukazuje sjednocené kategorie + 3D KAMERA.
- Výstup: všechny 4 3D scény se vykreslí s průhledností přes sebe, GLOW na klip a STROBO běží, 0 chyb shaderů. Náhledy 3D scén v knihovně i v mřížce.
- Zvuk PC: zachycení se spustí (na Linuxu správně ohlásí, že zvuk posílá jen Windows).
- **Neověřeno:** Zvuk PC na Windows (jestli chytá zvuk a jak velké má zpoždění) · výkon 3D scén a GLOW na víc vrstvách na RTX 3060 · projektor za běhu.

## Čeká nás
- [ ] **Krok 0:** na Legionu Git + Node.js LTS, nastavit Hybrid off / Vysoký výkon / 60 Hz, spustit `start.bat` (stáhne v0.4)
- [ ] Vyzkoušet: **Zvuk PC** (pusť hudbu v PC → ukazatele pásem se musí hýbat), sloupce, přejmenování, STROBO, 3D scény
- [ ] **Etapa 0:** Test výkonu → Sestava brány → 1 min → zpráva `zpravy\test_….txt` (brána: 60 fps, 7 vrstev + video)
- [ ] Etapa 0: další měření — mimo jiné **sloupec 3 (4× 3D scéna)** a GLOW na několika klipech zároveň
- [ ] Rozhodnout jeden vs. dva procesy (podle měření)
- [ ] Etapa 1 Jádro — až po bráně
- [ ] Etapa 2 Pult (napojení posuvníků na zvuk: množství / náběh / doznění, MIDI později) · Etapa 3 Videa a spolehlivost · Etapa 4 Na akci

## Otevřená rozhodnutí
- Jeden vs. dva procesy (teď: nezávislé výstupní okno + náhled v pultu) → podle měření.
- Zpoždění zvuk→obraz (kabel i Zvuk PC): zatím jen odhad; skutečné změření v Etapě 1.
- Kolik 3D vrstev najednou utáhne Legion → podle měření (odhad 2–3 těžké).
- Klávesy klipů: řady po vrstvách (8 = 1–0, 7 = Q–P, 6 = A–;, 5 = Z–/, 4 = ⇧1–0, 3 = ⇧Q–P, 2 = F1–F10, 1 = ⇧F1–F10). Sloupce zatím jen myší.

## Později (nápady mimo etapu)
MIDI + learn · klávesy pro spuštění sloupce · další 3D scény (cel shading, roj, hologram…) · HAP video · banky · cue list · víc modulátorů · efekty · Ableton Link / OSC · pojistka výkonu.

## Poznámka
Claude teď vidí složku VISUALS SOFTWARE přes desktopovou aplikaci (když je chat propojený s počítačem), takže si zprávy z testů umí přečíst sám.
