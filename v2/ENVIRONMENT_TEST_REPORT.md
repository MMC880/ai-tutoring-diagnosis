# 2.0环境测试报告

日期：2026-11-09。范围：同一台Windows电脑，现有工程内隔离v2环境；不读取真实学生资料、不配置密钥、不调用模型。原始运行记录位于本机`v2/.qa-temp`，测试脚本、锁文件和本报告纳入本地Git。

## 实测结果

|验收项|结果|实际证据|
|---|---|---|
|FastAPI启动及健康接口|PASS|Uvicorn真实监听127.0.0.1:8019，HTTP返回status=ok、synthetic-only|
|SQLite基本读写|PASS|真实HTTP触发独立`.qa-temp/environment.sqlite3`建表、参数化写入、回读“中文读写验证”|
|React/TypeScript运行与构建|PASS|真实Chrome加载Vite；`tsc --noEmit && vite build`退出0，dist生成双入口|
|Electron普通/悬浮窗口|PASS|实际运行官方electron.exe，两个可见Windows窗口，其中一个alwaysOnTop；实际截图已查看|
|前端调用Python|PASS|浏览器读取健康和Skill；Electron输入中文消息，通过本地HTTP收到回复|
|assistant-ui收发|PASS|通过组件输入框与发送按钮发消息，ChatModelAdapter请求FastAPI并渲染确定性模拟回复|
|图片拖入和显示|PASS（自动化）|DOM DataTransfer触发真实drop处理，文件经HTTP/Pillow解码，再进入官方附件运行时和预览；发送后image_count=1；不是仅把图片画在页面|
|中文教学Skill|PASS|官方skills-ref校验无错误，读取math-error-review的中文显示名称、说明和正文|
|CopilotKit独立实验|PASS（开发模拟）|真实HTTP SSE工具事件→CopilotKit注册handler→合成状态卡片更新，后续工具结果回到模拟Agent|
|窗口隔离|PASS|实际窗口webPreferences确认sandbox/contextIsolation=true、nodeIntegration=false；renderer没有window.require|
|启动器退出再启动|PASS|两轮启动服务和真实Electron窗口→关闭窗口→8019/5179均可重新绑定；第二轮再次启动成功|
|Python依赖一致性|PASS|`pip check`：No broken requirements found|
|后端自动化|PASS|4项：健康/SQLite/中文Skill、聊天、真假图片、Host拒绝|

最终`verification.json`共12项PASS；`lifecycle.json`另2轮PASS。四项后端测试单列，构建和pip/npm检查单列，不混成真实业务准确率。

## 复验命令

在工程`v2/`中运行（开发服务与回环访问须有本机运行权限）：

```powershell
.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_environment -v
.\.venv\Scripts\python.exe -X utf8 -m pip check
npm.cmd ls --depth=0
npm.cmd run build
node scripts/start.mjs --services-only
# 保持上行服务运行，在另一终端执行：
node scripts/verify.mjs
# 服务退出后单独执行（需两端口空闲）：
node scripts/verify-lifecycle.mjs
```

## 本机证据文件

- `.qa-temp/backend-red.log`：尚无实现时测试失败；`backend-green-elevated.log`：复现Windows中文编码错误；`backend-final.log`：UTF-8启动后4项通过。
- `.qa-temp/verify-first.log`、`copilot-failure.png`：最初CopilotKit工具调度失败；改用官方CopilotKitCore调度入口后通过。
- `.qa-temp/preview-quota-red.log`：发送后图片预览未清除的回归失败；修复订阅与配额后最终通过。
- `.qa-temp/verify-final.log`、`verification.json`：最终真实HTTP/浏览器/Electron12项记录。
- `.qa-temp/lifecycle.log`、`lifecycle.json`：两轮启动退出及端口释放。
- `.qa-temp/assistant-ui.png`、`copilotkit.png`、`electron.png`、`electron-floating.png`：实际截图，已人工查看普通窗口、CopilotKit和附件页面。
- `.qa-temp/build-final.log`、`npm-tree.txt`、`python-environment.json`：构建和环境快照；未来再次执行会覆盖对应同名最新证据。

## 未解决或未验证

- CopilotKit所用直连Agent API提示生产企业授权，开发通过不代表生产授权/Runtime方案完成，详见架构决策第5条。
- Vite构建通过但CopilotKit实验入口约2.8MB（未gzip），有分块体积警告；P1按实际功能再拆分，不关闭警告冒充优化完成。
- Starlette测试适配器对httpx有弃用警告，当前4项测试通过；以后升级测试栈需单独评估，不为消除提示随意升级。
- C盘空间仍紧张；首次受限环境不能访问本机代理/CIM，测试需在允许回环及GUI的环境运行，不能将沙箱通信失败认作应用失败。
- 未实测人手从资源管理器拖图动作、真实微信MPO卷面、OCR、真实模型、生产鉴权、档案写入、教学效果、EXE安装包或无开发环境的新电脑。
- assistant-ui的工具调用/人工确认卡片只做接入研究，尚未实现业务审批。CopilotKit测试只改合成卡片，不代表能够直接操作正式学生档案。
- 初始化依赖恢复脚本已提供；本轮没有为测试恢复脚本而删除已安装依赖再全量重装。未宣称换机复现已通过。

历史结论：指定工具链与本轮八项最小目标均完成对应本机开发验证；当时仅环境阶段完成。

2026-11-10进展：用户后续已授权第一刀和真实接口测试；以上“未验证真实模型/档案”是环境阶段快照，不能作为当前结论。最新范围与实际通过/失败证据见[真实模型接入测试报告](requirements/REAL_PROVIDER_TEST_REPORT.md)。环境健康检查的`mode`已改为当前实际`simulation`或`provider`。
