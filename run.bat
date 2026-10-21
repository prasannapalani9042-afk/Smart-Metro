@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3.10+ and try again.
  pause
  exit /b 1
)
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo Failed to install Python packages.
  pause
  exit /b 1
)
echo Stopping any old server on port 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul
python seed.py
start "MetroX Server" cmd /k "python app.py"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5000/auth.html"
endlocal
