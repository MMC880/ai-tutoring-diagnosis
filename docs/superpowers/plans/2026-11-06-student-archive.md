# 每生本地档案与原题追溯 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task; source scope and tests below are the execution boundary.

**Goal:** 完成7步第2步的软件支持：每生独立摘要、当前去重记录与完整确认历史、可打开的只读原题证据。

**Architecture:** 保留SQLite事件、现有教师确认和去重逻辑，增加个人档案的去重摘要与带学生约束的历史事件读取。网页增加学生选择和历史快照窗口，不迁移真实数据、不改自动掌握规则。

**Tech Stack:** 现有Python/SQLite/原生JS及Chrome；不安装依赖。

**Spec:** docs/pilot/MATH_V1_MILESTONES.md第2步。已由用户指示继续实施；本轮界面小选择以现有风格和最小改动落实。

## Global Constraints

- 不将真实照片初查代签教师确认，不调用外部模型、不加载聊天密钥。
- 两名合成学生验证隔离；重复记录仅影响计数，完整历史必须保留。
- 不把原题历史按钮指向当前已修订的内容并称其旧快照；历史窗口只读。
- 分歧门禁与识读门禁继续适用；不生成心理标签或宣称掌握。
- 项目无Git，以源码副本和当前v0.9交付包保留恢复起点；只改本项目。

## Review Focus

- 带其他学生id/事件id的请求必须拒绝，不能返回不匹配原答或附件。
- 当前摘要、待补清单与同类问题计数一致，未标标签也纳入总数。
- 后续改判、待审修订不能改写历史快照；重复照片与跨学生同卷不能误混。
- 切换学生时的迟到响应不能打开上一学生的证据。
- 恢复备份后的事件/附件追溯仍可用；只读查看不会产生确认、AI或补练。

### Task 1: 档案摘要与受约束历史查询

**Files:** app/store.py, app/learning_analysis.py, app/student_archive.py(new), app/server.py; test app/tests/test_student_archive.py(new).

**Interfaces:**
- analysis.evidence_event_ids = 去重后当前确认事件id数组；旧字段保持。
- profile.current_evidence = 去重后的当前事件；archive_summary = counts/confirmed_papers/pending_papers/history_events/duplicate_count。
- Store.student_evidence(student_id,event_id) -> student,paper,event,documents,is_latest,latest_event_id,has_pending_revision；student_id为内部id，事件正整数。
- GET /api/profiles/{student_id}/evidence/{event_id} -> 上述只读记录。

- [x] 写并观察失败：两生隔离、历史/最新、未确认修订、未归类总数、照片去重、附件与备份恢复。
- [x] 实现最小只读数据能力；既有profile.latest保持兼容；专项与全Python回归。

### Task 2: 学生选择、原题快照与个人数字一致

**Files:** app/web/archive-panel.js(new), app/web/app.js, app/web/learning-panel.js, app/web/index.html, app/web/styles.css; browser docs/design/verify-student-archive.mjs(new).

**Interfaces:** archiveSummaryHTML(profile), archiveTimelineHTML(profile), archiveHandle(action,element), archiveSelect(selectElement)。个人摘要与待补列表读current_evidence；历史时间线保留events；弹窗只读且显式区别最新确认/历史/当前待审修订。

- [x] 浏览器先断言新选择器缺失，再实现入口；验证两个学生切换、重复计数、历史回看、附件链接、返回当前卷、跨学生拒绝与响应过期保护。
- [x] 检查桌面/窄屏并回归老师主判及同题续录；记录真实老师验收仍待完成。

### Task 3: 本机交付v0.10

**Files:** app/学习档案使用说明.md, docs/design/STUDENT_ARCHIVE_DELIVERY.md, docs/design/student-archive-progress.md，更新app/README和阶段计划；打包严格源码白名单。

- [x] 独立只读审查，重要发现补回归后修复。
- [x] 通过检查后本机备份、无密钥/活动任务时更新服务并回读业务哈希；不变更真实成绩。
- [x] 记录完成的是第2步的软件能力；真实档案与后续教学参考库分别验收。
