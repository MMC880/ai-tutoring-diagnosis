# 当前实际缺口与官方上游渐进复用研究

研究时间：2026-11-13，Asia/Shanghai。代码检查基线：`f9fd466`；开始时工作区干净。

本轮只读项目源码、依赖记录、公开官方文档与有关源码；只新增本报告。不安装、不升级依赖、不运行 Skills CLI、不修改业务代码、不打包、不提交，不读取密文配置、密钥或学生资料，不调用真实 AI。上游网页、Git refs、npm 元数据读取不等于运行集成通过。所有下述最小验证均为**后续建议，尚未执行**。

## 1. 结论与建议顺序

目前已经有可工作的聊天界面、受限工具循环、学生/学科隔离、归档事务、原件哈希和来源回执，不需要另装一个完整 Agent 平台才能继续开发。更合适的顺序是：

1. **先用已安装的 assistant-ui 补工具过程与回执展示。** 复用 backend tool renderer 和 tool-call message parts，先展示真实已执行结果，再考虑 SSE 实时事件。保留后端现有权限与业务工具。
2. **再补明确范围的本地聊天保存。** 第一阶段保留 LocalRuntime，通过 `ThreadHistoryAdapter` 接入现有 FastAPI/SQLite；只有后端真正管理消息、运行状态和重连时，才评估 ExternalStoreRuntime。
3. **取消、会话保存、运行恢复分别验收。** 前端停止等待不代表后端已停止，更不撤销已经落盘的工具结果。先定义运行 ID、取消检查点、持久回执和重复请求行为；需要成熟运行循环时，再隔离比较 Python OpenAI Agents SDK。
4. **把 SQLite 记录、原件与 Markdown 的角色写清。** 原件按哈希保存；结构化事实与修订以数据库为准；MD 明确是不可变历史快照或可重建导出。用同一事务记录导出任务和修订，再幂等发布文件，不宣称跨 SQLite/文件的原子提交。
5. **继续验证真实教学能力。** UI、SDK、Agent Skills 都不能代替“模型确实读图、引用正确、两次作业推理可信、老师能核对”的验收。401 则留在供应商认证/请求层排查。

## 2. 本地实现核对：上游究竟补哪里

来源均为本轮实际读取的源码，未打开业务数据。

| 实际实现 | 已有部分 | 当前仍需补齐的连接 |
| --- | --- | --- |
| `v2/src/main.tsx:81` 的 `ChatModelAdapter.run`、`:120` 的 `useLocalRuntime` | 已将 `abortSignal` 传给 `/api/chat`；聊天、附件及切换学生/学科时重置已接入 | 最终只返回 `content: [{type:'text', text:data.text}]`。后端 `tool_events` 没有变成 tool-call parts；回执另用普通段落显示；无 history adapter；刷新/关闭丢弃未保存会话 |
| `v2/backend/provider.py:155` 的 `_request` | `httpx`、HTTPS、响应大小与时间限制、状态码处理、无自动重发 | `client.stream` 是分块收完整 JSON，并非已实现 SSE token streaming；没有 `stream:true` 或增量事件解析 |
| `v2/backend/provider.py:223` 的 `chat` | 最多 4 次模型请求、单轮最多 4 个工具调用；Pydantic 参数校验；请求内重复保存复用回执；读档/原图/保存分别受控 | messages、工具运行和回执主要在请求内存；没有持久运行检查点；`events` 仅保留 name/status，未返回稳定 tool_call_id、参数、读取来源与时间线，无法直接还原完整 Tool UI |
| 同一 `chat` 与 `_save_note` | 保存后回读、SHA-256、部分失败时返回已保存回执；AI_PENDING_REVIEW 与正式记录区分 | 当前没有贯通前后端的运行取消协议；UUID 笔记和请求内去重不构成跨请求幂等。SDK 会话表也不会自动覆盖这些业务语义 |
| `v2/backend/agent_history.py` | 检查学生/学科/作业范围；分页文字搜索；记录读取时间、revision、证据哈希；MD 追加软件生成 provenance | `search_student_history` 会先取 workspace，再对 JSON 做文字匹配；它不是语义检索。`result_sha256` 是返回快照的校验，不等于教师事实或 OCR 正确性认证 |
| `v2/backend/intake.py` | `BEGIN IMMEDIATE`；原件临时文件、fsync、发布、回读；flows.request_id 唯一；归档回执、来源、题号进入 SQLite | 原件、MD 和数据库无跨系统事务；先发布 MD 后提交 SQL 的窗口可能留下孤立文件。内存锁也不是所有进程的统一文件锁 |
| `v2/backend/learning.py:103`、`:119` | 事务内修订事件、`expected_revision` 乐观并发检查、正式记录/候选区分 | 初始归档 MD 与后续有效修订需要明确展示语义；不能把早期 receipt.sha256 自动解释为当前学习档案的版本 |

`v2/DEPENDENCIES.md` 已明确记录 assistant-ui/Agent Skills 来源，应延续这些记录。`AGENT_HISTORY_LIVE_TEST_REPORT.md` 是 11 月 12 日历史报告，其“当时无活动配置/真实验证未执行”不能当作 11 月 13 日配置或网络的实时结论。本轮没有重测供应商，也没有据此新增 PASS/FAIL。

## 3. assistant-ui：直接复用现有安装

### 3.1 版本与许可边界

- 本地包：`@assistant-ui/react@0.15.33`、`@assistant-ui/core@0.3.33`，读取 node_modules/package.json 确认；许可 **MIT**。
- 官方两个版本 tag 均指向 `eb65bd4558b769550093003c95e5867ad0ec8eba`，由 `git ls-remote` 只读确认：[版本源码](https://github.com/assistant-ui/assistant-ui/tree/eb65bd4558b769550093003c95e5867ad0ec8eba)、[MIT](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/LICENSE)。[npm 正式版本元数据](https://registry.npmjs.org/@assistant-ui%2freact/0.15.33)与锁定包版本一致。
- 研究时上游 HEAD 是 `d51a70914521bbe9647c6feded2902d12cf09f63`，react 包主线元数据为 `0.15.36`。这是主线快照，**不是本项目已安装版本，也不是建议升级**。
- 官网为滚动文档；涉及实际 API 时已和本地 0.15.33/core 0.3.33 源码对照。

### 3.2 工具 UI：先复用“后端执行、前端渲染”

官方 [Tool UI](https://www.assistant-ui.com/docs/tools/tool-ui)、[迁移说明](https://www.assistant-ui.com/docs/migrations/toolkit-tools)支持 render-only backend toolkit entry：`defineToolkit({read_assignment:{type:'backend', render: ...}})`，通过 `Tools({toolkit})`/`AuiConfig` 注册。只渲染已有后端工具不需要 AI SDK、浏览器工具执行器或 generative compiler。已安装包确实导出这些接口；固定版 [toolbox.ts](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/packages/core/src/react/model-context/toolbox.ts)、[define-toolkit.ts](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/packages/core/src/react/model-context/define-toolkit.ts)、[Provider.config](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/packages/core/src/react/AssistantRuntimeProvider.tsx)与本地源码一致。

消息须带 `type:'tool-call'`、稳定 `toolCallId`、`toolName`、`args`、`argsText`，完成后附真实 `result`/`isError`；见[锁定版消息模型](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/packages/core/src/types/message.ts)。**注册渲染器不会让后端的 name/status 日志自动变成可显示的 tool-call。** 本项目仍需很薄的事件 DTO：在权限允许的摘要范围内，携带实际调用 ID、脱敏参数、状态、来源 ID/哈希和回执；不要把完整学生资料、图片 base64、密钥塞进 UI parts。

本地已有 `makeAssistantToolUI`，但[锁定版源码](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/packages/core/src/react/model-context/makeAssistantToolUI.ts)已标 `@deprecated`，建议 toolkit render 或 `MessagePrimitive.Parts` 单条消息覆盖。不能因为旧示例常见就把它作为新增首选。

**最小验证建议：** 用现有模拟 transport 返回一次查历史、一次被拒绝读图、一次保存回执，确认三种真实结果分别显示；失败不显示“已读/已存”；同调用 ID 更新不重复卡片；不改变正式记录或权限。先做最终完整响应内的工具卡，再选择是否做实时 SSE。

**不能解决：** 工具是否执行、读取授权、写入事务、跨请求幂等、供应商 401、模型图片理解或教学质量。renderer 是显示层，不应注册一个浏览器 executor 再把同一后端工具执行第二次。

### 3.3 History / persistence：LocalRuntime 仍能用

官方 [history/persistence 接口](https://www.assistant-ui.com/docs/api-reference/adapters/persistence)、[LocalRuntime](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime)、[自建持久化示例](https://www.assistant-ui.com/docs/integrations/persistence/custom-adapter)说明：

- `ThreadHistoryAdapter.load/append` 负责加载/写入消息仓库；本地[锁定接口](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/packages/core/src/adapters/thread-history.ts)还有 `scopeId`、可选 `update/delete/resume`。
- scopeId 应在切换会话/资料范围时改变。当前按学生/学科隔离的做法可保留，再追加明确 thread_id；自由会话也要有独立 scope，不能把“未选学生”共用为一个保存范围。
- 保存应保留 message id、parentId/分支关系、状态、工具结果和必要格式版本。`update` 按 message id 幂等 upsert，`delete` 对已不存在消息也应成功。避免只存拼接文本，导致工具依据和分支丢失。
- `RemoteThreadListAdapter` 是后续多会话元数据 CRUD；不是第一阶段单会话重开回读的前置。`withFormat` 在 AI SDK/useChatRuntime 场景需要；当前 LocalRuntime 没有为此安装 AI SDK 的理由。
- 官方例子用了 Next.js、Drizzle/PostgreSQL、auth；应复用接口和稳定 ID/归属检查，存储落到现有 FastAPI/SQLite。无需照搬其服务器或注册 Assistant Cloud。

**最小验证建议：** 合成 A/数学会话重开仍显示相同消息 ID、工具回执和状态；切 B 或英语不混入 A；迟到加载结果不覆盖新范围；持久化失败明确提示；会话恢复时读档/原图/保存授权仍默认关闭。**界面显示旧消息不等于允许再次外发旧历史。** 现有 blockedHistory 与本次外发范围过滤应保留或等价实现。

**不能解决：** 中断时仍在服务器执行的运行、自动停止上游、长期任务恢复、业务记录与 MD 一致性。聊天保存也不等于恢复 Agent 的执行位置。

### 3.4 ExternalStore：在消息真源改变时用

官方 [ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)及[锁定版 adapter](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/packages/core/src/runtimes/external-store/external-store-adapter.ts)支持传入 `messages/isRunning/convertMessage/onNew`，按提供 `onCancel/onReload/onAddToolResult` 等能力启用 UI。

适用条件是后端或现有状态库已经持有完整消息/运行生命周期，需要主窗口、独立 Agent、刷新后都观察同一运行。此时它能避免在 LocalRuntime 与后端维护两个消息真源。**目前后端只是单次请求返回结果，直接切 ExternalStore 会新增状态管理工作，不能自动获得持久化。** 两者选一承担消息主状态，不叠装第二套聊天状态。

最小验证需覆盖同一后端快照在两个窗口显示一致、stable id 不重复、取消状态同步、旧窗口迟到结果不污染新 scope；本轮仅核对适用性，未实现。

### 3.5 真流式与取消：贯通协议后再宣称支持

官方 LocalRuntime 支持 `async *run` 逐次 yield **累计状态**；[锁定版 ChatModelAdapter](https://github.com/assistant-ui/assistant-ui/blob/eb65bd4558b769550093003c95e5867ad0ec8eba/packages/core/src/runtime/utils/chat-model-adapter.ts)即允许 `Promise` 或 `AsyncGenerator`。可复用 `ComposerPrimitive.Cancel`/runtime.cancelRun 与 abortSignal；前端主请求已经传 signal，但后续 agent-notes 回读还没有复用该 signal。

当前 Python 同步请求及四轮循环没有请求取消标记；FastAPI 连接断开不会自动中断一段任意同步工具逻辑。因此“前端已停”“服务端已停止发新请求/新工具”“供应商已停止生成/计费”必须分别报告。

最小实现应在现有边界补 run_id、服务端取消请求/断连检测、每轮模型调用和每个工具前的取消检查、取消后仍可查询的回执，异步 transport 则正确关闭正在读取的上游流。部分 JSON 工具参数在解析完整且校验通过前不得执行。副作用已提交就返回真实回执，不把取消解释为回滚。供应商远程是否真的停止需要后续明确授权下的实际验证。

## 4. 后端成熟 SDK / Agent Runtime 的最小比较

以下版本均来自对应固定提交的元数据，属于 **2026-11-13 主线快照**，没有安装；不等同 PyPI/npm 最新发布版本。若后续实施，应另固定正式发布版本并检查与本地锁文件兼容性。

| 候选及来源/许可 | 对自定义 OpenAI-compatible 端点与工具循环的支持 | 状态/恢复与取消 | 本项目适用判断 |
| --- | --- | --- | --- |
| **OpenAI Python SDK**，主线 `3.50.0` @ `59738a289ee82c7b86bf1e10230cceb6daa9716d`；[README](https://github.com/openai/openai-python/blob/59738a289ee82c7b86bf1e10230cceb6daa9716d/README.md)、[元数据](https://github.com/openai/openai-python/blob/59738a289ee82c7b86bf1e10230cceb6daa9716d/pyproject.toml)，Apache-2.0 | `OpenAI/AsyncOpenAI(base_url=..., api_key=...)`、Chat Completions、SSE、类型化错误与[工具解析 helpers](https://github.com/openai/openai-python/blob/59738a289ee82c7b86bf1e10230cceb6daa9716d/helpers.md)可复用。普通 Chat Completions 调用/parse 不是自动执行本项目函数的持久 Agent loop | 连接/流关闭及任务取消可参与服务端取消；普通聊天请求本身不提供业务检查点。SDK 新的 Responses/hosted Agents 接口不能假设被目标 `/chat/completions` 兼容端点支持 | 若主要缺口是 SSE 解析与错误类型，可只替换 `_request` 的 transport，保留现有循环和工具；不是零依赖。该快照依赖 `httpx2`、Pydantic、anyio、jiter 等，不能说“已装 httpx 所以没有新增依赖” |
| **OpenAI Agents SDK Python**，主线 `0.24.0` @ `64fbde5d02b42ae5f9db668eb0184cdb3fc9d775`；[源码](https://github.com/openai/openai-agents-python/tree/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775)、[依赖](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/pyproject.toml)，MIT | [官方自定义端点示例](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/examples/model_providers/custom_example_agent.py)使用 `AsyncOpenAI(base_url=...)` + `OpenAIChatCompletionsModel`；Runner 负责模型/工具循环、参数模型、事件及显式 `max_turns`。不要沿用默认 Responses 路径来猜兼容性 | [SQLiteSession](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/sessions/index.md)保存对话；[RunState/HITL](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/human_in_the_loop.md)序列化暂停状态并恢复；流式 result.cancel 支持 immediate/after_turn | 当前若确定要减少自写循环，这是优先做隔离验证的候选，因为现有服务为 Python。仅包住现有受限函数，不迁移学生档案。该版本还引入 openai、MCP、griffelib、websockets 等依赖及下限，不应立即替换锁文件 |
| **Vercel AI SDK**，主线 `ai@7.0.171` @ `146396263d283bd978c08864a3f8122def076e06`；[包元数据](https://github.com/vercel/ai/blob/146396263d283bd978c08864a3f8122def076e06/packages/ai/package.json)，Apache-2.0 | [OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)、[ToolLoopAgent](https://ai-sdk.dev/docs/agents/building-agents)与[loop control](https://ai-sdk.dev/docs/agents/loop-control)覆盖统一模型、工具与流协议。滚动文档/固定源码已使用 `isStepCount`；不能从旧文章复制 `stepCountIs` | [消息持久化](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)提供接口与示例，应用仍须实现 store；[停止流](https://ai-sdk.dev/docs/advanced/stopping-streams)要求信号经服务器传给模型调用；文档明确 stop 与 `resume:true` 存在互斥限制 | 适合后端明确转 TypeScript 或独立 TS agent 服务的阶段；现有 Python 服务为了接 UI 就另添 Node agent 层会增加协议/部署与数据边界，当前不推荐。无需 Vercel 托管/Gateway 才能使用，但字符串模型捷径可能走 Gateway，应显式 provider |
| **LangGraph Python**，主线 `1.2.21` @ `3183e90eca59850a607d8a4c1b24fa8c5c8a2b69`；[元数据](https://github.com/langchain-ai/langgraph/blob/3183e90eca59850a607d8a4c1b24fa8c5c8a2b69/libs/langgraph/pyproject.toml)，MIT | 状态图与工具节点成熟；模型接入另需 ChatOpenAI/langchain-openai 或自定义适配。[官方 ChatOpenAI](https://docs.langchain.com/oss/python/integrations/chat/openai)支持 base_url，但端点特有字段/usage 能力仍需验证 | [checkpointer](https://docs.langchain.com/oss/python/langgraph/checkpointers)、[interrupt](https://docs.langchain.com/oss/python/langgraph/interrupts)支持 thread checkpoint、失败恢复、人工中断。恢复会重跑被中断节点，副作用必须幂等 | 适合已确认跨步骤长任务、人工审核后续跑、重启恢复、多分支图的需求。当前 4 轮受限聊天不足以证明需引入图调度；先保留为设计参考，不安装 LangChain、LangSmith 或 Agent Server |

### 4.1 必须保留的本项目语义

- **没有自动重试/切模型：** 当前超时/429 后不自动重发。OpenAI Python README 明确默认重试 2 次，迁移时应显式 `max_retries=0` 并验证，不把旧行为悄悄改掉。AI SDK/其他运行时也要显式核验重试策略与预算。
- **权限每次重建：** 不把 skill 指令或 SDK 工具列表视为授权。继续由服务端验证学生、学科、作业、历史、原图和保存开关；恢复旧 RunState 不能重新获得已经撤销的权限。
- **顺序与上限：** 当前工具顺序执行、最多 4 次模型请求。Agents SDK 默认可能并发执行多个函数；应显式限制函数并发为 1，并保留单轮调用数/总预算。`max_turns` 的计数不能直接等同所有工具总数。
- **Tracing：** OpenAI Agents 自定义 provider 示例禁用 tracing；本地学生应用也不能因接入 SDK 就默认向第三方导出模型输入/工具结果。可复用本地脱敏运行日志，外部 tracing 另按产品数据范围决定。
- **准确取消：** [Agents SDK cancel 源码](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/src/agents/result.py)说明 `after_turn` 会允许当前模型响应和待执行工具完成，取消后仍须消费事件做清理；不能把该模式显示为“立即停止且没有写入”。任何模式都不自动回滚已提交副作用。
- **恢复含义：** SQLiteSession 是对话记忆；RunState 是支持的暂停/恢复状态；LangGraph checkpoint 是图执行状态；它们都不自动把 SQLite、外部 MD 和供应商用量合成一次 exactly-once 事务。

建议先用现有 httpx MockTransport/合成工具，在隔离目录对比“普通回答、工具后回答、参数拒绝、达到四轮上限、保存后模型失败、取消、重开后去重”这些相同行为。兼容性不明的 JSON schema、图像、tool_call_id、流片段先作为失败保留。通过后才讨论是否替换生产循环；本轮没有安装或运行 SDK。

### 4.2 401 与这些框架无关

官方 [OpenAI API error codes](https://developers.openai.com/api/docs/guides/error-codes/)把 401 归到认证、密钥、权限/组织/IP 等问题；这是 OpenAI 的分类，不是其他供应商故障原因的证明。本项目兼容端点若实际返回 401，应保留目标地址/模型/状态码与脱敏错误，在供应商官方账户/权限说明下核验**实际发出的认证上下文**。换 assistant-ui、LangGraph、Agents SDK 或安装 Skill 不会创建有效 Key，也不会自动获得模型权限。本轮未发真实请求，不能宣布认证已恢复。

## 5. SQLite + Markdown：适用的官方实践与边界

SQLite 当前沿用 Python 内置版本；`DEPENDENCIES.md` 记录 3.49.1，本轮未启动运行时复测该版本。[SQLite 许可说明](https://www.sqlite.org/copyright.html)：核心代码与文档为 public domain。以下官网为滚动文档；Python 引用固定为 [3.12 os 文档](https://docs.python.org/3.12/library/os.html#os.replace)，许可 PSF。

### 5.1 明确三个真源/派生角色，保留当前好基础

1. **原件：** 保留现有 `objects/<sha256>` 内容寻址和读取校验；这是字节身份，不能说明图中内容真实、学生归属正确或模型已看过。
2. **结构化事实和修订：** 保留 assignments/questions/learning_events、source/status/revision 和 expected_revision；把当前有效记录和某时刻快照分开。当前 `AgentHistory.snapshot` 已输出 correction_revision、知识点 revision/source/evidence_hash/page，可沿用作为引用依据。
3. **Markdown：** 初次归档 MD 作为不可变历史快照，界面标明该快照修订；“当前摘要”由有效记录重新生成并标生成版本。AI 待确认笔记继续和教师正式事实分开，不让自由编辑 MD 静默回写正式表。若以后确认“MD 是主记录”，才设计受控导入和冲突处理，不能双向随意覆盖。

这是针对本项目的数据角色建议，不是 SQLite 官方规定某种业务 schema。依据是 SQLite 的事务边界、现有哈希/修订实现及官方双写一致性模式。

### 5.2 不把跨文件写入说成数据库事务

SQLite [atomic commit](https://www.sqlite.org/atomiccommit.html)保障其数据库事务；[transaction](https://www.sqlite.org/lang_transaction.html)说明并发读/单写与锁语义。它不会把 Python 写的 `.md` 和原件自动纳入数据库日志。Python `os.replace` 只处理文件发布，跨文件系统可能失败；一次 rename 的可见性也不等于整个“原件+SQL+MD”断电安全。

最小渐进方案：在同一 SQLite 事务中写业务修订与一个导出任务，包含 entity_id、revision、目标相对路径、模板版本、内容哈希；提交后导出器幂等写临时 MD、flush/fsync、发布、回读，再记录完成。启动时扫描待完成导出，可重建缺失 MD；哈希或修订不符明确标“导出待恢复/有冲突”，而不是把旧文件当当前记录。该方案只有最终一致性，不能承诺零窗口。

可参考 [AWS 官方 transactional outbox 模式](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)关于双写、事务记录待发布操作、重复消费幂等的经验；本项目只借用模式，在本地 SQLite 建表即可，不引入 AWS、消息队列或分布式事务平台。AWS 页面为滚动文档，版权属于 AWS，未复制代码。

同理，跨请求笔记保存可按稳定 request_id/operation_id 与 payload_hash 建唯一约束，重复相同操作回同回执，不同内容冲突显式拒绝；这是业务层小连接代码。已存在的 flows.request_id 可参考，但 `provider._save_note` 仍需自己定义此语义；安装 SDK 不会补上。

### 5.3 FTS5 只解决本地文字索引

官方 [FTS5 external content / pitfalls](https://www.sqlite.org/fts5.html#external_content_tables)给了普通内容表配 FTS 索引、insert/update/delete triggers 的完整例子；还明确警告索引与内容表不一致会出现异常查询。未来当历史量证明内存 JSON 匹配不足时，可把**授权范围内的结构化摘要**落为可重建搜索投影，索引更新与业务事务关联。不要让 FTS 自己爬全部学生 MD，也不要先加向量库。

中文需专门验证 tokenizer。[trigram](https://www.sqlite.org/fts5.html#the_trigram_tokenizer)支持子串，但全文查询少于 3 个 Unicode 字符的子串无匹配；“几何”“顶点”等两字词不能凭默认 FTS MATCH 推断支持。unicode61 也不是中文教学语义分词。题号/日期/知识点精确过滤继续用普通 SQL，短词保留受限 LIKE 或既有匹配；先核验运行时是否编译 FTS5、查询命中/漏检与性能，再决定是否采用。FTS5 不提供 OCR、同错因识别、跨学生隔离或模型证据判真。

### 5.4 校验与备份沿用官方接口

- [Online Backup API](https://www.sqlite.org/backup.html)可生成数据库快照；不能据此声称外部原件和 MD 同时快照。应记录备份快照所引用文件的相对路径/哈希清单，并核验缺失与孤立对象，恢复后再核对。
- [PRAGMA integrity_check](https://www.sqlite.org/pragma.html#pragma_integrity_check)检查库和索引结构，不检查外部 MD 哈希，也不查外键错误；外键须另跑 `foreign_key_check`。新增外键时按[官方说明](https://www.sqlite.org/foreignkeys.html)每连接显式启用，且不在事务中途切换；开开关不等于当前 schema 已有外键。
- 只在合成隔离库做故障点验证：SQL 提交前/后、临时 MD 写完/发布后、回执返回前；重启后要能判断已提交、待导出或冲突，重复请求不重复写笔记。既有备份/恢复代码未在本轮重审，不将这份建议当作新发现的缺陷或已经完成的修复。

## 6. Agent Skills 规范的真实边界

本项目已有 `skills-ref==0.1.0`，锁定 `agentskills/agentskills@83021e2be457a9b6679148719c1f6074f0ad975e`，许可 Apache-2.0；[固定版元数据](https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/skills-ref/pyproject.toml)与 `DEPENDENCIES.md` 一致。官方 [Specification](https://agentskills.io/specification)与[客户端接入指南](https://agentskills.io/client-implementation/adding-skills-support)为滚动文档。

| 可复用的规范内容 | 在本项目中的适用方式 | 不代表什么 |
| --- | --- | --- |
| SKILL.md：name/description、YAML frontmatter、正文；可选 references/scripts/assets | 沿用 skills-ref 做格式读取/校验；学科流程可按确定版本打包、记录来源/许可与哈希 | 格式合法不等于数学准确、教学有效、通过老师验收 |
| Progressive disclosure：元数据目录→按需正文→按需资源 | 学科技能多起来时再做最小白名单目录与激活读取。当前数学请求直接注入正文可工作，但不是完整发现/激活系统 | 放一个 SKILL.md 不会自动建立模型工具循环、数据库读取、OCR 或历史恢复 |
| scripts 是可选可执行资源，具体语言/工具由 host 支持 | 只有 host 显式提供执行器并校验工具和文件范围时脚本才会运行；本项目目前禁止任意代码/路径，不需为“完整 Skill”放开终端 | 不要求提供通用 shell、任意文件读写或安装依赖 |
| `allowed-tools` 是可选、实验性字段，支持依 host 而定 | 用作说明或白名单输入之一；最终权限仍由后端检查学生/学科/请求开关 | 不构成平台授权、OS 沙箱、外部服务认证或安全证明 |

应把“教学 Skill 内容”“assistant-ui 交互组件”“Python 工具运行时”分别写入验收：内容描述希望怎么分析；UI 展示过程；运行时决定真实调用和受限操作。三层各有证据，不能因安装了 Skill 就宣布 Agent 已具备某项真实功能。

## 7. skills.sh 只读核对：与缺口相关的候选

按已安装 find-skills 的流程，先读取 [skills.sh 目录](https://skills.sh/)，再核对具体页、官方 GitHub 内容与许可；未运行 `npx skills find/add`，没有安装候选。下表 installs/stars 为 2026-11-13 页面显示的近似值，可能变化；它们是目录信号，不是兼容性或安全认证。Snyk/Socket 标签也不能代替本地源码/数据流审查。

| 候选、目录链接与热度快照 | 固定来源/许可 | 可复用部分、当前建议 | 不能解决/局限 |
| --- | --- | --- | --- |
| **assistant-ui/skills · runtime**，[目录](https://skills.sh/assistant-ui/skills/runtime)，约 6.5K installs；仓库约 29 stars | 官方网站 discovery index 指向 `assistant-ui/skills`；[固定 runtime SKILL.md](https://github.com/assistant-ui/skills/blob/b0609e66baff7e19f21053d5492464dcc22ec9c3/assistant-ui/skills/runtime/SKILL.md)，MIT | 与现有 LocalRuntime、history、external store 最直接。可按需只读其引用文档，优先使用版本一致的包源码。研究时[官方 discovery index](https://www.assistant-ui.com/.well-known/agent-skills/index.json)还给了内容摘要哈希 | 仓库低于 find-skills 的 100-star 谨慎线，虽属官方也不能宣称广泛成熟；低星限制如实保留。目录内容滚动，不等于0.15.33全部API适用；不自动持久化运行 |
| **assistant-ui/skills · tools**，[目录](https://skills.sh/assistant-ui/skills/tools)，约 6.6K installs；同仓库约 29 stars | [固定 tools SKILL.md](https://github.com/assistant-ui/skills/blob/b0609e66baff7e19f21053d5492464dcc22ec9c3/assistant-ui/skills/tools/SKILL.md)，MIT | backend render、tool-call parts、状态/HITL解释最贴合真实缺口；先复用 render-only 文档与本地 types | 同样低星。它也讲 generative compiler、MCP、WebMCP、多 Agent，不是要求本项目全部安装；不会执行 Python 工具或解决 401 |
| **anthropics/skills · webapp-testing**，[目录](https://skills.sh/anthropics/skills/webapp-testing)，约 203.9K installs；仓库约 193.7K stars | [固定源码](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/webapp-testing/SKILL.md)、[单技能 Apache-2.0](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/webapp-testing/LICENSE.txt) | 可借鉴先查看真实 DOM/截图/控制台、再执行行为断言。已有 playwright-core 与 Electron 验证，应优先沿用；后续重点验证取消、重开、scope 隔离、迟到响应和工具卡 | helper 用 Python Playwright，不等于现有 playwright-core/真实 Electron 已兼容；不为跟随该技能另装一套浏览器。其 networkidle 规则不应机械套到持续流页面，应用应等明确元素/事件 |
| **vercel-labs/agent-skills · vercel-react-best-practices**，[目录](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices)，约 895K installs；仓库约 34K stars | [固定源码](https://github.com/vercel-labs/agent-skills/blob/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices/SKILL.md)，frontmatter `version:1.0.0`、MIT | 可作为现有 React 19 界面审查参考：重复请求、effect、稳定引用、状态更新和包体积；只按实际问题选规则，不先大重构 main.tsx | Next.js/SSR/RSC 规则并非本 Electron/Vite 应用直接适用；不补 Python 工作流或认证。Skill 是指导，不是运行库 |
| **anthropics/skills · skill-creator**，[目录](https://skills.sh/anthropics/skills/skill-creator)，约 430.9K installs；仓库约 193.7K stars | [固定源码](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/skill-creator/SKILL.md)、[单技能 Apache-2.0](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/skill-creator/LICENSE.txt) | 教学 Skill 真有内容缺口时，复用有/无 Skill 对照、触发/不触发案例、错误分析与人工评分思路；现有本地 skill-creator 不足才考虑来源内容，无需重复安装 | 上游含 Claude runner/评测脚本和真实模型实验，不能直接认为 Codex/本产品兼容；本轮没有运行。流程合格不证明教学结果合格 |
| **vercel/ai · ai-sdk**，[目录](https://skills.sh/vercel/ai/ai-sdk)，约 69.9K installs；仓库约 27.9K stars | [实际路径为 skills/use-ai-sdk/SKILL.md](https://github.com/vercel/ai/blob/146396263d283bd978c08864a3f8122def076e06/skills/use-ai-sdk/SKILL.md)；[仓库 Apache-2.0](https://github.com/vercel/ai/blob/146396263d283bd978c08864a3f8122def076e06/LICENSE) | 若未来明确采用 AI SDK，再按安装版本查 bundled docs；当前作为比较资料，**不建议为了这个 Skill 安装 ai** | 文件本身有“缺包则安装”和 Gateway 引导，本轮研究约束优先，均未执行；不因候选技能指令扩大任务范围。Python 当前循环仍需适配 |

针对 SQLite 本地档案一致性，本轮没有核实到一个比 SQLite 官方事务/FTS/backup 文档更贴切、且能直接补当前缺口的高可信 Skill。目录中 PostgreSQL/Supabase/Prisma 热门技能不应因热度被安装进这个项目。

## 8. 分阶段候选，不是本轮实施承诺

| 优先级 | 最小成果 | 优先复用来源 | 验收重点 |
| --- | --- | --- | --- |
| P0 | 真实历史/读图/保存验收和认证状态分开记录 | 现有验证入口、供应商官方账户资料 | 无有效测试上下文时明确 NOT_RUN；401保留原失败，不换框架掩盖 |
| P1 | 真实后端工具回执卡 | 已安装 assistant-ui backend toolkit / message parts | READ/UNREADABLE/REJECTED/SAVED_PENDING 与实际回执一致；不重复执行 |
| P1 | 当前 scope 单会话重开回读 | LocalRuntime ThreadHistoryAdapter + 已有 SQLite | stable id、分支/状态完整；切换隔离；权限重开默认关闭；保存失败可见 |
| P1 | run_id、持久回执、服务端取消点、跨请求去重 | 现有受限业务工具 + SDK公开语义 | 停止后不新发工具/模型请求；已发生副作用可查询；不重复保存 |
| P1 | 当前记录/历史MD语义与导出恢复清单 | SQLite 事务 + 内容哈希 + outbox 模式 | 修订一致、缺文件可判断、冲突不覆盖、不伪造跨文件事务 |
| P2 | HTTP SSE解析或工具循环隔离比较 | OpenAI Python / OpenAI Agents SDK | 无自动重试、明确预算、保留权限、取消/部分失败/状态迁移验证后再替换 |
| 条件触发 | FTS5 / ExternalStore / LangGraph | 对应官方接口 | 分别由实际检索规模、消息真源变化、复杂持久工作流需求触发，不预装 |

## 9. 本轮证据与限制

- 已实际获取官方网页/Markdown/有关 raw GitHub 源码、`git ls-remote` HEAD/tag refs、npm 固定版本元数据；只读检索本地包源码，并对关键 API 交叉核对。
- GitHub REST API 在本次研究中返回 403 rate limit；随后使用 Git refs 与 raw.githubusercontent.com 固定提交读取。没有借助账户 Token。最新 release 元数据未核实，因此报告准确标“主线版本快照”。
- 部分猜测的源码路径返回 404，未用于证据；最终 URL 使用实际成功读取的路径。例如 AI SDK Skill 的真实路径是 `skills/use-ai-sdk/SKILL.md`。LangGraph 旧 durable-execution 地址当前内容已转为 persistence，恢复语义改用成功读取的 checkpointers/interrupts 页面。
- 不下载整个上游仓库、不保存缓存、不执行候选代码，不把源码存在/文档支持写成集成 PASS。
- 本报告没有重新执行业务测试、网络/401复测、真实模型读取/教学评测、重启恢复或断电实验；不会覆盖已有测试报告中的结果和材料性质。

