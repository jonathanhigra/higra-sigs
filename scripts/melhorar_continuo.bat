@echo off
chcp 65001 >nul 2>&1
:: ============================================================
:: HIGRA SIGS - Loop de melhoria continua com Claude Code
::
:: Este .bat e um wrapper fino que delega ao PowerShell
:: (melhorar_continuo.ps1) porque o CMD do Windows tem bugs
:: de parsing de aspas em pipes quando o executavel tem
:: espacos no caminho (caso do "C:\Program Files\nodejs\node.exe").
::
:: Uso:
::   scripts\melhorar_continuo.bat
::   scripts\melhorar_continuo.bat 20           (max 20 sessoes)
::   scripts\melhorar_continuo.bat 20 5         (max 20, pausa 5s)
::
:: Tarefas: edite BACKLOG.md
:: Log: scripts\log_melhoria.txt
:: Para parar: Ctrl+C
:: ============================================================

cd /d C:\Users\user\Projetos\higra-sigs

set MAX_SESSOES=%~1
set PAUSA=%~2
if "%MAX_SESSOES%"=="" set MAX_SESSOES=0
if "%PAUSA%"=="" set PAUSA=10

%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\melhorar_continuo.ps1 -MaxSessoes %MAX_SESSOES% -Pausa %PAUSA%
