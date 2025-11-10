param(
  [string]$File = (Join-Path $PSScriptRoot "..\logs\_queue.txt")
)

while ($true) {
  if (Test-Path $File) {
    $lastWrite = (Get-Item $File).LastWriteTime
    Clear-Host
    Get-Content $File -Encoding UTF8
    do {
      Start-Sleep -Milliseconds 500
    } while ($lastWrite -eq (Get-Item $File).LastWriteTime)
  } else {
    Clear-Host
    Write-Host "Aguardando arquivo _queue.txt ser criado em ..\logs\_queue.txt ..."
    Start-Sleep -Seconds 1
  }
}
