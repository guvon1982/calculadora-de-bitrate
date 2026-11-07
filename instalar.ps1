# Instalador da Calculadora de Bitrate.
# Copia o app para uma pasta do usuário e cria atalhos (Área de Trabalho e Menu Iniciar)
# que abrem o index.html no Microsoft Edge em "modo app" (janela própria, sem barra de endereço).
# Não precisa de administrador: tudo fica dentro da pasta do usuário.
#
# Uso normal: dois cliques no INSTALAR.bat.
# Uso avançado (ex.: testes automatizados):
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -InstallDir C:\temp\app -ShortcutDirs C:\temp\atalhos

param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\Calculadora de Bitrate'),
    [string[]]$ShortcutDirs = @(
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('Programs')
    )
)

$ErrorActionPreference = 'Stop'
$appName = 'Calculadora de Bitrate'

# 1. Localiza o Microsoft Edge (vem instalado em todo Windows 10/11)
$edgeCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $edge) {
    throw 'Microsoft Edge não foi encontrado. Instale o Edge em https://www.microsoft.com/edge e rode o instalador de novo.'
}

# 2. Copia os arquivos do app para a pasta de instalação
$sourceFiles = @('index.html', 'icone.ico') | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach ($file in $sourceFiles) {
    if (-not (Test-Path $file)) { throw "Arquivo não encontrado: $file. Extraia o ZIP inteiro antes de instalar." }
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path $sourceFiles -Destination $InstallDir -Force

$htmlPath = Join-Path $InstallDir 'index.html'
$icoPath  = Join-Path $InstallDir 'icone.ico'
$fileUrl  = ([System.Uri]$htmlPath).AbsoluteUri

# 3. Cria um atalho em cada pasta pedida
$shell = New-Object -ComObject WScript.Shell
$created = @()
foreach ($dir in $ShortcutDirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $lnkPath = Join-Path $dir "$appName.lnk"
    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath = $edge
    $lnk.Arguments = "--app=`"$fileUrl`" --window-size=520,960"
    $lnk.IconLocation = "$icoPath,0"
    $lnk.WorkingDirectory = $InstallDir
    $lnk.Description = 'Calculadora de Avg Bitrate para o HandBrake'
    $lnk.Save()
    $created += $lnkPath
}

Write-Host ''
Write-Host "Pronto! $appName instalada em:" -ForegroundColor Green
Write-Host "  $InstallDir"
Write-Host 'Atalhos criados:' -ForegroundColor Green
$created | ForEach-Object { Write-Host "  $_" }
Write-Host ''
Write-Host 'Para fixar na barra de tarefas: clique com o botão direito no atalho da Área de Trabalho'
Write-Host 'e escolha "Fixar na barra de tarefas".'
