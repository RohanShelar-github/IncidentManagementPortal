@echo off
setlocal enabledelayedexpansion
REM ============================================
REM  stop-review-instance.bat
REM  Stops the review instance (port 4001), if running,
REM  and waits until the port is actually free before
REM  returning — so a start right after this never races
REM  against the old process still releasing its socket.
REM ============================================

set FOUND=0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4001" ^| findstr "LISTENING"') do (
    set FOUND=1
    echo Stopping review instance process %%P...
    taskkill /PID %%P /F >nul 2>&1
)

if "%FOUND%"=="0" (
    echo Review instance was not running.
    exit /b 0
)

set WAITED=0
:waitloop
netstat -ano | findstr ":4001" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Review instance stopped, port 4001 is free.
    exit /b 0
)
if !WAITED! GEQ 15 (
    echo WARNING: Port 4001 is still in use 15 seconds after stopping the process.
    exit /b 1
)
timeout /t 1 /nobreak >nul
set /a WAITED+=1
goto waitloop
