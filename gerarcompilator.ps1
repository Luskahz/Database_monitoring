$outputPath = "output.txt"


if (Test-Path $outputPath) {
    Remove-Item $outputPath
}


$extensoesIgnoradas = @(".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp")
$arquivosIgnorados = @("package-lock.json")


Get-ChildItem -Recurse -File | Where-Object {
    $_.FullName -notmatch "\\node_modules\\" -and
    $extensoesIgnoradas -notcontains $_.Extension.ToLower() -and
    $arquivosIgnorados -notcontains $_.Name
} | ForEach-Object {
    # Adiciona linha separadora
    "----------------------------" | Out-File -FilePath $outputPath -Append

    # Adiciona o nome do arquivo e o caminho completo
    "$($_.Name) --> $($_.FullName)" | Out-File -FilePath $outputPath -Append

    # Adiciona o conteúdo do arquivo
    Get-Content $_.FullName | Out-File -FilePath $outputPath -Append

    # Linha em branco para separar os arquivos
    "" | Out-File -FilePath $outputPath -Append
}

Write-Host "Compilado gerado com sucesso em 'output.txt'!" -ForegroundColor Green