@echo off
rem Instala a Calculadora de Bitrate: basta dar dois cliques neste arquivo.
rem Chama o instalar.ps1 liberando a execucao so para este processo (nao altera o Windows).
chcp 65001 >nul
echo.
echo   Instalando a Calculadora de Bitrate...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
if errorlevel 1 (
  echo.
  echo   Algo deu errado. Leia a mensagem acima ou veja a secao "Problemas comuns" no README.
)
echo.
pause
