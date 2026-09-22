# One-click: restore the latest backup into the review database, start the
# review instance pointed at it, and open it in the default browser.
#
# Launches node.exe directly (not via the .bat file) — Start-Process with
# -WindowStyle Hidden does not reliably hide a console window when the
# target is a .bat/.cmd file, since that runs through cmd.exe, which can
# ignore the hint. A genuine Win32 process like node.exe hides reliably.

$repo = "C:\Incident Management Portal"
$logDir = "C:\ProgramData\AOCIncident"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "review-portal.log"

function Show-Message($text) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($text, "Review Instance") | Out-Null
}

Add-Content -Path $logFile -Value "`n===== $(Get-Date) - review-start-backup-and-open.ps1 ====="

# Stop any existing review instance and wait for the port to free up
$existing = Get-NetTCPConnection -LocalPort 4001 -State Listen -ErrorAction SilentlyContinue
foreach ($conn in $existing) {
    Add-Content $logFile "Stopping existing review instance process $($conn.OwningProcess)..."
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}
$waited = 0
while ((Get-NetTCPConnection -LocalPort 4001 -State Listen -ErrorAction SilentlyContinue) -and $waited -lt 15) {
    Start-Sleep -Seconds 1
    $waited++
}

# Restore the latest backup into the review database (runs synchronously,
# in this same hidden process — no extra window).
Add-Content $logFile "Restoring latest backup into the review database..."
Push-Location (Join-Path $repo "backend")
$restoreOutput = & "C:\Program Files\nodejs\node.exe" "scripts\restore-backup-to-review-db.js" 2>&1
$restoreExit = $LASTEXITCODE
$restoreOutput | ForEach-Object { Add-Content $logFile $_ }
if ($restoreExit -ne 0) {
    Add-Content $logFile "ERROR: Restore failed. Not starting the review instance."
    Pop-Location
    Show-Message "Restoring the latest backup into the review database failed. Check $logFile for details."
    exit 1
}

# Start the review instance, fully detached and hidden, pointed at the
# restored copy.
$env:PORT = "4001"
$env:UI_PORT = "5501"
$env:DB_NAME = "incident_management_db_review"
$env:CORS_ORIGIN = "https://aocincident.mse.corp:8443"
Add-Content $logFile "Starting review instance (backup mode)..."
Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "server.js" `
    -WorkingDirectory (Join-Path $repo "backend") -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "review-portal-out.log") `
    -RedirectStandardError (Join-Path $logDir "review-portal-err.log")
Pop-Location

# Wait for it to come up, then open the browser.
$deadline = (Get-Date).AddSeconds(150)
$up = $false
while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:4001/api/health" -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) { $up = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}

if ($up) {
    Start-Process "https://aocincident.mse.corp:8443/"
} else {
    Show-Message "The review instance didn't come up within 150 seconds. Check $logDir\review-portal-out.log and review-portal-err.log"
}
