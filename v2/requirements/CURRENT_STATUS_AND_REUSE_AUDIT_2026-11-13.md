# 晋学智辅当前进度、卡点与复用建议

复查日期：2026-11-13，Asia/Shanghai。工程：`E:\GPT\jinxue-student-first`；分支：`tooling/v2-environment`；代码基线：`f9fd466`。开始时工作区干净。

**当前是“本地档案与受限 Agent 已接通的开发原型”，还没有完成真实模型连续读取两次作业、分析关联并保存结果的验收。** 档案、原件、MD、界面和密钥保存已有成果；下一阶段的重点是让 Agent 的执行过程可见、会话可恢复、失败可追查，沿用现有业务工具。

本轮只检查源码、历史证据及官方上游资料，并在隔离测试目录运行已有后端回归。没有安装/升级、修改业务代码、打包、调用真实模型或打开学生原始资料；没有重新启动界面做体验验收。公开项目的文档/源码支持与本产品实际集成通过分别记录。

## 1. 目前已经做到哪里

| 能力 | 当前实际状态 | 依据与限制 |
| --- | --- | --- |
| Windows 主窗口和独立 Agent | 已实现 | Electron；AI 设置按按钮打开；首页四学科、学生名单直接点选。历史 EXE/UI 验证见 `docs/ux/UX_HOME_STUDENTS_2026-11-11.md`；本轮未重新运行窗口 |
| 作业归档 | 已实现 | 接收多图/PDF，解析教师指令、核对归属、保留原件及哈希，SQLite 索引、MD 回执、重复提示；OCR 不完整不阻止保存 |
| 错题、知识点、个人/班级统计 | 已实现基础能力 | 教师明确结果与候选区分，修订保留；统计以有效确认记录为依据。部分操作仍需老师手工填写 |
| Agent 读取当前学生历史 | 已实现受限工具；模拟模型端到端通过 | 查摘要、读指定作业/题号、按需读图片；学生/学科和读取开关受后端检查。两次合成作业的 Electron 测试 7/7 通过，不是自主真实模型验收 |
| AI 待确认笔记与 MD | 已实现保存/回读 | 实际文件、哈希、读取来源回执；不直接写教师正式事实。不能据此称完整会话/执行状态已经长期保存 |
| API 配置安全保存 | 已实现，本机进程重开通过 | Windows 当前用户 DPAPI；启动不自动调用，Key 不回显。最新真实连接仍 401；没有测 Windows 系统重启或另一台电脑 |
| 三级训练和复测 | 有有限演示 | 内置仅二次函数顶点式自编样例；其他内容仍手工 JSON，没有“Agent 从薄弱点自动生成全科训练”的完整连接 |
| 教学 Skills | 仅一个规范样例 | `math-error-review/SKILL.md` 明确尚未教学验收；其他三科没有专用教学 Skill，不能把四个按钮当成四科能力完成 |

**开源项目确实用了，但接入深度不同：** assistant-ui 是实际聊天/附件界面；Electron 是实际桌面外壳；Agent Skills 的参考包用于格式校验。CopilotKit 只是独立实验，未进入交付前端；LangGraph、Taro 没有安装。现在的模型/工具循环由 `backend/provider.py` 少量自写代码承担，不是已经内置了一套完整 WorkBuddy。

依赖版本以锁文件为准：assistant-ui `0.15.33`、Electron `45.2.3`、React `19.3.1`、FastAPI `0.162.2`，详见 `v2/DEPENDENCIES.md`。本轮没有升级。

## 2. 最关键的卡点：真实模型尚未通过

最新授权服务地址为 `https://discovery-api.intern-ai.org.cn/v1`，模型 `deepseek-v4.1-flash-1017`，使用 `POST /chat/completions` 和 Bearer 认证。2026-11-12 的三次真实请求均返回 **HTTP 401**：首次连接、EXE 重开后的主动连接、历史分析首轮请求。

- 历史分析未获得模型回答，因此没有自主工具调用、图片读取或新待确认 MD。正式记录与合成源样例均未改动。
- 用户提供的凭据按原样保存，末尾竖线没有擅自删改。401 不能单独证明是哪一字符、过期、账号还是模型权限问题。
- 2026-11-10 曾通过基础文字、合成数字图片和工具保存；后续出现 429。那轮成功证明部分兼容性，不能替代这次两次作业历史分析验收。
- 本轮没有再次使用凭据或发送材料。先在供应商认可的认证上下文下通过无学生资料探针，再跑同一合成两作业案例；不能靠换框架“修好”认证。

实际证据（相对 `v2/`）：

- `.qa-temp/history-live/20261112T125758935007Z/result.json`：`LIVE_FAILED`、外部请求 1、401、无新增文件、正式/源记录未变。
- `.qa-temp/provider-restart/1794487986697/result.json`：两项配置恢复 PASS；主动真实探针 FAIL 401。
- `.qa-temp/agent-history/1794473690001/result.json`：7 项本地/模拟模型测试 PASS。
- 过程和三次请求分项见 `requirements/SECURE_CONFIG_DELIVERY.md`；此前成功及 429 见 `requirements/REAL_PROVIDER_TEST_REPORT.md`。

## 3. 哪些缺口可复用现成经验补齐

以下是建议，**不是已经实施或全部获准的新功能清单**。

| 优先级 / 类型 | 代码里确认的现状 | 最小调整与可复用来源 | 验收应该看到什么 |
| --- | --- | --- | --- |
| P0 / 外部阻塞 | 最新真实请求 401，历史链未运行 | 沿用现有真实测试入口，核对供应商认证/模型权限，不安装组件 | 真实模型自己选择历史/题目/图片工具；引用对应来源；保存待确认 MD 并回读。未调用、失败、推断错误分别记录 |
| P1 / 操作可见性 | `src/main.tsx:81–120` 最终只返回文字；后端 `tool_events` 未进入聊天消息 | 已安装 assistant-ui 的 backend Tool UI、`defineToolkit`/`Tools`/message parts；只补必要事件字段，不再执行一遍工具 | 老师看到“读取哪次作业、是否看图、保存到哪里”；拒绝/不可读不能显示成功 |
| P1 / 功能缺失 | `useLocalRuntime` 没有 history adapter；聊天重开丢失，保存的 MD 仍在 | 复用 LocalRuntime `ThreadHistoryAdapter`，存储接现有 FastAPI/SQLite；不照搬云服务/PostgreSQL | 重开同学生同学科可恢复消息与回执；切学生/学科不混档；恢复对话不自动恢复外发权限 |
| P1 / 可靠性边界 | 前端有 abortSignal，后端同步四轮循环没有取消检查；请求内去重不等于跨请求去重 | 借鉴成熟运行时的 run_id、取消点、持久回执、幂等约定；现有归档 `request_id` 可复用 | 能分清停止等待/后端停止/已保存；返回丢失后重试不重复存笔记。暂不承诺供应商已停止计费 |
| P1 / 材料读取缺口 | PDF 能保存/数页；`read_assignment_image` 对 PDF 返回 UNREADABLE；原图主要靠下载查看 | 复用成熟 PDF 按页渲染方案，先验证 `pypdfium2` 的 `PdfDocument→page.render→to_pil`；接现有授权/哈希与图像分析副本 | 只读被授权的指定页，有页码证据；损坏/加密失败明确，不整份默认外发；不自研 PDF 引擎 |
| P1 / 记录语义与恢复 | 初次归档 MD 是历史快照；后续更正靠 SQLite 有效投影；待确认笔记主要是独立 MD | SQLite 事务、官方 outbox 模式：库内记导出任务，幂等生成/核对 MD；明确“历史快照”与“当前摘要” | 改判后不会把旧 MD 当最新事实；失败重开可判断待导出/冲突；AI 笔记不静默覆盖教师记录 |
| P1 / 已知负载缺口 | JPEG 分析副本受 2MB 限制，但 `provider.py:47–69` 再编码 PNG 后没有最终体积上限 | 沿用 Pillow，按最终外发编码计量/限额；无需找新 OCR 平台 | 高噪声照片不会因 PNG 膨胀超预算；原件保留、失败原因清楚 |
| P2 / 操作流程 | 主窗口聊天附件限 2MB/3 图；Agent 归档是 15MB/12 文件；已打开 Agent 再点主窗口只聚焦、不换上下文 | 先沿用既有 UX 问题记录，后续批准后统一材料入口和明确上下文，不新做界面平台 | 同份资料不被要求反复上传；老师能看清当前学生/学科/作业；不静默切换正进行的任务 |
| 后续 / 教学内容 | 一个数学 Skill 样例，检索为文字匹配；尚无通用薄弱点→训练生成连接 | Agent Skills 官方规范及教学评测流程；先固定一个真实教学案例验证，不先装四科大库/向量库 | 区分同知识点与同错因；单错不认定长期薄弱；内容和工具执行分别验收 |

检索当前是对当前学生/学科的结构化 JSON 作文字匹配，每页 10 份、可翻页；不是语义搜索。没有命中不等于学生从没错过。现有笔记列表只回读最近 20 份，没有供模型搜索任意历史 MD 的通用工具。

“SQLite + MD + Agent”不用推倒：SQLite 管索引、事实、修订和状态；原件保留字节证据；MD 保存可读历史快照/待确认分析/明确版本的导出；Agent 通过受限工具读写。这里缺的是连接与版本约定，不是删除数据库或让模型任意改文件。

## 4. 具体复用选择

1. **直接沿用：assistant-ui 现有版本。** 官方 [Tool UI](https://www.assistant-ui.com/docs/tools/tool-ui)、[History adapter](https://www.assistant-ui.com/docs/api-reference/adapters/persistence)与[锁定版本源码](https://github.com/assistant-ui/assistant-ui/tree/eb65bd4558b769550093003c95e5867ad0ec8eba)已对照本地公开接口，MIT。当前无需为了展示工具/存会话再装 AI SDK、CopilotKit 或 Assistant Cloud。
2. **按需比较：Python OpenAI Agents SDK。** [OpenAI Docs 的 Agents 说明](https://developers.openai.com/api/docs/guides/agents)与[官方兼容端点示例](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/examples/model_providers/custom_example_agent.py)和会话/恢复语义可借鉴。先在隔离测试比较现有工具、失败、取消、预算，再决定是否替换自写循环；不立即接入正式项目。研究快照不是已安装/选定发行版。须保留无自动重试、工具权限与本地资料边界。
3. **按需验证：pypdfium2。** 本轮只读核对[固定提交 README](https://github.com/pypdfium2-team/pypdfium2/blob/51594be04b65d8da28f9f6c70f764614fc38e942/README.md)的实际渲染 API 与许可；未安装运行。库为 Apache-2.0/BSD-3-Clause，文档示例 CC-BY-4.0；分发 PDFium 二进制需带相关许可。选定发行版、资源限制及 Windows 兼容性后才能称可用；渲染不等于手写识别准确。
4. **借模式、不装平台：SQLite 与文件导出一致性。** [SQLite 原子提交](https://www.sqlite.org/atomiccommit.html)、[事务](https://www.sqlite.org/lang_transaction.html)和 [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)可指导最小实现；无需 AWS、消息队列或迁移数据库。跨 SQLite/MD 的写入不能宣称一次原子事务。
5. **Skills 按缺口取用。** 官方 assistant-ui 的 runtime/tools Skills 最贴近下两步，可先读其资料，不急于安装；React/Web 测试技能借鉴现有测试，无需再下载浏览器。LangGraph、Taro、整套 Open WebUI 当前均无安装理由。

详细版本、固定提交、许可、兼容性局限、6 类 Skill 候选与来源核对见 [上游复用研究](UPSTREAM_REUSE_RESEARCH_2026-11-13.md)。该研究查询 GitHub API 遇到限流后使用公开 Git refs/raw 源码；部分官网滚动文档不代表本地版本自动支持。没有执行候选代码或把文档存在标成集成通过。

## 5. 本轮实际验证与建议下一顺序

本轮新跑的命令（在 `v2/`）：

```powershell
.\.venv\Scripts\python.exe -X utf8 -B -m unittest discover -s backend -p 'test_*.py'
```

结果：**74/74 PASS，22.379 秒**。日志：`v2/.qa-temp/audit-20261113-backend.log`。使用隔离/合成测试；已保留 Starlette/httpx 弃用警告，没有因此升级。这个结果证明现有受测后端行为未回归，不证明真实模型、真实手写识别、教师易用性或学习效果。

建议按以下顺序推进，等用户确认具体修复批次后执行：

1. **先补真实模型历史链验收。** 认证是外部前提；未解决时如实保留阻塞，不重复消耗同一失败凭据。
2. **补 Agent 可见执行与本地会话恢复。** 优先复用已装 assistant-ui，少量连接到既有后端；不扩大训练范围。
3. **补执行可靠性与 MD 版本一致性。** 先验证 run_id/取消/重复保存、当前摘要与历史快照，再决定是否需要成熟 SDK 替换循环。PDF 按页读取在需要 PDF 分析的案例中单独验证。
4. **同一学生两次作业的可核对闭环通过后，再确认正式入档和训练阶段。** 到教师试用节点统一封装；日常运行开发版，不随每条命令发布新 EXE。

本轮的结论是优先补齐 Agent 调用现有功能的过程和可靠性，复用已有接口。没有新增开发承诺，也没有要求再交一批学生资料来开始架构重写。
