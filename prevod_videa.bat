@echo off
rem ============================================================
rem  Prevod videa pro VJ software: pretahni video(a) mysi na tento soubor.
rem  Vysledek: content\videos\<nazev>.webm (VP9, zachova pruhlednost).
rem  Bez pruhlednosti pridej na konec prikazu --bez-alfy (vznikne .mp4).
rem ============================================================
chcp 65001 >nul
if "%~1"=="" (echo Pretahni video na tento soubor. & pause & exit /b 1)
cd /d "%~dp0"
if exist "app\package.json" cd app
node tools\prevod-videa.mjs %*
pause
