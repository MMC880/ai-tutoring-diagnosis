$ErrorActionPreference = 'Stop'
$v2Root = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $v2Root
$taskTemp = Join-Path $projectRoot '.cache\v2-temp'
New-Item -ItemType Directory -Force -Path $taskTemp | Out-Null
$env:TEMP = $taskTemp
$env:TMP = $taskTemp
$env:npm_config_cache = Join-Path $projectRoot '.cache\npm-v2'
$env:electron_config_cache = Join-Path $projectRoot '.cache\electron-v2'
$env:ELECTRON_GET_USE_PROXY = '1'
Push-Location $v2Root
try {
    python -c "import sys; assert sys.version_info[:2] == (3,12), 'Python3.12 required'"
    if ($LASTEXITCODE -ne 0) { throw '请使用已有Python3.12，无需升级全局版本' }
    if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw '创建独立虚拟环境失败' }
    }
    & .\.venv\Scripts\python.exe -X utf8 -m pip install --cache-dir (Join-Path $projectRoot '.cache\pip-v2') -r backend/requirements-lock.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python依赖安装失败' }
    npm.cmd ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Node依赖安装失败；检查Node版本与网络' }
    node node_modules/electron/install.js
    if ($LASTEXITCODE -ne 0) { throw 'Electron官方运行时下载失败' }
    & .\.venv\Scripts\python.exe -X utf8 -m pip check
    if ($LASTEXITCODE -ne 0) { throw 'Python依赖校验失败' }
} finally { Pop-Location }
