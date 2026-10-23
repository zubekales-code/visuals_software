@echo off
rem ============================================================
rem  VJ software - spusteni (stahne novou verzi, nainstaluje, spusti)
rem  Pouziti: dej tento soubor do slozky VISUALS SOFTWARE a dvakrat klikni.
rem  Prvni spusteni: stahne aplikaci do podslozky "app" (chvili trva).
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where git >nul 2>nul || (echo [!] Chybi Git. Nainstaluj ho z https://git-scm.com/download/win a spust znovu. & pause & exit /b 1)
where node >nul 2>nul || (echo [!] Chybi Node.js. Nainstaluj verzi LTS z https://nodejs.org a spust znovu. & pause & exit /b 1)

if exist "package.json" (
  rem spusteno primo ve slozce aplikace
  set "APP=%~dp0"
  set "VJ_ZPRAVY=%~dp0zpravy"
) else (
  set "APP=%~dp0app"
  set "VJ_ZPRAVY=%~dp0zpravy"
  if not exist "app\.git" (
    echo Stahuji aplikaci z GitHubu...
    git clone https://github.com/zubekales-code/visuals_software.git app || goto :err
  )
)

cd /d "%APP%"
echo Stahuji novou verzi...
git pull --ff-only || goto :err
echo Instaluji knihovny (poprve to trva i par minut)...
call npm install --no-fund --no-audit || goto :err
echo Spoustim...
call npm start || goto :err
exit /b 0

:err
echo.
echo [!] Neco se nepovedlo. Zkopiruj text vyse a posli ho Claudovi.
pause
exit /b 1
