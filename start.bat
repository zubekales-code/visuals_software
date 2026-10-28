@echo off
rem ============================================================
rem  VJ software - spusteni (stahne novou verzi, nainstaluje, spusti)
rem  Pouziti: dej tento soubor do slozky VISUALS SOFTWARE a dvakrat klikni.
rem  Prvni spusteni: stahne aplikaci do podslozky "app" (chvili trva, chce internet).
rem  Bez internetu: spusti posledni stazenou verzi (nic se nestahuje ani neinstaluje).
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
rem npm install obcas upravi package-lock.json - vratit ho, jinak by aktualizace neprosla
git checkout -- package-lock.json >nul 2>nul
echo Stahuji novou verzi...
git pull --ff-only
if errorlevel 1 goto :offline
echo Instaluji knihovny (poprve to trva i par minut)...
call npm install --no-fund --no-audit || goto :err
goto :run

:offline
rem Bez internetu (nebo GitHub neodpovida): kdyz uz je aplikace jednou nainstalovana, spustit posledni verzi.
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo [!] Novou verzi se nepodarilo stahnout a aplikace jeste neni nainstalovana.
  echo     Poprve je potreba internet. Pripoj se a spust znovu.
  goto :err
)
echo.
echo [i] Novou verzi se nepodarilo stahnout - asi neni internet.
echo     Spoustim posledni stazenou verzi. Kdyz internet mas, posli text vyse Claudovi.
echo.
timeout /t 3 /nobreak >nul

:run
echo Spoustim...
call npm start || goto :err
rem Nova verze tohoto souboru prisla s aplikaci (app\start.bat) - po zavreni aplikace ji nakopirovat sem.
rem Vse na jednom radku: cmd ho nacte cely najednou, takze prepsani bezici davky nevadi.
if /i not "%APP%"=="%~dp0" if exist "%APP%\start.bat" fc /b "%APP%\start.bat" "%~f0" >nul 2>nul || (copy /y "%APP%\start.bat" "%~f0" >nul 2>nul & exit /b 0)
exit /b 0

:err
echo.
echo [!] Neco se nepovedlo. Zkopiruj text vyse a posli ho Claudovi.
pause
exit /b 1
