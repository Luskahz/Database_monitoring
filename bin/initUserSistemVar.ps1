$parentDirectory = Split-Path (Get-Location) -Parent
$nodePath = Join-Path $parentDirectory "config\node-22"

Write-Host $nodePath
Read-Host -Prompt "Pressione Enter para chamar o proximo passo"

$currentPath = [System.Environment]::GetEnvironmentVariable('Path', [System.EnvironmentVariableTarget]::User)

if ($currentPath -contains $nodePath) {
    Write-Host "O caminho para o Node.js já está configurado na variável PATH do usuário."
} else {
    # Adiciona o caminho para a variável PATH do usuário
    $newPath = $currentPath + ";" + $nodePath
    [System.Environment]::SetEnvironmentVariable('Path', $newPath, [System.EnvironmentVariableTarget]::User)

    Write-Host "Caminho para o Node.js foi adicionado à variável PATH do usuário com sucesso!"
}
