# initUserSistemVar.ps1
$ErrorActionPreference = 'Stop'

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodePath = Join-Path $ProjectRoot "config\node-22"

if (-not (Test-Path $NodePath)) {
    throw "Node portátil não encontrado em '$NodePath'. Execute primeiro a instalação."
}

$currentUserPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
if ([string]::IsNullOrWhiteSpace($currentUserPath)) { $currentUserPath = "" }

$parts = $currentUserPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries)
$exists = $parts | Where-Object { $_.TrimEnd('\') -ieq $NodePath.TrimEnd('\') }

if (-not $exists) {
    $newUserPath = if ($currentUserPath) { "$NodePath;$currentUserPath" } else { $NodePath }
    [System.Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
    Write-Host "» PATH do usuário atualizado com: $NodePath"
}
else {
    Write-Host "» PATH do usuário já continha: $NodePath"
}

# Sessão atual
if (-not ($env:Path.Split(';') | Where-Object { $_.TrimEnd('\') -ieq $NodePath.TrimEnd('\') })) {
    $env:Path = "$NodePath;$env:Path"
    Write-Host "» PATH da sessão atualizado."
}

# Validação
try {
    $nodeV = & node -v
    $npmV = & npm -v
    Write-Host "Node: $nodeV | npm: $npmV"
}
catch {
    Write-Host "Aviso: abra uma nova janela do PowerShell/VSCode para herdar o novo PATH."
}
