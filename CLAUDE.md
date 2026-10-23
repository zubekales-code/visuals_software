# Pro Clauda
- Architektura a pravidla: `ARCHITEKTURA.md`. Uživatelský návod: `README.md`.
- Uživatel je začátečník, komunikace česky a jednoduše. Strategie a etapy: skill /visuals-software, průběžný stav: `VISUALS SOFTWARE\STAV\stav.md`.
- Před commitem: `npx tsc -p tsconfig.json`, `npm test`, a když se měnil kompozitor nebo shadery: `xvfb-run -a npx electron . --smoke --no-sandbox` (po `node build.mjs`).
- Zprávy z testů na notebooku: `VISUALS SOFTWARE\zpravy\`. Knihovna uživatele: `VISUALS SOFTWARE\knihovna\`.
- `stav.md` (kořen repa) přepiš na konci každé práce: Kde jsme, tabulka verzí (nová verze nahoře), Čeká nás, Otevřená rozhodnutí. Aplikace ho při startu zkopíruje do `VISUALS SOFTWARE\STAV\`.
