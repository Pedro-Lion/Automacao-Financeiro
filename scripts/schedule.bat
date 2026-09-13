@echo off
setlocal
cd /d "%~dp0.."

set "TASK_NAME=SAPA WhatsApp Pipeline"
set "RUN_TIME=%~1"
if "%RUN_TIME%"=="" set "RUN_TIME=08:00"

schtasks /Create /TN "%TASK_NAME%" /TR "\"%CD%\scripts\run.bat\"" /SC DAILY /ST %RUN_TIME% /F
if errorlevel 1 (
  echo [SAPA] Nao foi possivel registrar a tarefa agendada.
  exit /b 1
)
echo [SAPA] Tarefa "%TASK_NAME%" registrada diariamente as %RUN_TIME%.
