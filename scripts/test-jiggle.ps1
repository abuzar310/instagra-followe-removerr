Add-Type -AssemblyName System.Windows.Forms
$p1 = [System.Windows.Forms.Cursor]::Position
Start-Sleep -Seconds 6
$p2 = [System.Windows.Forms.Cursor]::Position
Write-Host "Before: ($($p1.X), $($p1.Y))"
Write-Host "After:  ($($p2.X), $($p2.Y))"
if ($p1.X -ne $p2.X -or $p1.Y -ne $p2.Y) {
  Write-Host "✅ Mouse is MOVING!"
} else {
  Write-Host "❌ Mouse is NOT moving"
}
