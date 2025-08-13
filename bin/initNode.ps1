# initNode.ps1
$ErrorActionPreference = 'Stop'

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ConfigDir = Join-Path $ProjectRoot "config"
$NodeHome = Join-Path $ConfigDir  "node-22"
$NodeZip = Join-Path $ConfigDir  "node-v22.18.0-win-x64.zip"
$ExtractDir = $ConfigDir
$ExtractName = "node-v22.18.0-win-x64"
$ExtractFull = Join-Path $ExtractDir $ExtractName

function Test-PortableNode { Test-Path (Join-Path $NodeHome "node.exe") }

if (Test-PortableNode) {
    Write-Host "Node portátil já está instalado em '$NodeHome'."
    return
}

if (-not (Test-Path $NodeZip)) {
    throw "Arquivo ZIP não encontrado: $NodeZip"
}

if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir | Out-Null }
if (-not (Test-Path $NodeHome)) { New-Item -ItemType Directory -Path $NodeHome  | Out-Null }

Write-Host "Extraindo '$NodeZip'..."
Expand-Archive -Path $NodeZip -DestinationPath $ExtractDir -Force

$itemsToMove = @("node.exe", "npm.cmd", "npx.cmd", "node_modules")
foreach ($item in $itemsToMove) {
    $src = Join-Path $ExtractFull $item
    if (Test-Path $src) {
        Write-Host "Movendo: $item"
        Move-Item -Path $src -Destination $NodeHome -Force
    }
    else {
        Write-Host "Aviso: não encontrado no ZIP → $item"
    }
}

if (Test-Path $ExtractFull) {
    try { Remove-Item $ExtractFull -Recurse -Force } catch {}
}

if (-not (Test-PortableNode)) { throw "Falha na instalação: node.exe não encontrado em '$NodeHome'." }

Write-Host "Instalação concluída em: $NodeHome"
