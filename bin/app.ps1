
function VerificarNode {
    try {
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::User)
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


function VerificarInstalacao {
    $nodeDir = Join-Path (Get-Location) "..\config\node-22"
    

    if (Test-Path $nodeDir) {
        Write-Host "Node.js já está instalado, não será necessário reinstalar."
        return $true
    } else {
        return $false
    }
}
function IniciarInstalacaoNode {
    Write-Host "Iniciando o processo de instalação do Node.js..."
    .\InitNode.ps1
}

function ConfigurarVariaveisDeAmbiente {
    Write-Host "Iniciando a configuração das variáveis de ambiente..."
    .\initUserSistemVar.ps1
}

function Main {

    if (VerificarInstalacao) {
        Write-Host "Node.js já está instalado. Acessando a pasta database_monitoring..."
        Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "Set-Location -Path '..\'"
    } else {
        Write-Host "Node.js ou npm não encontrados. Chamando o script InitNode.ps1 para instalação..."
        IniciarInstalacaoNode
    }

    ConfigurarVariaveisDeAmbiente

    Write-Host "Processo completo, reiniciando o app..."
}


Main

# Pausa o console para que o usuário consiga ler as mensagens
Read-Host -Prompt "Pressione Enter para fechar o console..."
