# One-click: stop the review instance.
$existing = Get-NetTCPConnection -LocalPort 4001 -State Listen -ErrorAction SilentlyContinue
foreach ($conn in $existing) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

Add-Type -AssemblyName System.Windows.Forms
if (Get-NetTCPConnection -LocalPort 4001 -State Listen -ErrorAction SilentlyContinue) {
    [System.Windows.Forms.MessageBox]::Show("The review instance may still be stopping. Check again in a moment.", "Review Instance") | Out-Null
} else {
    [System.Windows.Forms.MessageBox]::Show("Review instance stopped.", "Review Instance") | Out-Null
}
