# 2.0环境阶段决策

2026-11-09；用户已指定技术栈并授权合理默认目录与自主安装。本文件记录环境决策，不宣告业务PRD或Agent工作台已经完成。

1. **工程内增量隔离。** 沿用`E:\GPT\jinxue-student-first`与同一Git仓库，新增v2目录及独立虚拟环境、npm锁；不修改1.0的app/、packaging/和业务数据库。无需新项目、新worktree或整体复制代码。
2. **技术按指定方案落地。** Python3.12/FastAPI/Uvicorn承担最小HTTP探针，React/TypeScript/Vite承担开发界面，Electron承担普通与独立悬浮窗口，SQLite只测试独立合成数据库。旧Store、档案、归组和证据历史模块保留可供P1评估，本阶段不接入或迁移。
3. **assistant-ui优先。** LocalRuntime连接本地REST，负责真实聊天状态与图片附件；仅确定性中文回复。图片经本地解码核验，不做OCR，不转发外部模型，不保存成学生事实。本阶段对话仅内存状态，刷新清空。
4. **CopilotKit独立比较。** 另有copilot.html，实际FastAPI SSE AG-UI模拟Agent发工具事件，CopilotKit工具调度更新合成状态卡片，不跟assistant-ui混合运行。HttpAgent从CopilotKit同一入口导出，避免直接安装AG-UI1.0.4与CopilotKit内部1.0.2产生私有类型冲突；多余直接依赖已移除。
5. **生产授权/接入尚未决定。** 所用`selfManagedAgents`接口在开发控制台明确提示属于Enterprise Intelligence，生产使用需publicLicenseKey。此次无Key的开发实验通过不等于免费商用授权通过。P1若继续CopilotKit，须评估官方开源Runtime接入方案或明确所需授权；不能把这条实验路径直接发布给甲方。本轮没有安装生产Runtime服务或绕过授权。
6. **中文教学Skill。** 遵循[官方SKILL.md格式](https://agentskills.io/specification)，内部标识为`math-error-review`；`metadata.display-name`为“数学错题复盘”，说明、流程和界面均中文。使用官方skills-ref校验与读取；不是只靠自定义解析器假称标准兼容。官方示例读取采用默认编码，本机使用进程级UTF-8解决，不改Windows全局编码。
7. **开发窗口边界。** Electron启用sandbox、contextIsolation，关闭nodeIntegration；无任意文件/命令桥；拒绝弹出外链、外部顶层导航及非本地网络请求。只监听127.0.0.1的8019/5179。当前服务是开发探针，不能当作已完成生产鉴权和数据隔离。
8. **依赖与缓存局部化。** 复用全局Python/Node/npm/Git，不升级。依赖和缓存集中现有工程E盘；gitignore沿用既有规则。安装/运行不能读取API密钥、真实学生数据或旧SQLite。没有新增家长端、收费、Go迁移或完整Agent编排。
9. **下一阶段前提。** 本阶段通过表示工具链可用。真实模型、多轮持久化、工具人工确认卡片、教师操作与业务档案写入仍需P1设计、授权和测试；不把模拟Agent行为当成真实AI推理。LangGraph/Taro等到对应阶段再引入。
