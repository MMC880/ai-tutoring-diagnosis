# AI服务内打开独立Agent聊天窗口

日期：2026-11-10。工程：`E:\GPT\jinxue-student-first`。基线：`ef39514`。

## 用户要求与实际行为

在主窗口的“AI服务设置与连接测试”内点击 **打开 AI Agent**，打开独立、可移动、可调整大小并置顶的 Electron 聊天窗口。再次点击恢复并聚焦已有窗口，不另开副本，也不清空该窗口对话或悄悄切换学生和学科。菜单“窗口 → 打开 AI Agent”使用同一窗口。

聊天窗显示当前模型、文字连接状态与数学／英语／物理／化学四个按钮；对话与输入区常驻，学生档案、原件保存、摘要导入、待确认笔记及写入许可收进“学生档案”。不用再填密钥，也不复制整页设置表单。主窗口现有操作保留。

首次打开带入主窗口主动选中的学生和学科；默认不导入摘要，不授予AI保存许可。已有窗口保持自身上下文；关闭后重新打开才按主窗口当时选择初始化。初始化结束前禁止发送，避免请求跑到默认学科。

两窗共享后端进程内的供应商配置；新窗只读取不含密钥的设置摘要。配置或清除密钥后，聊天窗重新读取状态。密钥不出现在窗口URL、IPC参数或浏览器存储。固定IPC仅允许主窗口打开Agent，Agent只可读取本次学生ID与学科；验证发送窗口、主框架、本地来源及参数，不暴露文件或命令执行能力。

纯浏览器预览中按钮打开单独的本站聊天页；浏览器阻止弹窗时显示处理提示。该预览页没有Electron的置顶能力。

## 实际验证

先增加真实Electron行为回归；旧实现失败于“AI服务必须有一个打开独立Agent聊天窗口的按钮”（实际0个）。随后实现并复验。未安装依赖、未修改旧版`app/`或`packaging/`、未读取真实学生材料、未调用外部AI。

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| 新窗口端到端 | PASS，12项 | `.qa-temp/agent-window/result.json`；明确`LOCAL_MOCK_NO_PROVIDER` |
| 后端完整测试 | PASS，22项 | `.qa-temp/agent-window/backend-tests.log` |
| TypeScript／Vite构建 | PASS，退出码0 | `.qa-temp/agent-window/build.log`，保留既有大包警告 |
| 既有配置／文件／图片／工具保存与回读回归 | PASS，11项 | `.qa-temp/provider-test/mock-result.json`，本地确定性模拟 |
| 既有环境／assistant-ui／CopilotKit／Electron回归 | PASS，12项 | `.qa-temp/verification.json` |
| 启动、退出、释放端口后再次启动 | PASS，2轮 | `.qa-temp/lifecycle.json` |

新窗口测试包括：按钮可用、真实第二个Windows窗口、共用配置、带入学生／学科、独立窗口发送、没有自动导入或保存许可、多次点击不增窗、最小化恢复、上下文不被其他窗口切换、DOM拖图解码预览并发送、IPC拒绝不合格来源与参数、清钥同步、关闭重开、菜单复用、390×600紧凑布局及浏览器弹窗后备。

实际查看截图：`.qa-temp/agent-window/agent-empty.png`、`agent-chat.png`、`agent-compact.png`。截图含虚构学生和本地模拟连接状态，不是本轮真实模型连接证据。图片拖拽使用DOM DataTransfer，未验证真人资源管理器拖拽。

复验命令（需要本机回环及Electron运行权限）：

```powershell
Set-Location E:\GPT\jinxue-student-first\v2
node scripts/verify-agent-window.mjs
.\.venv\Scripts\python.exe -X utf8 -B -m unittest discover -s backend -p 'test_*.py' -v
npm.cmd run build
node scripts/verify-provider.mjs --mock
node scripts/verify-lifecycle.mjs
# 环境回归：先用 scripts/start.mjs --services-only 启动本机服务，再单独运行：
node scripts/verify.mjs
```

## 本机使用与边界

运行`npm.cmd start`，在AI服务中配置并测试，点击“打开 AI Agent”。没有配置时可打开并明确使用本地模拟。模型在主窗口设置，聊天窗显示实际已配置模型，不承诺模型下拉列表或自动切换。

对话关闭或刷新后清空；只有明确保存的原件、摘要及AI待确认笔记留在本地。图片沿用最多3张、每张2MB限制；PDF仅本地保存，未解析或交给模型。不会因为打开新窗口就自动读取整个学生档案。

本轮为开发运行版本，没有生成新EXE。没有重新验证真实模型稳定性、真实学生试卷识别、教师易用性或干净机器分发。真实接口此前的429限制仍以`REAL_PROVIDER_TEST_REPORT.md`记录为准。CopilotKit仍是独立实验，其开发警告、生产授权与大包问题未在本轮处理。
