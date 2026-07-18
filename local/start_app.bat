@echo off
setlocal

set "APP_DIR=%~dp0"
set "HOST=127.0.0.1"
set "PORT=5173"
set "URL=http://%HOST%:%PORT%/"
set "POWERSHELL_EXE=powershell"

cd /d "%APP_DIR%"

%POWERSHELL_EXE% -NoProfile -ExecutionPolicy Bypass -Command "exit 0" >nul 2>nul
if errorlevel 1 (
  if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
    set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
  ) else (
    if exist "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" (
      set "POWERSHELL_EXE=C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    ) else (
      echo PowerShell was not found.
      echo Add PowerShell to PATH. See powershell_path_setup.txt.
      pause
      exit /b 1
    )
  )
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port=%PORT%; if (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"

if errorlevel 1 (
  python --version >nul 2>nul
  if not errorlevel 1 (
    start "Mag Keyboard Config Server" /min python -m http.server %PORT% --bind %HOST%
  ) else (
    py -3 --version >nul 2>nul
    if not errorlevel 1 (
      start "Mag Keyboard Config Server" /min py -3 -m http.server %PORT% --bind %HOST%
    ) else (
      echo Python was not found.
      echo Install Python or start a static web server in this folder.
      pause
      exit /b 1
    )
  )
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url='%URL%'; for ($i=0; $i -lt 30; $i++) { try { Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 1 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 200 } }; exit 1"

if errorlevel 1 (
  echo Server did not respond: %URL%
  pause
  exit /b 1
)

start "" "%URL%"
exit /b 0
