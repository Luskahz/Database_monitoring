
function VerificarNode {
    try {
        $nodeVersion = & node -v
        $npmVersion = & npm -v

        if ($nodeVersion -and $npmVersion) {
            $isNodeInstaled = $true
        } else {
            $isNodeInstaled = $false
        }
    } catch {
        $isNodeInstaled = $false
    }
}

VerificarNode


if ($isNodeInstaled) {
    Write-Host "Node.js já está instalado no sistema. Não é necessário continuar o processo."
    return
}


$nodeDir = Join-Path (Get-Location) "..\config\node-22"
if (Test-Path $nodeDir) {
    Write-Host "Node.js já foi instalado anteriormente. O processo será abortado."
    return
}

Write-Host "Iniciando o processo de instalação do Node.js..."

$nodeZipPath = Join-Path (Get-Location) "..\config\node-v22.18.0-win-x64.zip"
if (-Not (Test-Path $nodeZipPath)) {
    Write-Host "Arquivo node.zip não encontrado na pasta pai. Abortando a instalação."
    return
}

$destino = Get-Location
$extractDir = Join-Path $destino "..\config"
$extractDirFinal = Join-Path $destino "..\config\node-v22.18.0-win-x64"
if (-Not (Test-Path $extractDir)) {
    New-Item -ItemType Directory -Path $extractDir
}

Write-Host "Extraindo o arquivo node.zip..."
Expand-Archive -Path $nodeZipPath -DestinationPath $extractDir -Force
Write-Host "Extração concluída com sucesso."

$nodeDir = Join-Path $destino "..\config\node-22"
if (-Not (Test-Path $nodeDir)) {
    New-Item -ItemType Directory -Path $nodeDir
}

Write-Host "Movendo os arquivos para a pasta node-22..."

$itens = @("node_modules", "node.exe", "npm.cmd", "npx.cmd")
$progress = 0
$total = $itens.Length

foreach ($item in $itens) {
    $sourcePath = Join-Path $extractDirFinal $item
    $destPath = Join-Path $nodeDir $item

    Write-Host "Movendo: $item..."

    if (Test-Path $sourcePath) {
        Move-Item -Path $sourcePath -Destination $nodeDir
        $progress++
        $percent = ($progress / $total) * 100
        Write-Host "Progresso: $percent% concluído."
    } else {
        Write-Host "Aviso: O item '$item' não foi encontrado para mover."
    }
}

Write-Host "Todos os arquivos foram movidos para a pasta node-22."
Write-Host "Instalação do Node.js concluída."
Write-Host "Chamando o próximo script initUserSistemVar.ps1..."

Read-Host -Prompt "Pressione Enter para fechar o console..."
.\initUserSistemVar.ps1
