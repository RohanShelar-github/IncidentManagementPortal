@echo off
setlocal

REM ============================================
REM  start-review-instance.bat  [live|backup]
REM
REM  Starts a second, independent instance of the
REM  app on its own ports (API 4001, UI 5501),
REM  reachable at https://aocincident.mse.corp:8443/
REM  via the "AOC Incident Review" IIS site.
REM
REM  live    -> points at the real production database.
REM             Full read/write, same as the main site.
REM  backup  -> restores the latest backup into a
REM             separate "_review" database first, then
REM             points at that restored copy.
REM
REM  Re-running this (in either mode) restarts the
REM  instance, which is how you switch between the two.
REM
REM  Every step below (stop, restore, start) is logged to
REM  review-portal.log, so a failure at any stage is visible
REM  there even when launched invisibly via Start-Process.
REM ============================================

set MODE=%1
if "%MODE%"=="" set MODE=backup

set REPO_DIR=C:\Incident Management Portal
set LOG_DIR=C:\ProgramData\AOCIncident
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set LOG_FILE=%LOG_DIR%\review-portal.log

call :main >> "%LOG_FILE%" 2>&1
exit /b %ERRORLEVEL%

:main
echo.
echo ===== %date% %time% — start-review-instance.bat %MODE% =====

call "%REPO_DIR%\scripts\stop-review-instance.bat"

if /I "%MODE%"=="backup" (
    echo Restoring latest backup into the review database...
    cd /d "%REPO_DIR%\backend"
    node scripts\restore-backup-to-review-db.js
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Restore into the review database failed. Not starting the review instance.
        exit /b 1
    )
    set REVIEW_TARGET_DB=incident_management_db_review
) else if /I "%MODE%"=="live" (
    set REVIEW_TARGET_DB=incident_management_db
) else (
    echo Usage: start-review-instance.bat [live^|backup]
    exit /b 1
)

echo Starting review instance in "%MODE%" mode, pointed at database "%REVIEW_TARGET_DB%"...
echo Review instance will be reachable at https://aocincident.mse.corp:8443/
cd /d "%REPO_DIR%\backend"
set PORT=4001
set UI_PORT=5501
set DB_NAME=%REVIEW_TARGET_DB%
set CORS_ORIGIN=https://aocincident.mse.corp:8443
REM Intentionally not backgrounded here (matches start-aoc-portal.cmd) — the
REM caller detaches this, e.g. Start-Process -WindowStyle Hidden or Task Scheduler.
"C:\Program Files\nodejs\node.exe" server.js
