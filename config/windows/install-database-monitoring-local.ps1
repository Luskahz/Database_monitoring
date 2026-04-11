param(
    [int]$RestartDelaySeconds = 5
)

if ($RestartDelaySeconds -lt 1) {
    Write-Error "RestartDelaySeconds precisa ser maior ou igual a 1."
    exit 1
}

$loopScript = Join-Path $PSScriptRoot "database-monitoring-loop.ps1"
$appRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "DatabaseMonitoringLocal.vbs"
$logPath = Join-Path $appRoot "logs\windows-run.log"

if (-not (Test-Path -LiteralPath $loopScript)) {
    Write-Error "Arquivo nao encontrado: $loopScript"
    exit 1
}

$escapedLoopScript = $loopScript.Replace('"', '""')
$escapedLogPath = $logPath.Replace('"', '""')
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""$escapedLoopScript"" -RestartDelaySeconds $RestartDelaySeconds -LogPath ""$escapedLogPath""", 0, False
"@

Set-Content -LiteralPath $launcherPath -Value $vbsContent -Encoding ASCII

Get-CimInstance Win32_Process |
    Where-Object { $_.Name -eq "powershell.exe" -and $_.CommandLine -like "*database-monitoring-loop.ps1*" } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
    }

Write-Host "Launcher criado em: $launcherPath"
Write-Host ""
Write-Host "Automacao instalada."
Write-Host "O database-monitoring sera iniciado no logon do Windows e monitorara o caminho definido em database-monitoring\\.env."
Write-Host "Para iniciar o monitor nesta sessao, execute o loop sem elevacao administrativa."
Write-Host "Log: $logPath"
