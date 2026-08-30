@echo off
setlocal
cd /d "C:\Incident Management Portal\backend"
if not exist "C:\ProgramData\AOCIncident" mkdir "C:\ProgramData\AOCIncident"
"C:\Program Files\nodejs\node.exe" server.js >> "C:\ProgramData\AOCIncident\portal.log" 2>&1
