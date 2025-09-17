# scripts/dump-all.ps1
# Gera um TXT único com o conteúdo de todos os arquivos do projeto,
# exceto o que estiver dentro de node_modules.
# Saída: <raiz do projeto>\databaseMonitoring_FullDump.txt

# Caminhos
$ProjectRoot = Split-Path -Path $PSScriptRoot -Parent
$OutputPath  = Join-Path $ProjectRoot "databaseMonitoring_FullDump.txt"

# Remove saída anterior
if (Test-Path $OutputPath) { Remove-Item $OutputPath -Force }

# Writer UTF-8 (sem BOM) via stream (rápido e constante em memória)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$fs = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
$sw = New-Object System.IO.StreamWriter($fs, $utf8NoBom)

# Regex para ignorar node_modules (ancorado em separadores)
$ignorePattern = '(?i)(?:\\|/)node_modules(?:\\|/)'

try {
  # Lista todos os arquivos a partir da raiz do projeto
  $files = Get-ChildItem -Path $ProjectRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object {
      # ignora o próprio arquivo de saída e qualquer coisa dentro de node_modules
      $_.FullName -ne $OutputPath -and $_.FullName -notmatch $ignorePattern
    }

  foreach ($file in $files) {
    # Caminho relativo (para ficar legível no TXT)
    try {
      $rel = [System.IO.Path]::GetRelativePath($ProjectRoot, $file.FullName)
    } catch {
      $rel = $file.FullName.Substring($ProjectRoot.Length).TrimStart('\','/')
    }

    # Cabeçalho por arquivo
    $sw.WriteLine("===== FILE =====")
    $sw.WriteLine($rel)

    # Conteúdo
    try {
      $text = Get-Content -LiteralPath $file.FullName -Encoding UTF8 -Raw
      $sw.WriteLine($text)
    } catch {
      $sw.WriteLine("[erro lendo arquivo: $($_.Exception.Message)]")
    }

    $sw.WriteLine() # linha em branco entre arquivos
  }

  Write-Host "Dump criado: $OutputPath" -ForegroundColor Green
}
finally {
  $sw.Flush(); $sw.Close(); $fs.Dispose()
}
