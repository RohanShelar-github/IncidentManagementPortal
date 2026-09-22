@echo off
REM Deliberately a plain, visible console window — no hidden-window wrapping.
REM This is the disaster-recovery restore-to-live entry point; it requires
REM you to type RESTORE to confirm before anything happens.
cd /d "C:\Incident Management Portal\backend"
"C:\Program Files\nodejs\node.exe" scripts\restore-live-interactive.js
