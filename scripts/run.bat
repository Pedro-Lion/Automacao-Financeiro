@echo off
setlocal
cd /d "%~dp0.."
if not exist config.yaml (
  echo [SAPA] config.yaml nao encontrado. Execute scripts\setup.bat primeiro.
  exit /b 1
)
node src\index.js run %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [SAPA] Execucao encerrada com erro %EXIT_CODE%.
exit /b %EXIT_CODE%
