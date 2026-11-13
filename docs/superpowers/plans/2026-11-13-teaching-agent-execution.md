# 晋学智辅教学 Agent 执行升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有晋学智辅中接通一名学生两次数学作业的授权读取、真实工具回执、待确认 MD、任务重开和对话纠正，为后续山西中考数学教学闭环提供可靠执行基础。

**Architecture:** 保留现有 Electron、assistant-ui LocalRuntime、FastAPI、学生档案与业务工具。先隔离比较 Python Agents SDK 与现有循环，按证据选用一个执行器；任务、消息、回执和笔记修订沿用现有 SQLite，MD 通过可恢复导出保持版本一致。运行时不另建学生事实库，前端只呈现实际后端执行结果。

**Tech Stack:** Python 3.12、FastAPI、SQLite、React、TypeScript、Electron；现有 `@assistant-ui/react@0.15.33` 与 Agent Skills。Python Agents SDK 为待对照候选，尚未安装或决定采用。

**Spec:** [修订设计](../specs/2026-11-13-teaching-agent-design.md)，尤其第 2、7—12、15 节；[固定来源与接口研究](../../../v2/requirements/UPSTREAM_REUSE_RESEARCH_2026-11-13.md)。

状态：**计划已写成，实施未开始。** 用户本轮授权修订设计和制定计划；下表不表示已经批准一次性实施 A1—B5。执行方式为当前会话逐阶段推进，获准一个阶段后只完成该阶段，汇报并停止，不重新进行开放式访谈。

## Global Constraints

- 现有工程 `E:\GPT\jinxue-student-first` 原位增量；不迁移目录，不改旧 `app/`、`packaging/` 或 1.0 数据，不推倒重写已有业务。
- 产品是服务山西中考学生和教培老师的本地教学管理器。保留数学、英语、物理、化学四个独立入口，第一阶段只把山西中考数学教学流程做通。
- 当前 A 阶段不实施正式教师事实写入、完整参考库或三级训练；这些是 B 阶段必需主线，不是取消。已存在的知识、统计、补练和复测功能继续保留。
- 无心理档案、人格标签或心理推断；一次错误不等于长期薄弱，一次答对不等于掌握；相同知识点不等于相同错因。
- 一个教学任务固定一个学生、一门学科、一个主作业；学生内部 ID 决定归属，不能靠姓名或模型自述授权。
- “一次确认”在当前应用会话的同任务范围内复用；退出/后端重启、撤销、学生/学科/主作业或服务配置变化即失效。重开对话不自动重开外发许可。
- 先必要摘要与结构化记录，后授权原图；历史图片须逐项增补权限。不发送全部历史照片，不把材料中的文字当系统指令。
- 继续当前用户 DPAPI；Key 不回显，不入参数日志、MD、SQLite、测试源码或包；不开默认外部追踪，无自动重试、换模型、换服务。
- 单次运行最多四次实际模型请求、每轮最多四个工具、工具串行，图片总数沿用最多三张；取消不回滚已经提交的保存。
- SQLite 管任务/消息/笔记修订的唯一索引与状态；MD 是可读版本文件。SQLite/MD 不承诺跨文件原子事务；导出未完成不能显示“MD 已保存”。
- SDK 有明确收益且约束不退步才采用；无收益记 `KEEP_CURRENT`，不得为了换框架重构或升级全项目依赖。
- 所有自动测试用 E 盘隔离合成资料。最新真实认证结果为 HTTP 401；本轮不读/改/调用保存的凭据。真实模型验证须有有效、获准的配置，失败明确记录，不能模拟通过。
- 日常跑开发版；阶段试用交付或封装特有问题才构建 EXE，不随小修改封装。每阶段保留证据，只做本地 Git 提交，不配置远端或推送。

## Review Focus

1. 同名学生、切换学科、额外历史原图及服务配置变更：旧授权和旧对话不能被沿用外发。由 Task 4、5 的权限与上下文测试覆盖。
2. 工具保存完成但模型失败、断连或老师按停止：保留真实已提交回执，不自动再跑模型/再存一份。由 Task 1、2、4 覆盖。
3. SQL 已提交而 MD 写入/发布/回读失败，或主窗口和 Agent 同时纠正：显示待恢复/冲突，旧稿不变，幂等恢复。由 Task 2、3、6 覆盖。
4. PDF 不可读、图片负载过大、检索零命中、模型不调用工具：不捏造看图或历史依据，不拿替身结果补成功。由 Task 4、7 覆盖。
5. 外改 MD 放错学生/任务、旧版本以及正文含越权指令：只接候选，不监控静默回写，不提升正式事实或外发权限。由 Task 6 覆盖。

---

## 先看阶段交付表

| 阶段 | 老师/审阅者能验收什么 | 依赖、停止点 |
| --- | --- | --- |
| A1 运行时对照 | 同一教学工具案例比较现有循环与 SDK，写明用谁、收益和代价 | Task 1；没有生产替换或新 EXE，结论汇报后停止 |
| A2 任务与笔记记录 | 本地任务、消息、工具回执、版本 MD；重开/重复/导出失败/备份恢复有据可查 | Task 2—3；先完成存储能力，不宣称 Agent 已自主执行；汇报后停止 |
| A3 教学 Agent 接通 | 自然语言交代，两作业必要摘要自动准备，一次授权，实际工具卡与保存回执 | Task 4—5；本地替身与真实推理严格分开；汇报后停止 |
| A4 继续与纠正 | 重开同任务继续，纠正生成新稿，外改 MD 作为候选，正式事实不变 | Task 6；汇报后停止 |
| A5 真实模型验收 | 真实模型自主选择工具、读取本次图/历史、区分关联与错因、保存回读 MD | Task 7；401/失败即停，不用替身补通过 |
| A6 阶段试用 | 统一回归、可交付的 EXE 和最短手册，记录老师实际困惑 | Task 8；工程通过≠老师接受，结束后不自动进入 B |

B 的必需顺序与复用模块已写在设计第 15 节：**B1 教师审核→正式档案→新版 MD；B2 山西数学依据；B3 个人/班级分析；B4 三级训练；B5 复测更新。** 本文只详细规划 A；进入某个 B 阶段前，再对当时代码写该阶段任务，避免提前为全部未来功能写一套新系统。

## 文件职责与连接边界

以下是本计划新增/修改的最小职责划分，不是已存在的能力。实现时先复读现有代码及来源；若发现必须改变这些边界，先报告具体影响。

| 文件 | 职责；直接复用 |
| --- | --- |
| `v2/scripts/compare-agent-runtime.py`、`v2/backend/runtime_probe.py` | 隔离对照入口/统一案例与安全结果；以当前 `ProviderService` 作基线，不默认替换生产循环 |
| `v2/backend/agent_tasks.py` | 用 `IntakeService._connect()` 的同一个库保存任务、消息、运行和工具回执；不复制 assignments/questions/learning_events |
| `v2/backend/agent_notes.py` | 待确认笔记修订、操作去重、MD 待导出和恢复；引用现有原件/有效修订，不写教师事实 |
| `v2/backend/agent_scope.py` | 进程内任务授权、服务配置代际、按文件增补原图许可；调用现有归属检查 |
| `v2/backend/agent_execution.py` | 单进程运行协调、选定执行器适配、预算/取消、必要摘要、流程选择及工具派发；调用 `AgentHistory` 和 `AgentNotes` |
| `v2/backend/provider.py`、`agent_history.py`、`main.py` | 保留配置/transport/已有工具，增加窄接点、任务路由和授权核对；不整文件重写 |
| `v2/src/agent-adapter.ts`、`agent-task.tsx` | 复用 assistant-ui 的 History adapter、tool-call parts 与 render-only Tool UI；任务入口/权限说明/继续/回执，后端是唯一执行者 |
| `v2/src/main.tsx` | 传已有学生/学科/主作业上下文，接适配器；保留首页、学生列表、四科、独立 Agent、原归档入口 |
| `v2/skills/math-history-analysis/SKILL.md` | 一个中文显示的“作业关联历史分析”流程；按 Agent Skills 规范校验，不建 Skill 市场或管理平台 |
| `v2/backend/test_agent_*.py`、`test_runtime_probe.py`、`v2/scripts/verify-agent-*.mjs` | 共用隔离两作业夹具、权限/失败/恢复/界面验证；真实模型证据另列 |
| `v2/requirements/AGENT_A*_*.md` | 每阶段实际版本、来源/许可、变动、命令/结果、证据和下一关阻塞；不得提前填 PASS |

**既有业务模块保留：** `intake.py` 原件与归属；`learning.py`、`projection.py` 有效记录/知识点/统计；`feedback.py` 与 `LearningService.feedback/approve/practice/retest` 补练/复测；`operations.py` 一致性备份/空目录恢复。A 仅验证这些未被破坏，B 才通过它们正式入档和接回训练。

## 共用实施约定

- 下文测试/构建命令工作目录是 `E:\GPT\jinxue-student-first\v2`；`git -C ..` 的暂存路径相对仓库根目录。
- 继续用 `unittest`、现有 httpx MockTransport 与 Electron/Playwright 脚本，不安装新测试框架。
- 共用新增 `backend/agent_test_fixtures.py` 的 `make_pair(root: Path) -> PairFixture`，字段 `student_id/old_assignment_id/current_assignment_id/original_hashes`；复用 `test_agent_history.py` 的真实本地归档路径建两次合成作业，不复制正式库或依赖某次 `.qa-temp` 时间戳。
- 两题沿用：旧作业 Q3 `y=(x+2)^2-1`，原答顶点 `(2,-1)`；新作业 Q5 `y=-(x-2)^2+3`，原答 `(-2,3)`。图片为合成印刷样例，教师结果/知识关联为预置，不能算真实手写识别或从零发现知识点。
- 每阶段开始检查 Git/差异，测试保留 `.qa-temp/agent-aN/` 下安全 JSON/截图/日志；报告写实际结果。测试通过后明确列文件本地提交；只提交当时存在且相关的变更，不用 `git add .`。

## A1 / Task 1：隔离比较运行时，先决定是否值得引入

**Files:** Create `v2/backend/runtime_probe.py`、`v2/backend/agent_test_fixtures.py`、`v2/backend/test_runtime_probe.py`、`v2/scripts/compare-agent-runtime.py`、`v2/requirements/AGENT_A1_RUNTIME_COMPARISON.md`；Modify `v2/DEPENDENCIES.md`（只补比较来源，不把未采用组件列为生产依赖）。

**Interfaces:**
- Consumes：`ProviderService.chat(ChatInput) -> dict | None`、可注入 `httpx.MockTransport`、现有五个工具及 `make_pair(root) -> PairFixture`。
- Produces：`run_probe(engine: Literal['current','sdk'], case: str, root: Path) -> ProbeResult`；`ProbeResult` 包含 `engine/case/status/request_count/tool_calls/saves/stop_reason/trace_requests/limitations`，`status=PASSED|FAILED|UNSUPPORTED`，不含 Key、图片正文或完整身份。比较结论 `ADOPT_SDK | KEEP_CURRENT`，认证受阻时加 `real_provider_status='BLOCKED_AUTH'`。

- [ ] **1. 写 `RuntimeProbeTests`。** `test_same_case_preserves_tool_order_and_receipt` 断言两个执行器同序读本次/查旧题/保存待确认稿，实际本地文件可回读，正式记录/原件前后相同；`test_budget_rejection_and_no_retry` 断言请求≤4、单轮工具≤4、工具串行，401/429/超时每次只发一次，不改端点；`test_save_then_failure_keeps_receipt` 断言保存一次、后续失败不伪装普通成功；`test_no_telemetry_or_unauthorized_tool` 断言无追踪请求、越权不执行。基线不支持的取消等项标 `UNSUPPORTED`，不编造基线已具备该能力。
- [ ] **2. 跑 RED。** `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_runtime_probe -v`。预期计划中的新模块/接口缺失或行为断言失败，保留失败证据；无关环境导入错误须先解决后再测。
- [ ] **3. 核官方正式发行版与依赖/许可。** 查本地 `DEPENDENCIES.md` 及官方 release/固定源码，在 E 盘 `.cache/agents-sdk-probe/` 建独立 Python 3.12 venv；只装一个核实的正式版本，导出精确锁文件及来源到该缓存。现有 `v2/.venv` 和锁文件保持不变；依赖冲突不得靠全局升级解决。报告记录其真实版本、提交/发行来源、许可及 tracing/retry/concurrency 默认值。
- [ ] **4. 实现对照。** 基线直接使用生产 `ProviderService`；候选使用所选 SDK 官方自定义 Chat Completions 示例，显式指定本端点、关闭 tracing/retries，并以同一受限派发器包住现有业务工具。只在隔离入口运行，不接生产 `/api/chat`；不得由夹具强制工具顺序然后宣称模型自主选择。
- [ ] **5. 跑 GREEN 与独立对照。** 用候选 venv 运行 `-X utf8 -B -m unittest backend.test_runtime_probe -v`，再运行 `scripts/compare-agent-runtime.py --output .qa-temp/agent-a1`；两个入口均只用本地替身。SDK 安装/接口不兼容须由探针明确记 FAILED 或 UNSUPPORTED，探针的失败识别测试可通过，候选兼容验收不能因此标通过；安装未完成时用现有环境生成失败报告。报告逐案结果、增加依赖/连接代码成本以及具体可复现收益；不兼容或无收益即 `KEEP_CURRENT`，不以“能运行”作采用依据。现有环境另跑 `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_provider backend.test_agent_history -v` 确认未破坏原实现。
- [ ] **6. 本地提交、汇报并停止。** `git -C .. add v2/backend/runtime_probe.py v2/backend/agent_test_fixtures.py v2/backend/test_runtime_probe.py v2/scripts/compare-agent-runtime.py v2/requirements/AGENT_A1_RUNTIME_COMPARISON.md v2/DEPENDENCIES.md`；`git -C .. commit -m "test(agent): compare existing loop with isolated SDK candidate"`。不安装生产 SDK，不进入 A2。

## A2 / Task 2：任务、消息、运行和回执持久化

**Files:** Create `v2/backend/agent_tasks.py`、`v2/backend/test_agent_tasks.py`、`v2/requirements/AGENT_A2_RECORDS.md`；Modify `v2/backend/main.py`（仅本地任务读写路由）。

**Interfaces:**
- Consumes：`IntakeService` 的同库连接与锁、`LearningService.assignment(db,id,student_id,subject)`、`Operations.backup(destination)`；A1 的执行器结论只作为之后接点，不在本 Task 跑模型。
- Produces：`TaskScope(student_id: str, subject: str, assignment_id: str)`；`AgentTasks(intake, learning)` 的 `create(scope, request_id) -> TaskRecord`、`list(scope) -> list[TaskRecord]`、`append_user(task_id,message_id,parent_id,text) -> MessageRecord`、`start_run(task_id,request_id,user_message_id) -> RunRecord`、`record_tool(run_id,call_id,name,safe_args,result) -> ToolReceipt`、`finish_run(run_id,status,message) -> RunRecord`、`get(task_id) -> TaskSnapshot`、`interrupt_open_runs() -> int`。所有读写再核服务端 TaskScope。
- 固定状态：运行 `RUNNING/SUCCEEDED/FAILED/STOPPED/INTERRUPTED/EXPORT_PENDING`；笔记一直 `AI_PENDING_REVIEW`。稳定任务/消息/运行/调用 ID；JSON 消息保留 parent 关系、来源引用与文本/tool parts，不存重复图片 base64。`request_id`/`message_id` 相同且内容相同回原记录，不同则 409 冲突。

- [ ] **1. 写 RED 用例。** `test_scope_is_fixed_and_message_replay_is_idempotent` 断言同名另一学生/另一科/主作业冲突拒绝，重复消息不增行；`test_reply_and_tool_receipt_survive_reopen` 断言新实例读回相同顺序/调用 ID/结果；`test_restart_marks_running_interrupted_without_model_call` 断言启动只标中断、保留已保存回执、模型调用0；`test_schema_failure_preserves_old_archive` 断言新 schema 失败可回退且旧表/原件不变；`test_future_schema_is_rejected_without_changes` 断言未来版本库不被降级或写入。
- [ ] **2. 跑 RED。** `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_agent_tasks -v`；预期新任务服务不存在或断言失败。
- [ ] **3. 实现同库增量与路由。** 新增带 `agent_` 前缀的 tasks/messages/runs/tool_receipts/schema 表和唯一约束；不改已有题目事实。现有归档服务初始化后、首次新增 Agent 表之前，用现有 Operations 在资料目录外做独立备份；备份失败不升级。schema 事务失败回滚，更新前检查版本，遇未来版本明确拒绝。新增 `/api/agent/tasks` POST/GET、`/{task_id}` GET、`/{task_id}/messages` POST；请求带 scope，响应只读记录不自动外发。前端只可追加 user 消息，assistant/tool 由后端写，不能通过消息 API 伪造工具回执。
- [ ] **4. 跑 GREEN。** 同 RED 命令及 `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_intake backend.test_learning backend.test_operations -v`。证据核对旧原件/有效记录不变；不把任务本地保存说成模型分析成功。
- [ ] **5. 提交。** `git -C .. add v2/backend/agent_tasks.py v2/backend/test_agent_tasks.py v2/backend/main.py v2/requirements/AGENT_A2_RECORDS.md`；`git -C .. commit -m "feat(agent): persist scoped teaching tasks and execution receipts"`。同一 A2 尚需 Task 3 后才阶段交付。

## A2 / Task 3：版本笔记、MD 可恢复导出和备份

**Files:** Create `v2/backend/agent_notes.py`、`v2/backend/test_agent_notes.py`；Modify `v2/backend/agent_tasks.py`、`main.py`、`test_operations.py`、`v2/requirements/AGENT_A2_RECORDS.md`。

**Interfaces:**
- Consumes：Task 2 的 `AgentTasks`/TaskScope、同一 SQLite 事务及既有 archive 锁/安全目录、`Operations.backup/restore`。
- Produces：`AgentNotes(tasks)` 的 `save(task_id,run_id,operation_id,note_id,expected_revision,markdown,sources) -> NoteReceipt`、`read(task_id,note_id,revision=None) -> NoteSnapshot`、`recover_exports(task_id=None) -> list[NoteReceipt]`。`note_id=None/expected_revision=0` 创建，否则追加预期版本；每次运行一个保存操作身份 `run_id + ':save-note'`，重复同内容回原回执，不同内容报冲突。
- `NoteReceipt` 包含 `note_id/revision/status/export_status/relative_path/sha256`；`export_status=EXPORTED|PENDING|CONFLICT`。SQLite 保存可重建正文/来源/修订及 outbox，MD 用新版本路径，旧文件不覆盖。无文件哈希回读成功不得报 EXPORTED。

- [ ] **1. 写 RED 用例。** `test_same_operation_has_one_revision` 断言重试只有一稿、不同正文409；`test_sql_commit_then_export_failure_recovers_once` 在 SQL 后、临时文件后、发布后分别注入失败，断言待恢复可查、重开只补同一稿；`test_readback_hash_mismatch_is_not_saved` 断言冲突不覆盖外改文件；`test_expected_revision_conflict_preserves_both_inputs` 断言两窗口同时改同版本，后一输入留候选/冲突、旧稿不变。补 `test_backup_restores_tasks_messages_notes_without_credentials_or_grants` 核对同库+MD恢复，DPAPI/授权不入包。
- [ ] **2. 跑 RED。** `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_agent_notes backend.test_operations -v`；预期新导出/恢复断言失败。
- [ ] **3. 实现最小 outbox。** 事务写笔记修订、操作哈希、待导出记录，提交后按模板生成含 scope/任务/运行/版本/待确认状态/实际来源的 UTF-8 MD；fsync、同目录发布并回读后标完成。只能用服务端生成的相对路径。读取失败保留记录与错误，恢复不重跑模型；没有 SQLite/MD 跨文件事务承诺。旧 `agent-*.md` 只读列为历史未版本稿，不补造旧任务/消息。
- [ ] **4. 增加读取/恢复路由并跑 GREEN。** `GET /api/agent/tasks/{task_id}/notes/{note_id}?revision=N`、`POST .../recover-exports` 调用上述服务。跑同 RED 命令，备份恢复核对新库+每版正文/哈希与旧正式事实。未来 schema 版本拒绝，恢复仍只允许空目录。
- [ ] **5. 提交、汇报 A2 并停止。** `git -C .. add v2/backend/agent_notes.py v2/backend/test_agent_notes.py v2/backend/agent_tasks.py v2/backend/main.py v2/backend/test_operations.py v2/requirements/AGENT_A2_RECORDS.md`；`git -C .. commit -m "feat(agent): version pending notes with recoverable Markdown exports"`。不自动进入 A3。

## A3 / Task 4：授权、必要摘要与教学工具执行

**Files:** Create `v2/backend/agent_scope.py`、`agent_execution.py`、`test_agent_execution.py`、`v2/skills/math-history-analysis/SKILL.md`、`v2/requirements/AGENT_A3_EXECUTION.md`；Modify `v2/backend/provider.py`、`agent_history.py`、`main.py`；只有 A1 选用 SDK 才 Modify `v2/backend/requirements.in`、`v2/backend/requirements-lock.txt`、`v2/DEPENDENCIES.md`。

**Interfaces:**
- Consumes：A1 结论、Task 2—3 服务、现有 `ProviderService` 的配置/请求边界、`AgentHistory.execute(name,args) -> (result,image_or_none)`、有效 `LearningService.workspace/assignment`。
- Produces：`AgentScope.preview(task_id,provider_revision) -> ScopePreview`、`grant(task_id,preview_hash) -> Grant`、`authorize(grant_id,task_id,provider_revision,action,resource=None) -> None`、`revoke(task_id) -> None`。Grant 仅在进程内；resource 为已归属的 `(assignment_id,sha256,page)`，模型不可指定路径。
- `AgentExecution.start(task_id,request_id,user_message_id,grant_id) -> RunRecord`、`get_run(task_id,run_id) -> RunSnapshot`、`stop(task_id,run_id) -> RunRecord`。start 返回 202 后由本进程 worker 执行，一个任务最多一个活动运行；并发不同指令409，同 request 回同运行。无持久队列或重启自动续跑。
- 工具继续五个原名称；保存工具调用 `AgentNotes.save`。真实回执 DTO：`call_id/name/safe_args/status/source_refs/result_summary/note_receipt`；卡片参数由后端生成，不用模型输出伪造执行状态。

- [ ] **1. 写 RED 核心与权限用例。** `test_natural_language_run_uses_existing_two_assignment_tools` 用本地替身只替模型，核对工具实际读取、引用和待确认笔记；`test_grant_invalidates_on_scope_config_restart_or_revoke` 断言变更后外部请求0；`test_historical_image_needs_exact_additional_grant` 断言允许摘要不允许旧图；`test_material_instruction_cannot_escalate_scope` 断言图/MD内“读其他学生”拒绝。
- [ ] **2. 写 RED 失败用例。** `test_stop_blocks_new_calls_keeps_committed_note`、`test_saved_note_survives_next_model_401`、`test_budget_no_retry_and_missing_config_is_not_simulation`、`test_unreadable_pdf_zero_search_and_large_encoded_image_are_explicit`。断言停止后不新发工具/模型、已提交保存仍可查；无配置为失败不回本地模拟；PDF保持UNREADABLE、零命中不说从未错；沿用最多3图，对最终再编码字节设2 MiB上限（base64前），超出明确拒绝且保留原件，不再以仅JPEG副本大小判断。
- [ ] **3. 跑 RED。** `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_agent_execution -v`，预期新连接/权限接口缺失失败。
- [ ] **4. 接最少执行边界。** 按 A1 结论只接一个执行器；KEEP_CURRENT 仅把现有循环接到可注入派发/状态/预算边界，不复制一套业务。ADOPT_SDK 才将已验证正式版本及相容依赖锁入本地 venv，冲突先报告，不盲目升核心包。保留当前服务与凭据流程。worker 每次请求/每个工具前重新检查许可和取消，派发串行；阻塞 transport 可在线程等待，停止仅保证不再发新调用，不虚报已终止供应商计费。
- [ ] **5. 实现一个教学流程与摘要准备。** 在已有明确本地归档/查档路由之后，分析请求向模型提供该生该科当前主作业必要摘要（使用 `AgentHistory.snapshot`，沿用20条关联截断标志），历史通过分页工具取；不预装整库或旧图片。适用流程由指令识别/模型选择，记录实际流程ID和Skill哈希；不确定先询问。中文Skill按官方 skills-ref 校验，要求观察/教师事实/历史关联/错因假设/未知/证据分别输出；其他三科保留入口并明确专用流程未验。
- [ ] **6. 接路由并跑 GREEN。** `/api/agent/tasks/{task_id}/scope` GET预览/POST确认、`/scope/revoke` POST、`/runs` POST、`/runs/{run_id}` GET、`/runs/{run_id}/stop` POST；来源/Host/CORS沿用本地边界，不向渲染器发Key。跑同 RED 命令及 `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_provider backend.test_agent_history backend.test_provider_store -v`。报告取消在途请求局限、最终图像限制及实际依赖变化。
- [ ] **7. 提交。** 明确暂存上述实际变更文件（依赖文件仅在选用SDK时加入），`git -C .. commit -m "feat(agent): connect scoped teaching execution to existing archive tools"`。A3 还需 Task 5，未完成前不称老师可用。

## A3 / Task 5：在现有 Agent 显示真实工具过程与任务记录

**Files:** Create `v2/src/agent-adapter.ts`、`agent-task.tsx`、`v2/scripts/verify-agent-tasks.mjs`；Modify `v2/src/main.tsx`、`style.css`、`v2/requirements/AGENT_A3_EXECUTION.md`。

**Interfaces:**
- Consumes：Task 2任务/消息、Task 4 scope/runs路由、已装 assistant-ui公开 `ThreadHistoryAdapter`、`ChatModelAdapter`、render-only toolkit。
- Produces：`createTaskHistoryAdapter(taskId: string, scope: TaskScope): ThreadHistoryAdapter`、`createTaskModelAdapter(context: TaskContext): ChatModelAdapter`、`AgentTaskPanel({studentId,subject,assignmentId,onTaskChange})`。TypeScript类型从已安装库导入/核对，不照滚动文档臆造字段；`scopeId` 含固定任务身份。
- `TaskScope` 的 TypeScript 字段对应 Task 2 的 `student_id/subject/assignment_id: string`；`TaskContext` 含 `taskId/scope/grantId`，grantId仅内存。历史adapter只提交带稳定 `message_id/parent_id` 的user消息；模型adapter用服务端message_id启动运行，并用后端返回的assistant消息ID恢复结果。assistant/tool消息的append仅幂等核对已存在记录，不另写回执。`tool-call` parts使用稳定调用ID、后端安全args/result/isError，后端型卡片只渲染不重复执行。任务列表依附当前学生/学科/作业，不新增全局聊天首页。

- [ ] **1. 写 Electron RED 脚本。** `verify-agent-tasks.mjs` 使用现有独立资料/配置路径与实际开发Electron，断言一次范围确认后两次同范围指令不重复询问、不重填身份；真实工具卡与后端call_id/结果对应；拒绝/不可读有不同状态；同工具只执行一次；摘要无全库照片；服务/学生/学科切换后旧历史不再外发；卡片正文HTML按文本显示、无渲染错误。
- [ ] **2. 跑 RED。** `node scripts/verify-agent-tasks.mjs`；预期新任务入口/卡片断言失败，保留截图，环境启动失败须先解决后重跑行为RED。
- [ ] **3. 接 History/Tool UI。** 查固定版本示例后实现上述适配器。显示任务目标、状态、已读依据、笔记版本/导出状态；输入/停止沿用Composer。运行用轮询最终回执，不新增token SSE；设置弹窗/学生名单/四科/独立Agent按钮保持。授权令牌只在内存，后端响应为准；本地旧对话恢复不触发任何模型请求。
- [ ] **4. 跑 GREEN。** `npm.cmd run build`、`node scripts/verify-agent-tasks.mjs`、`node scripts/verify-agent-history.mjs`、`node scripts/verify-ux-home.mjs`、`node scripts/verify-ux-routing.mjs`。实际查看首页与Agent截图；更新旧脚本仅适配已获准入口，不能删隔离/越权断言换通过。本阶段仍用模型替身，报告写SYNTHETIC，不称自主教学验收通过。
- [ ] **5. 提交、汇报 A3 并停止。** `git -C .. add v2/src/agent-adapter.ts v2/src/agent-task.tsx v2/src/main.tsx v2/src/style.css v2/scripts/verify-agent-tasks.mjs v2/requirements/AGENT_A3_EXECUTION.md`，另明确列相关旧脚本实际修改；`git -C .. commit -m "feat(agent): show scoped task history and real backend tool receipts"`。

## A4 / Task 6：重开续聊、对话纠正与外改 MD 候选

**Files:** Modify `v2/backend/agent_execution.py`、`agent_notes.py`、`agent_tasks.py`、`main.py`、`v2/src/agent-adapter.ts`、`agent-task.tsx`、`v2/scripts/verify-agent-tasks.mjs`；Create `v2/backend/test_agent_revision.py`、`v2/requirements/AGENT_A4_CONTINUATION.md`。

**Interfaces:**
- Consumes：A2版本/期望修订与A3任务权限/消息；老师自然语言纠正是新user消息+新run，不原位改旧消息。
- Produces：`AgentExecution.context(task_id,grant_id,user_message_id) -> list[dict]`（仅必要、来源可授权的最近最多10条文本，每条≤8000字，附截断/省略提示）；`AgentNotes.import_candidate(task_id,note_id,expected_revision,raw: bytes) -> CandidateReceipt` 与 `read_candidate(task_id,candidate_id)`。外改文件≤64 KiB、UTF-8/UTF-8 BOM、正文≤20000字；保留原始字节/哈希及来源版本，不接受本地任意路径。

- [ ] **1. 写 RED 用例。** `test_reopen_restores_messages_but_not_grant_or_running_work`、`test_restored_history_is_filtered_before_external_send`、`test_q5_to_q6_requires_new_evidence_and_keeps_old_note`、`test_stale_correction_reports_conflict`、`test_foreign_old_or_instruction_md_remains_candidate`。断言Q6无证据时写无法判断，不沿用Q5图；外改放错学生/任务或旧版须询问/冲突，不能靠MD头自行扩大权限；旧正式记录/原稿不变。
- [ ] **2. 跑 RED。** `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_agent_revision -v`；`node scripts/verify-agent-tasks.mjs --continuation`，预期未实现续聊/纠正断言失败。
- [ ] **3. 实现定向修订。** scope内的必要对话按来源过滤后才进入新运行；无法证明来源可授权的旧tool/output不自动发送，界面仍可本地阅读。对话修改调用同一版本笔记服务；`AgentExecution` 保存前在归档锁内核对实际读取来源的题目修订/知识关联revision，再将这些source_refs传给 `AgentNotes.save`；笔记用expected_revision检查。迟到结果写冲突，不盖新稿。笔记新稿附修改依据/变化范围，不把改题号等同于确认错因。
- [ ] **4. 接外改候选入口。** 沿用附件选择/任务笔记入口，新增 `POST /api/agent/tasks/{task_id}/notes/{note_id}/candidates` 接UploadFile及expected_revision；附件只是候选材料，关联核对后仍经一次明确修订操作形成新稿。没有目录监控、任意文件编辑器或自动教师事实写回。
- [ ] **5. 跑 GREEN。** 重跑两个RED命令及 `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_agent_tasks backend.test_agent_notes backend.test_agent_execution -v`、`npm.cmd run build`。证据包括退出重开前后消息ID、实际外发摘要范围、旧/新MD哈希、冲突回执与正式记录不变。
- [ ] **6. 提交、汇报 A4 并停止。** 明确暂存本Task上述实际变更文件，`git -C .. commit -m "feat(agent): continue teaching tasks with traceable note corrections"`。不推进正式入档或训练。

## A5 / Task 7：真实模型完整验证，允许明确失败

**Files:** Modify `v2/scripts/verify-history-live.py`、`verify-provider-live.py`、`v2/backend/test_live_entry.py`；Create `v2/requirements/AGENT_A5_LIVE_ACCEPTANCE.md`。不为取得通过重写Agent业务或调整凭据。

**Interfaces:**
- Consumes：A1选定执行器、A3/A4生产路径、`make_pair`独立夹具、现有安全配置/隐藏输入；不读真实学生库。
- Produces：脚本 `--prepare-only`、`--prompt-key` 以及经明确授权的 `--saved-config` 模式；安全结果含 `runtime/model/endpoint/status/external_calls/tool_calls/source_refs/note_receipts/formal_unchanged`。状态 `PREPARED/BLOCKED_AUTH/FAILED/PARTIAL/PASSED`；每项自主选工具/图片/关联/保存独立判定，不能仅看HTTP200。

- [ ] **1. 写脚本RED测试。** `test_live_entry_uses_task_path_without_old_fixture_directory` 断言从零建夹具、scope精确、用实际任务执行边界；`test_live_401_stops_without_simulation_or_retry` 断言只有探针一次外部请求、没有工具/MD假成功；`test_no_tool_call_is_recorded_as_failed_goal` 断言普通聊天200仍不达标。替身只验脚本，不作为真实验收。
- [ ] **2. 跑 RED/GREEN。** `.\.venv\Scripts\python.exe -X utf8 -B -m unittest backend.test_live_entry -v`；最小修改移除固定`.qa-temp/时间戳`依赖、继续隔离store，保留历史失败报告；同命令通过后运行 `.\.venv\Scripts\python.exe -X utf8 -B scripts/verify-history-live.py --prepare-only`，预期PREPARED且external_calls=0。
- [ ] **3. 核对真实执行条件。** 只有用户授权的有效配置可用；现存失败凭据不擅自删字符或重复测试。确认服务地址/精确模型/隐藏Key输入、安全日志、当前两张合成图与任务授权。条件不满足写BLOCKED_AUTH并停止；无需向用户索要新增学生/教案材料。
- [ ] **4. 执行一次真实验收。** 用 `.\.venv\Scripts\python.exe -X utf8 -B scripts/verify-history-live.py --prompt-key`（或已明确授权的saved-config）先无学生认证探针，通过再运行自然语言“分析本次第5题，与以前有什么关系，并保存待确认笔记”。不得强制tool_choice或预填工具答案冒充自主；本次图按需读，旧图默认未授权。运行仍≤4次模型请求，失败不自动补跑。记录请求时间/状态/模型/调用ID/安全参数/来源和MD回读，不记Authorization、Key或图片base64。
- [ ] **5. 逐项人工核对报告。** 当前Q5与旧Q3的作业ID/日期/题号/原答是否准确，图像副本是否实际随成功请求发出，同知识点/同错因是否分清，未知/未读图是否明确；MD新进程回读、正式记录/原件前后不变。分析错误、无工具、认证/接口失败如实留证；预置标签不算自主发现知识点。本案例不证明真实手写或批改准确率。
- [ ] **6. 提交安全脚本/报告、汇报 A5 并停止。** `git -C .. add v2/scripts/verify-history-live.py v2/scripts/verify-provider-live.py v2/backend/test_live_entry.py v2/requirements/AGENT_A5_LIVE_ACCEPTANCE.md`；`git -C .. commit -m "test(agent): record real-provider teaching task acceptance"`。原始本地证据不入Git；失败不能标A5通过或进入A6交付。

## A6 / Task 8：统一回归、阶段封装与老师试用

**Files:** Modify `v2/WINDOWS_TRIAL_GUIDE.md`、`BEGINNER_GUIDE.md`、`BEGINNER_SELF_TEST.md`；Create `v2/requirements/AGENT_A6_TRIAL.md`；仅有封装资源遗漏时 Modify `v2/scripts/package-windows.py`。

**Interfaces:**
- Consumes：A1—A5报告与已通过代码、现有 `package-windows.py build <目录> <版本>` / `archive <目录>`、现有UX反馈编号机制。
- Produces：一个阶段便携ZIP/清单/哈希/最短手册和教师试用记录；新旧资料不自动迁移，凭据/权限不入包。发布版本使用当前版本之后的独立阶段号，不预先承诺版本号。

- [ ] **1. 先检查入关条件。** A5各实际任务目标通过才安排阶段试用包；没有有效真实验收则记录等待关口，不反复封装来代替。若修复打包特有问题，先写对应资源/冻结进程失败用例再修，不顺带改教学业务。
- [ ] **2. 跑完整回归。** `.\.venv\Scripts\python.exe -X utf8 -B -m unittest discover -s backend -p 'test_*.py'`、`npm.cmd run build`、`node scripts/verify-agent-tasks.mjs --continuation`、`node scripts/verify-learning.mjs`、`node scripts/verify-intake.mjs`、`node scripts/verify-ux-home.mjs`、`node scripts/verify-ux-routing.mjs`。记录实际项数/结果，不复制旧PASS。
- [ ] **3. 在这一交付点统一打包和验证。** 按现有脚本用E盘新交付目录构建一次；用新EXE运行任务重开/纠正及既有学习/归档脚本，实看截图，归档后校验CRC、全清单哈希、源码手册匹配、无Key/资料库。另一台无开发环境Windows未测就明确未测，不以本机EXE代替。
- [ ] **4. 让老师只试一条教学任务。** 选学生/数学/作业→一句话分析关联→一次范围确认→核对工具依据/待确认稿→退出重开→纠正一处。记录实际点击数、重复输入、困惑/失败和反馈编号；无人实际试用则标WAITING_TEACHER，不能代写认可或省时结论。手册区别原件、教师事实、AI待确认稿；老师此阶段不需编辑JSON或手动选择Skill。
- [ ] **5. 文档/交付检查并提交，汇报后停止。** 明确暂存实际修改的手册/报告/封装修复及测试（ZIP/证据不入Git），`git -C .. commit -m "docs(agent): deliver staged teaching Agent trial and evidence"`。由用户决定下一阶段是否进入B1；不自动生成训练、扩科或收费功能。

## 自检与覆盖结果（仅文档检查）

- 设计R1复用现有归档，A2/A3回归；R2由A3执行和A5真实验收；R3由A2回执/A3卡片；R4由A3授权；R5由A2记录/A4续聊；R6/R7由A4纠正/候选导入。
- 设计第11节验收V01—V14依次覆盖：原成果→Task 2—8回归；运行时→Task 1；自主流程/权限/两卷/分析→Task 4、5、7；卡片→Task 5；MD→Task 3、7；续聊/纠正/外改→Task 6；失败去重→Task 1—4；备份→Task 3；老师体验→Task 8。SDK失败识别通过不等于SDK兼容通过，采用条件单独判断。
- Review Focus五类都有对应测试；稳定ID、scope、run、note/revision接口在后续Task沿用；前端恢复不等于允许外发，消息append不伪造后端回执。
- 七项用户补充全部进入设计：A/B区分、四科数学先行、待确认转正式及新版MD、已有统计/训练/复测复用、山西来源与届别、SDK收益门槛、自动必要摘要。B在设计第15节有必需范围/验收，不冒充本次可一次实施的任务。
- 未开始实施；没有新增依赖/数据库表、运行测试、模型请求、EXE或教师验收结果。计划中的命令与PASS均是未来要求，不是本轮证据。
