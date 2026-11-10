# 依赖、来源和锁定版本

2026-11-09实测安装。Python位于`v2/.venv`，Node位于`v2/node_modules`；完整传递依赖见`backend/requirements-lock.txt`和`package-lock.json`。

|直接依赖|安装版本|用途|
|---|---|---|
|fastapi|0.162.2|本地HTTP环境探针|
|uvicorn|0.54.0|ASGI服务|
|python-multipart|0.0.33|图片表单接收|
|Pillow|12.3.0|实际图片解码；与旧版同版本，独立安装|
|httpx|0.28.1|后端接口测试|
|skills-ref|0.1.0|官方Agent Skills校验与读取|
|react / react-dom|19.3.1|前端运行|
|typescript|7.0.2|类型检查|
|vite|8.3.6|开发服务与构建|
|@vitejs/plugin-react|6.3.0|React构建插件|
|electron|45.2.3|桌面与独立悬浮窗口|
|@assistant-ui/react|0.15.33|首选聊天界面与附件运行时|
|@copilotkit/react-core / react-ui|1.85.0|独立Agent交互实验；本轮使用core的v2接口，UI包已安装但未单独验收完整聊天组件|
|playwright-core|1.65.0|复用现有Chrome和Electron进行自动化，不下载额外浏览器|
|@types/react / react-dom|19.3.0|React类型|
|@types/node|22.19.0|开发Node类型|

SQLite由Python自带，版本3.49.1；未另装数据库服务。`pip check`和`npm ls --depth=0`通过。

2026-11-10指定模型接入没有新增或升级依赖、没有修改锁文件。复用httpx执行真实Chat Completions请求，Pillow重建所选图片，assistant-ui展示对话，Agent执行循环与受限文件工具由现有Python工程增量实现。前述依赖表中的“环境探针”用途已扩展为本轮开发原型，实际能力和限制见[接入报告](requirements/REAL_PROVIDER_TEST_REPORT.md)。

## 官方来源

- [Electron仓库](https://github.com/electron/electron)与[官方安装教程](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app)：使用npm发布包和官方运行时，不克隆整套Chromium源码。运行时缓存ZIP位于E盘，官方安装器按包内checksums核验；electron.exe本机SHA256：`15e815a2d04aed1a01787354b93cd2cab425f339b3beaef4f9e4193647f5399b`。
- [assistant-ui仓库](https://github.com/assistant-ui/assistant-ui)、[LocalRuntime文档](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime)、[附件文档](https://www.assistant-ui.com/docs/guides/attachments)：本轮采用`useLocalRuntime`、`ChatModelAdapter`及`SimpleImageAttachmentAdapter`，不使用Assistant Cloud。
- [CopilotKit仓库](https://github.com/CopilotKit/CopilotKit)：使用npm正式发布包，接口以安装版本`.d.cts`和源码核对；采用`CopilotKitProvider`、`useFrontendTool`、`useCopilotKit().copilotkit.runAgent`。直接调用`agent.runAgent`只处理AG-UI流，不经过CopilotKit的前端工具调度，已用失败实验确认。
- [Agent Skills仓库](https://github.com/agentskills/agentskills)：官方参考源码已取到工程`.cache/agentskills-source`，固定提交`83021e2be457a9b6679148719c1f6074f0ad975e`；仅把`skills-ref`子包安装到v2虚拟环境，不装全局Skill。生成轮子SHA256：`7cfb6d48294b012664ab28c381dc0c22fce4aeedc8ad3e949aa6dff8992d94bd`。Python锁使用固定提交的Git URL，避免依赖本机绝对路径。

npm安装时`--ignore-scripts`，Electron安装脚本经检查后单独执行；npm锁保留下载来源与integrity。未运行不必要的脚手架、云注册或API Key设置。首次npm受限代理访问失败，后续使用经审核权限访问，未修改系统代理。Electron下载中断后从同一官方来源重试成功。

## 仅研究，未安装

- [LangGraph官方元数据](https://github.com/langchain-ai/langgraph/blob/main/libs/langgraph/pyproject.toml)：查询时主线1.2.20，Python要求>=3.10，还会引入langchain-core、checkpoint、SDK、prebuilt等。现有3.12满足语言条件，但未安装这些包；简单REST/本地确定性探针无需图调度。正式复杂工作流时再固定发布版本、检查恢复/持久化及模型依赖，不复制演示密钥。
- [Taro官方仓库](https://github.com/NervJS/taro)与[CLI元数据](https://github.com/NervJS/taro/blob/main/packages/taro-cli/package.json)：查询主线CLI4.3.1，Node>=18；未来微信小程序还需对应平台插件、微信开发者工具、AppID和独立验收。本轮不安装CLI、插件或开发家长端。
- Open WebUI未安装；LangGraph与Taro的主线版本是研究快照，不是项目已安装版本。
