@echo off
setlocal enabledelayedexpansion

REM ============================================
REM  mysql_backup.bat
REM  Backs up a MySQL database and deletes
REM  backup files older than 2 days.
REM  Run this via Windows Task Scheduler.
REM ============================================

REM ---- CONFIGURATION: edit these values ----
set DB_USER=root
set DB_PASS=Magic@123
set DB_NAME=incident_management_db
set MYSQL_BIN=C:\Program Files\MySQL\MySQL Server 8.0\bin
set BACKUP_DIR=C:\Incident Management Portal\MySQL Database Backup
set RETENTION_DAYS=2
REM --------------------------------------------

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set LOG_FILE=%BACKUP_DIR%\backup.log

REM Build timestamp (uses PowerShell so it's independent of wmic and regional date format)
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set TIMESTAMP=%%I

set BACKUP_FILE=%BACKUP_DIR%\%DB_NAME%_%TIMESTAMP%.sql

echo ===== %date% %time% ===== >> "%LOG_FILE%"
echo Starting backup of database: %DB_NAME% >> "%LOG_FILE%"

"%MYSQL_BIN%\mysqldump.exe" -u%DB_USER% -p%DB_PASS% %DB_NAME% > "%BACKUP_FILE%"

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Backup failed for %DB_NAME% >> "%LOG_FILE%"
    exit /b 1
) else (
    echo Backup successful: %BACKUP_FILE% >> "%LOG_FILE%"
)

REM Optional: compress the backup using 7-Zip if available
where 7z >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    7z a -tzip "%BACKUP_FILE%.zip" "%BACKUP_FILE%" >nul
    del "%BACKUP_FILE%"
    echo Compressed to %BACKUP_FILE%.zip >> "%LOG_FILE%"
)

REM ---- Delete backups older than RETENTION_DAYS ----
echo Deleting backups older than %RETENTION_DAYS% days... >> "%LOG_FILE%"

forfiles /p "%BACKUP_DIR%" /m "%DB_NAME%_*.*" /d -%RETENTION_DAYS% /c "cmd /c echo Deleting @file >> "%LOG_FILE%" & del /q @path" 2>nul

echo Backup and cleanup completed. >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

endlocal