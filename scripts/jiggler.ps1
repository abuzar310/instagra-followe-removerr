Add-Type -AssemblyName System.Windows.Forms
$count = 0
while ($true) {
  $p = [System.Windows.Forms.Cursor]::Position
  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($p.X + 1), $p.Y)
  $count++
  Write-Host "[$count] Jiggled at $(Get-Date -Format 'HH:mm:ss')"
  Start-Sleep -Seconds 30
}
