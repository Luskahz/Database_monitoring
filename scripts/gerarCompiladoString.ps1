# ==== Configurações ====
$outputBase = "databaseMonitoring_ResumoString.txt"   # Nome base do arquivo
$compressOutput = $true                               # true = gera .gz
$maxBytesPerFile = 200KB                              # 0 = sem limite
$collapseBlankLines = $true                           # true = compacta linhas em branco
$levelsUp = 4                                         # pastas acima no caminho truncado

# Extensões de texto/código que serão incluídas
$extWhitelist = @(
  ".js",".jsx",".ts",".tsx",".json",".ps1",".psm1",".psd1",
  ".sql",".cs",".java",".xml",".yml",".yaml",".md",
  ".html",".css",".sh",".py",".rb",".go",".php",".ini",".env",".txt",".csv"
) | ForEach-Object { $_.ToLowerInvariant() }

# Pastas ignoradas
$ignoreDirs = @(
  "\node_modules\",
  "\node-22\",
  "\node-v22.18.0-win-x64\",
  "\node-v22.18.0-win-x64.zip\",
  "\cache\",
  "\.git\",
  "\.next\",
  "\dist\",
  "\build\",
  "\.cache\",
  "\coverage\",
  "\.yarn\",
  "\out\"
)

# Arquivos ignorados
$arquivosIgnorados = @(
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "Thumbs.db"
)

# ==== Função auxiliar para truncar caminho ====
function Get-TruncatedPath {
  param([System.IO.FileInfo]$File, [int]$Levels = 4)
  $dir = $File.DirectoryName
  if (-not $dir) { return $File.Name }
  $parts = $dir -split '[\\/]'
  if ($parts.Length -gt $Levels) {
    $parts = $parts[($parts.Length - $Levels)..($parts.Length - 1)]
  }
  return ($parts -join '\') + '\' + $File.Name
}

# ==== Preparação da saída ====
if (Test-Path $outputBase) { Remove-Item $outputBase -Force }
$outputPath = if ($compressOutput) { "$outputBase.gz" } else { $outputBase }
if (Test-Path $outputPath) { Remove-Item $outputPath -Force }

# ==== Criação dos streams ====
Add-Type -AssemblyName System.IO.Compression
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$baseStream = [System.IO.File]::Open(
    $outputPath,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
)

if ($compressOutput) {
    $gzip = New-Object System.IO.Compression.GZipStream(
        $baseStream,
        [System.IO.Compression.CompressionMode]::Compress,
        $true
    )
    $sw = New-Object System.IO.StreamWriter($gzip, $utf8NoBom)
} else {
    $sw = New-Object System.IO.StreamWriter($baseStream, $utf8NoBom)
}

# ==== Processamento ====
try {
    Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            -not ($ignoreDirs | ForEach-Object { $_.FullName -like "*$_*" } | Where-Object { $_ }) -and
            ($extWhitelist -contains $_.Extension.ToLowerInvariant()) -and
            ($arquivosIgnorados -notcontains $_.Name)
        } |
        ForEach-Object {
            $file = $_
            $sw.WriteLine('----------------------------')
            $sw.WriteLine((Get-TruncatedPath -File $file -Levels $levelsUp))

            try {
                # Lê todo o arquivo como texto
                $text = Get-Content -LiteralPath $file.FullName -Encoding UTF8 -Raw

                # Truncagem por tamanho
                if ($maxBytesPerFile -gt 0) {
                    $bytes = $utf8NoBom.GetBytes($text)
                    if ($bytes.Length -gt $maxBytesPerFile) {
                        $text = $utf8NoBom.GetString($bytes, 0, $maxBytesPerFile) +
                                "`r`n[... arquivo truncado para $($maxBytesPerFile/1KB) KB ...]"
                    }
                }

                # Remove múltiplas linhas em branco
                if ($collapseBlankLines) {
                    $text = [regex]::Replace($text, "(\r?\n){3,}", "`r`n`r`n")
                }

                $sw.WriteLine($text)
            }
            catch {
                $sw.WriteLine("[erro lendo arquivo: $($_.Exception.Message)]")
            }
            $sw.WriteLine()
        }

    Write-Host "Compilado gerado com sucesso em '$outputPath'!" -ForegroundColor Green
}
finally {
    if ($sw) { $sw.Flush(); $sw.Close(); $sw.Dispose() }
    if ($gzip) { $gzip.Dispose() }
    if ($baseStream) { $baseStream.Dispose() }
}
