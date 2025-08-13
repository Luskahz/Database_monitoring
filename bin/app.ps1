# app.ps1
# Requisitos: PowerShell 5+ (Expand-Archive) ou 7+
# Executar com: powershell -ExecutionPolicy Bypass -File .\app.ps1
function Open-InteractiveShell {
    # Abre uma nova janela do PowerShell já posicionada no diretório do projeto
    $quotedProjectRoot = $ProjectRoot.Path.Replace("'", "''")
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location -LiteralPath '$quotedProjectRoot';" +
        "Write-Host 'Ambiente pronto. Use: npm run dev' -ForegroundColor Green"
    ) `
        -WorkingDirectory $ProjectRoot
}
# --- Configs ---
$ErrorActionPreference = 'Stop'

# Raiz do projeto = pasta "acima" do diretório deste script
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ConfigDir = Join-Path $ProjectRoot "config"
$NodeHome = Join-Path $ConfigDir  "node-22"                      # destino final do Node portátil
$NodeZip = Join-Path $ConfigDir  "node-v22.18.0-win-x64.zip"    # ajuste se trocar versão
$ExtractDir = $ConfigDir                                            # onde será extraído
$ExtractName = "node-v22.18.0-win-x64"                               # pasta criada pelo ZIP
$ExtractFull = Join-Path $ExtractDir $ExtractName

function Test-NodeAvailable {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    return [bool]$cmd
}

function Test-PortableNode {
    return (Test-Path (Join-Path $NodeHome "node.exe"))
}

function Ensure-PathContains([string]$binPath, [switch]$SessionOnly) {
    if (-not (Test-Path $binPath)) { return }

    # Normaliza duplicados no PATH do Usuário
    $currentUserPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    if ([string]::IsNullOrWhiteSpace($currentUserPath)) { $currentUserPath = "" }
    $parts = $currentUserPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries)
    $already = $parts | Where-Object { $_.TrimEnd('\') -ieq $binPath.TrimEnd('\') }

    if (-not $already) {
        $newUserPath = if ($currentUserPath) { "$binPath;$currentUserPath" } else { $binPath }
        [System.Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
        Write-Host "» Adicionado ao PATH do usuário: $binPath"
    }
    else {
        Write-Host "» PATH do usuário já contém: $binPath"
    }

    # Garante na sessão atual (imediato)
    if ($SessionOnly -or $true) {
        if (-not ($env:Path.Split(';') | Where-Object { $_.TrimEnd('\') -ieq $binPath.TrimEnd('\') })) {
            $env:Path = "$binPath;$env:Path"
            Write-Host "» PATH da sessão atualizado."
        }
    }
}

function Install-PortableNode {
    if (Test-PortableNode) {
        Write-Host "Node portátil já presente em '$NodeHome'."
        return
    }
    if (-not (Test-Path $NodeZip)) {
        throw "Arquivo ZIP do Node não encontrado em '$NodeZip'."
    }

    if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir | Out-Null }
    if (-not (Test-Path $NodeHome)) { New-Item -ItemType Directory -Path $NodeHome  | Out-Null }

    Write-Host "Extraindo '$NodeZip' para '$ExtractDir'..."
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

    # Limpa a pasta de extração vazia (opcional)
    if (Test-Path $ExtractFull) {
        try { Remove-Item $ExtractFull -Recurse -Force } catch {}
    }

    if (-not (Test-PortableNode)) {
        throw "Falha: node.exe não foi encontrado em '$NodeHome' após a instalação."
    }

    Write-Host "Node portátil instalado com sucesso em: $NodeHome"
}

function Main {
    Write-Host "== Verificando Node =="
    $hasSystemNode = Test-NodeAvailable
    $hasPortableNode = Test-PortableNode

    if ($hasPortableNode) {
        Write-Host "Node portátil detectado. Vou priorizá-lo."
        Ensure-PathContains -binPath $NodeHome
    }
    elseif ($hasSystemNode) {
        Write-Host "Node do sistema detectado. Não vou instalar o portátil."
    }
    else {
        Write-Host "Nenhum Node detectado. Instalando versão portátil do projeto..."
        Install-PortableNode
        Ensure-PathContains -binPath $NodeHome
    }

    # Valida que node está operacional
    try {
        $nodeV = & node -v
        $npmV = & npm -v
        Write-Host "Node: $nodeV | npm: $npmV"
    }
    catch {
        throw "Node/npm ainda não disponíveis no PATH da sessão."
    }

    Write-Host "`n== Concluído =="
    Write-Host "Dica: novas janelas do PowerShell/Explorer receberão o PATH atualizado automaticamente."
    Set-Location $ProjectRoot

    # Abre um shell interativo no diretório do projeto
    Open-InteractiveShell
}

try {
    Main
}
catch {
    Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Read-Host -Prompt "Pressione Enter para fechar..."

