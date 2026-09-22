@echo off
setlocal enabledelayedexpansion

REM ============================================
REM  backup-db-to-git.bat
REM  Runs the existing mysql_backup.bat to dump
REM  the database, then commits and pushes the
REM  new dump to the git repo's main branch.
REM  Schedule via Windows Task Scheduler to run
REM  once every 2 days.
REM ============================================

set REPO_DIR=C:\Incident Management Portal
set BACKUP_DIR=%REPO_DIR%\MySQL Database Backup
set LOG_FILE=%BACKUP_DIR%\backup.log

cd /d "%REPO_DIR%"

echo ===== %date% %time% ===== >> "%LOG_FILE%"
echo Running database dump... >> "%LOG_FILE%"
call "%REPO_DIR%\scripts\mysql_backup.bat"

echo Staging backup files for git... >> "%LOG_FILE%"
git add "MySQL Database Backup" >> "%LOG_FILE%" 2>&1

git diff --cached --quiet
if %ERRORLEVEL% EQU 0 (
    echo No new backup changes to commit. >> "%LOG_FILE%"
    goto :end
)

git commit -m "Automated database backup" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: git commit failed. >> "%LOG_FILE%"
    goto :end
)

echo Pushing to origin main... >> "%LOG_FILE%"
git push origin main >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: git push failed. Backup was committed locally but not pushed. >> "%LOG_FILE%"
    goto :end
)

echo Backup committed and pushed successfully. >> "%LOG_FILE%"

:end
echo. >> "%LOG_FILE%"
endlocal
