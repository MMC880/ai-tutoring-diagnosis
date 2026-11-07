# SDD ledger — plan: docs/superpowers/plans/2026-11-05-local-trial.md

2026-11-05：执行者在新 app/ 内连续实施；prototype/、WorkBuddy 包与旧记录保持不动。

Ruling: 项目没有独立 Git 仓库，用新 app/ 隔离并保留测试记录；不初始化父目录仓库、不造提交。
Pre-flight: 数据核心输出 Store/附件接口，服务消费同一接口；服务提供 JSON API，界面不再以浏览器变量作为存储。学生 ID 由服务关联，复测不得更换归属。
Ruling: PDF 采用浏览器专用打印页另存 PDF；不引入额外渲染依赖，实际打印仍需老师验证。
Ruling: 无外部模型时仅提供本地文件保存、人工录入/结构化导入；不将合成模板称为 AI 识别或生成。

Task 1: RED — 20 项核心测试已运行，20 项因核心尚未实现失败（local-trial-core-red.txt）。

Task 1: complete — SQLite事务、确认与历史修订、学生/批次、附件、备份恢复；核心20项转绿，新增文件/修订约束与审查回归后共25项核心检查。
Task 2: complete — 本机API、Host/Origin/写入令牌、限量附件、真实Word与专用打印页；8项HTTP检查。总计33/33通过。
Task 3: complete — 本地界面与文件导入、草稿保存确认、档案与统计、补练复测和资料管理；23项浏览器检查通过。真实PDF生成并经Poppler渲染查看，Word结构检查通过。
Ruling: 大附件上传的CDP网络事件导致调试连接阻塞，上传已成功；仅在该阶段停用Network事件，避免把调试流故障伪称产品故障。未宣称该阶段网络日志完整。
Ruling: 补练旧编辑行历史与旧版迟交暂不扩展；当前仅复测保留当时练习快照，在交付限制中明确，后续扩大试点前补齐。
Task 4: 独立审查发现旧题干混算1项，RED→GREEN修正，审查者独立复核5项通过。所有更改均在本项目；未迁移或修改WorkBuddy历史。
Ruling: finishing-a-development-branch已读取；这里没有独立Git分支可合并，按已授权范围交付源码包、说明与本机入口，不弹不适用的合并菜单。

Task 4: complete — 源码ZIP20文件、19项SHA清单已核验；33项自动与23项浏览器检查通过；说明与阶段文档已同步。127.0.0.1:8765实际回环监听、health=ok，虚构学生1／待审卷1／事件0；PID13744为本轮服务，不触碰其他进程。正式未接模型、未使用真实资料，剩余限制见LOCAL_TRIAL_DELIVERY.md。
