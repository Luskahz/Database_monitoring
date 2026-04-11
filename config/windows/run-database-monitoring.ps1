param(
    [string]$AppRoot = "",
    [string]$NodeExe = "",
    [string]$LogPath = ""
)

if (-not $AppRoot) {
    $AppRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}

if (-not $LogPath) {
    $LogPath = Join-Path $AppRoot "logs\windows-run.log"
}

$logDir = Split-Path -Path $LogPath -Parent
if ($logDir) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

if (-not $NodeExe) {
    $nodeCommand = Get-Command node -ErrorAction Stop
    $NodeExe = $nodeCommand.Source
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -LiteralPath $LogPath -Value "[$timestamp] Iniciando database-monitoring local em $AppRoot" -Encoding UTF8

Push-Location $AppRoot
try {
    $quotedAppRoot = $AppRoot.Replace('"', '""')
    $quotedNodeExe = $NodeExe.Replace('"', '""')
    $quotedLogPath = $LogPath.Replace('"', '""')
    $cmdLine = "cd /d ""$quotedAppRoot"" && ""$quotedNodeExe"" src/server.js >> ""$quotedLogPath"" 2>&1"

    $process = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/d", "/s", "/c", $cmdLine `
        -WindowStyle Hidden `
        -PassThru

    Add-Content -LiteralPath $LogPath -Value "[$timestamp] Node PID=$($process.Id)" -Encoding UTF8
    Wait-Process -Id $process.Id
    $process.Refresh()
    exit $process.ExitCode
} finally {
    Pop-Location
}
