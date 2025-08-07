# Verifica se o Node.js está instalado
try {
    $node_version = node -v
    $npm_version = npm -v

    # Se Node.js e npm estiverem instalados, abre o PowerShell no diretório pai
    Write-Host "Node.js e npm estão instalados!"
    Write-Host "Versão do Node.js: $node_version"
    Write-Host "Versão do npm: $npm_version"
    
    # Mudar para o diretório pai
    Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

    # Abrir o PowerShell no diretório correto
    Start-Process powershell.exe
} catch {
    # Se o Node.js não estiver instalado, chama o initNode.ps1
    Write-Host "Node.js ou npm não encontrados. Iniciando a instalação..."
    
    # Chama o script initNode.ps1 para instalar o Node.js
    & ".\initNode.ps1"
}
