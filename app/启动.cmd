@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHONIOENCODING=utf-8"
set "JINXUE_RUNTIME="
set "JINXUE_PREFIX="
if defined JINXUE_PYTHON (
 call :try_python "%JINXUE_PYTHON%"
 goto :selected
)
call :try_python "%~dp0.venv\Scripts\python.exe"
if defined JINXUE_RUNTIME goto :selected
for /f "delims=" %%P in ('where python.exe 2^>nul') do if not defined JINXUE_RUNTIME call :try_python "%%P"
if defined JINXUE_RUNTIME goto :selected
for /f "delims=" %%P in ('where py.exe 2^>nul') do if not defined JINXUE_RUNTIME call :try_python "%%P" -3
if defined JINXUE_RUNTIME goto :selected
call :try_python "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
:selected
if not defined JINXUE_RUNTIME (
 echo 没有找到依赖齐全的Python 3.12+。请按README准备本目录.venv，或设置JINXUE_PYTHON为已有python.exe完整路径。未自动安装任何软件。
 set "JINXUE_EXIT=1"
 goto :done
)
"%JINXUE_RUNTIME%" %JINXUE_PREFIX% "%~dp0launcher.py" %*
set "JINXUE_EXIT=%ERRORLEVEL%"
:done
if "%~1"=="" pause
exit /b %JINXUE_EXIT%
:try_python
if not exist "%~1" exit /b 1
if /i not "%~x1"==".exe" exit /b 1
"%~1" %~2 "%~dp0launcher.py" --runtime-check >nul 2>nul
if errorlevel 1 exit /b 1
set "JINXUE_RUNTIME=%~1"
set "JINXUE_PREFIX=%~2"
exit /b 0
