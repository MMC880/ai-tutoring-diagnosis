# Windows便携EXE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留当前教师工作台的基础上交付可双击打开的Windows x64试用EXE与完整便携文件夹。

**Architecture:** pywebview／WebView2承载现有本机页面，当前Python HTTP服务在同进程的自有线程运行。资料目录独立于程序，沿用同一资料目录锁；关闭窗口确认后停止自有服务。PyInstaller携带解释器、依赖和显式静态资源。

**Tech Stack:** Python3.12、pywebview6.2.1、PyInstaller6.22.3；现有docx／PDF／Pillow依赖保持原锁定版本。

**Spec:** `docs/design/WINDOWS_TRIAL_DELIVERY_PLAN.md`；用户本轮已明确授权“封装成一个exe”。安卓应用仅记作后续方向。

## Global Constraints

- 基线`5b62ff0`，原独立工作区，新本地分支`feature/windows-desktop-package`；不合并或推送。
- 隔离构建环境位于`.tools/windows-build/venv`，优先从官方PyPI安装二进制包；不改系统Python／全局设置。唯一例外为无官方wheel的proxy_tools0.1.0：先校验官方源码SHA-256并完整阅读Python和构建配置，确认无自定义执行钩子，再在隔离环境构建本地wheel；详见交付记录。
- 便携文件夹包含EXE和依赖；资料默认保存在`%LOCALAPPDATA%/JinxueZhifu/data`，不写入程序内部或临时解包目录，不迁移旧库。
- 仅绑定127.0.0.1动态可用端口，保留原跨站／会话令牌校验；不公开到网络。
- 重复启动同一资料目录明确提示，不杀其他Python或浏览器，不自动确认／发布学生记录。
- EXE内不放真实学生资料、模型密钥、备份、开发缓存、环境文件或测试日志。
- 不新增拖拽、班级累计、会员或安卓功能；旧开发启动器保留。
- 本机打包／运行与无Python的干净目标电脑验证分开记录；没有环境时明确未验证。

## Review Focus

- 中文和空格路径、升级与不同启动目录：资料路径稳定，不跟着程序包变化。
- 已占用端口、已锁资料目录和意外启动失败：释放本程序资源，不碰其他服务。
- 关闭、取消关闭与未保存编辑：中文提示，取消后继续运行，已确认记录不被隐式修改。
- 打包资源和动态导入：界面、DOCX模板、图片和Windows渲染依赖实际可读可用。
- 干净包与合成测试：测试仅用独立临时资料目录，生产首次启动为空库。

### Task 1: 桌面启动层

**Files:** `app/desktop.py`、`app/tests/test_desktop.py`。

**Interfaces:** 复用`Store`与`server.make_server`，不改变现有业务API。窗口总是显示中文退出确认，提示未保存内容会丢失；不在关闭时自动保存或归档。

- [x] 先测试默认独立目录、资料锁、同进程服务启停、失败清理与关闭窗口配置，再实现。
- [x] 提供只读运行检查及限定全新空目录的显式合成烟测，支持冻结后的验证报告，不输出密钥。

### Task 2: 可重现构建与内容检查

**Files:** `packaging/windows/requirements-build.txt`、解析版本锁、构建脚本和spec／资源清单。

- [x] 隔离安装官方依赖（上述已审查例外），记录版本；按显式资源清单打包，排除真实数据与环境。
- [x] 生成Windows GUI便携目录、EXE、试用说明、校验清单及ZIP；不把ZIP改名为EXE。

### Task 3: 实际交付验证

- [x] 用构建产物启动原生窗口、加载真实页面，合成作业→保存／确认→档案→Word结构与打印页→重开保留记录；确认已关闭自有端口。原生Word保存对话框、系统浏览器实际打印另列未验证。
- [x] 测试重复启动锁、中文路径、缺WebView2／.NET提示、干净包内容、无系统Python路径的运行；独立干净Windows未测就明确列出。
- [x] 运行必要回归、代码审查、查看窗口／页面截图，更新核心说明与交付记录，完成本地提交。

## 选型依据

[PyInstaller官方分发说明](https://pyinstaller.org/en/stable/operating-mode.html)支持携带解释器；[pywebview官方打包指南](https://pywebview.flowrl.com/guide/freezing)推荐Windows使用PyInstaller；[微软WebView2分发说明](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)要求目标机器具备Runtime。本机发现157.0.4341.42，不推断所有教师电脑均已安装。
