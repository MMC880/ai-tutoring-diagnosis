# 晋学智辅2.0开发环境

核验日期：2026-11-09。工程根目录：`E:\GPT\jinxue-student-first`；工作分支：`tooling/v2-environment`，起点`bf023c4`。2.0部署在现有工程的`v2/`，没有另建Git仓库、搬迁目录或改写1.0业务代码。

## 入口

在PowerShell执行：

```powershell
Set-Location E:\GPT\jinxue-student-first\v2
npm.cmd start
```

启动本地FastAPI、Vite和Electron普通窗口。桌面菜单“窗口→打开独立悬浮窗口”可打开置顶窗口；退出全部窗口时启动器回收本次服务。仅运行开发服务：`node scripts/start.mjs --services-only`，Ctrl+C退出。

入口`http://127.0.0.1:5179/`，独立CopilotKit实验`/copilot.html`，后端`http://127.0.0.1:8019/health`。端口占用时明确失败，不自动接管其他进程。

2026-11-10更新：已增量加入四科学习材料存档与指定模型接入，未配置密钥时明确显示模拟；配置后可与真实模型对话并通过受限工具保存AI待确认笔记。真实合成流程曾通过一轮，但复验遇到HTTP429，尚非稳定产品；详见[接入测试报告](requirements/REAL_PROVIDER_TEST_REPORT.md)。下述版本和工具链核验为2026-11-09历史环境记录。

## 已复用的本机环境

|项目|实测版本|实际路径／范围|
|---|---|---|
|Windows|x64，10.0.26200|本机系统|
|PowerShell|7.6.9|现有终端|
|Python|3.12.10|`C:\Users\42248\AppData\Local\Programs\Python\Python312\python.exe`|
|Node.js|22.22.2|`C:\Users\42248\.workbuddy-ai\binaries\node\versions\22.22.2-6\node.exe`|
|npm|10.9.7|上述Node目录`npm.cmd`|
|Git|2.56.0.windows.4|`C:\Program Files\Git\cmd\git.exe`|
|Chrome|156.0.8078.81|`C:\Program Files\Google\Chrome\Application\chrome.exe`，仅自动化测试使用|

Node由WorkBuddy目录提供；本轮未升级或全局重装。换终端若PATH缺失，可临时把上述Node目录加到当前进程PATH。未配置全局PATH、npm配置、代理或AI Key。pnpm不使用，无需安装Rust、Go、PostgreSQL、PaddleOCR或全套编译器。

## 项目独立环境和磁盘

- Python：`v2/.venv/Scripts/python.exe`，原` .tools/windows-build/venv`未改。
- Node：`v2/node_modules`，版本由`v2/package-lock.json`锁定；Electron自带的Node为24.22.2，与开发命令使用的22.22.2不同，不是升级了全局Node。
- 缓存：工程`.cache/npm-v2`、`.cache/pip-v2`、`.cache/electron-v2`；安装及启动临时目录`.cache/v2-temp`。
- 测试数据库、截图、日志：`v2/.qa-temp`；Electron用户目录：`v2/.local-data/electron-profile`。这些路径均被既有Git忽略规则覆盖。
- 检查初始C盘约4GB、E盘约18GB；安装后一次检查约C盘3.16GB、E盘16.08GB。C盘仍紧张，未执行全盘清理。不能保证Windows和已有程序完全不产生系统缓存。

## 换机恢复

保留同样Python3.12和符合`package.json`约束的Node后，运行：

```powershell
pwsh -NoProfile -File E:\GPT\jinxue-student-first\v2\scripts\setup.ps1
```

脚本建立/复用`v2/.venv`，按Python锁和npm锁安装，禁用一般npm生命周期脚本，再单独执行Electron官方运行时安装脚本。全部缓存定向E盘，不升级全局工具。需要访问PyPI、npm和GitHub；没有重装或干净机器验收。

Python命令必须带`-X utf8`，或仅对该进程设置`PYTHONUTF8=1`。Agent Skills参考库使用默认文本编码，在本机GBK模式读取中文会失败；启动器已处理。

复验命令及实际证据见[测试报告](ENVIRONMENT_TEST_REPORT.md)。依赖见[DEPENDENCIES.md](DEPENDENCIES.md)，架构与后续边界见[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)。
