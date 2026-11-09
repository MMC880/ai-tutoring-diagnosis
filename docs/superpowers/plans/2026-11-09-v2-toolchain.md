# 晋学智辅2.0工具链部署与验证

执行依据：用户2026-11-09明确授权自主完成，使用现有工程，不等待重复审批。

目标：为下一阶段Agent工作台准备可重复启动、测试的本地开发工具链，不实现学生业务。

设计：在现有worktree中新增v2/，不改动app/、packaging/及原数据库。Python使用v2/.venv；前端与桌面共用v2/package-lock.json。缓存位于工程.cache，证据位于v2/.qa-temp。现有worktree已隔离，不另建项目或搬目录。

技术：Python3.12、FastAPI、Uvicorn、SQLite；React/TypeScript/Vite、Electron；assistant-ui主页面、CopilotKit独立实验页；标准SKILL.md中文教学示例。LangGraph/Taro仅研究。

- [x] 核查官方仓库/包兼容条件、记录来源和选定版本。
- [x] 安装本地Python/Node依赖并锁定；不得读取AI Key或学生资料。
- [x] 最小服务：健康检查、独立SQLite探针、中文Skill读取、本地确定性聊天、图片接收。CORS限本地开发地址。
- [x] React/assistant-ui发送接收与图片拖入预览；CopilotKit独立页面最小Agent工具交互验证，标明模拟Agent。
- [x] Electron受限窗口、开发启动器、悬浮窗口最小验证；不新增任意文件系统桥。
- [x] 实际HTTP、构建、浏览器及Electron开窗检查，保存日志/截图/结果；失败如实记录。
- [x] ENVIRONMENT.md、DEPENDENCIES.md、ENVIRONMENT_TEST_REPORT.md、ARCHITECTURE_DECISIONS.md及官方研究说明；核对旧版源码未变，本地提交，不推送；停在P1之前。

风险检查：空/无效图片、请求失败、连接取消、中文编码、端口占用、外链导航、旧版资料隔离；测试不得用真实学生档案。

Ruling：用户指定技术并授权合理默认方案，省略重复设计审批。环境探针仅测试基础能力，模拟回复不能证明真实模型或OCR有效。

执行记录：首次受限网络查询npm遇到本地代理EACCES，改用经审核网络权限；不更改代理配置。独立虚拟环境创建的ensurepip在受限临时目录失败，改用E盘TEMP并成功。官方Skill读取GBK失败，进程UTF-8模式通过；CopilotKit/AG-UI私有类型冲突改用统一导出，删除多余直接依赖；工具调用由CopilotKitCore.runAgent调度后通过。

收尾：4项后端回归、12项实际HTTP/浏览器/Electron检查、两轮启动器生命周期、TypeScript与Vite构建通过。独立审查发现图片配额未清除，先增加失败断言再修复并复验；启动器采用仅针对本次子PID的树清理，两轮端口释放通过。CopilotKit selfManagedAgents生产授权提示、构建体积、httpx弃用提示如实记入报告；不把开发验证说成商用或业务完成。记录入口：v2/ENVIRONMENT_TEST_REPORT.md。
