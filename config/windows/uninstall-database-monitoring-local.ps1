param()

$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "DatabaseMonitoringLocal.vbs"

if (Test-Path -LiteralPath $launcherPath) {
    Remove-Item -LiteralPath $launcherPath -Force
    Write-Host "Launcher removido: $launcherPath"
} else {
    Write-Host "Launcher nao encontrado: $launcherPath"
}

Get-CimInstance Win32_Process |
    Where-Object {
        ($_.Name -eq "powershell.exe" -and $_.CommandLine -like "*database-monitoring-loop.ps1*") -or
        ($_.Name -eq "powershell.exe" -and $_.CommandLine -like "*run-database-monitoring.ps1*") -or
        ($_.Name -eq "node.exe" -and $_.CommandLine -like "*database-monitoring*src\\server.js*")
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
        Write-Host "Processo encerrado: $($_.ProcessId)"
    }

Write-Host ""
Write-Host "Automacao removida."
