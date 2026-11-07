# 知识条目驱动的持续问题 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, TDD per task; one final independent review.

**Goal:** 在个人学习档案按老师认可的稳定知识条目串联反复问题，保留文字标签组与原题证据。

**Architecture:** 扩展learning_analysis.py的只读分组键与返回字段；learning-panel.js展示依据、名称／题型变化及确认时间，复用已有回原卷关联修正和历史事件窗口。无新数据库写入。

**Tech Stack:** 现有Python/SQLite/原生JS，不新增依赖。

**Spec:** docs/superpowers/specs/2026-11-06-knowledge-patterns-design.md；docs/pilot/MATH_V1_MILESTONES.md第4步。用户已持续授权开发。

## Global Constraints

- 只用已确认的最新原题结果；同来源同题去重，完整历史保留，复测不混原卷。
- 同material_id+entry_id跨版本／题型归组，不同条目不因名称相同误并，无引用旧数据只作标签线索。
- 不认定长期不会／掌握，待核对和缺材料不记为错误；不把确认时间当考试日期。
- 所有网页资料文字转义，来源切换与补练的版本／学生检查仍有效。
- 不读取密钥、不调用真实AI、不往真实学生档案添加模拟记录。

## Review Focus

- 同名不同条目和无引用标签不能误并；同条目改名／跨题型不可误拆。
- 重新关联草稿不移动已确认组；确认改判后旧快照保留，当前计数更新。
- 合并后补练必须定位实际原题、学生和最新确认版本，不能默认第一题。
- 资料内容含HTML时只显示文本，不执行；空名称／旧数据须兼容。
- 新字段不得改变去重摘要与原卷／复测边界，也不能导致原真实数据迁移变化。

### Task 1: 稳定归组和证据字段

- [x] 新增app/tests/test_knowledge_patterns.py，先验证RED：同条目不同题型、同条目跨版本改名、同名不同条目／资料、有无引用分开、待审改关联、确认修正、重复来源、学生隔离。
- [x] 修改app/learning_analysis.py，返回basis、knowledge_names、question_types、teaching_entry及证据里的知识名称／题型／固定teaching_ref。
- [x] 专项及原learning/student_archive回归通过。

### Task 2: 老师看得懂的证据页

- [x] 页面先RED再实现：显示稳定依据或标签待核提示、原题变化和确认时间；回原卷核对关联入口，保留现有安排补练与只读历史。
- [x] 合成浏览器覆盖同名分组、改名合并、不同学生、待审／确认修正，桌面与窄屏实际查看；回归旧持续问题和档案。

### Task 3: v0.12本地交付

- [x] 独立审查与必要修复；全Python及相关浏览器通过。
- [x] 补操作说明及交付报告；从v0.11白名单打包，不带本机资料／凭据。
- [x] 本机备份、无活动任务检查后更新服务，回读业务哈希不变；实际只读页面验证。
- [x] 报告第4步软件增量与真实跨次验收边界，下一步接讲解和三级补练的资料依据。

执行结果：docs/design/KNOWLEDGE_PATTERNS_DELIVERY.md。此计划的软件增量完成，实际日期、独立作答和真实教学验收不随软件测试勾为通过。
