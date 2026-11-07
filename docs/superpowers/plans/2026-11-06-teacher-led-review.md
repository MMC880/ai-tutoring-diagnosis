# 老师主判入口 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在既有工作台单独保留老师原批改，将AI候选与本次最终判定区分，并在确认时拦截未核清分歧。

**Architecture:** 继续使用当前单机版本与JSON题目快照。增加可选教师记录字段及纯函数冲突检测，既有记录不迁移；AI文字建议和图片续录均保留教师字段并撤销旧分歧确认。前端增加每题本机核对区域，仍经保存草稿、整卷确认。

**Tech Stack:** Python标准库/SQLite、现有网页JavaScript、现有unittest及Chrome无头检查；不安装依赖。

**Spec:** docs/pilot/MATH_V1_MILESTONES.md 第1步、PRD.md最新老师主判定位。

## Global Constraints

- 不操作真实成绩、不读取旧聊天密钥、不做新增外部模型调用。
- 不修改其他项目；本项目无Git仓库，保留源码快照，不初始化或提交父目录。
- 只交付第1步的软件支持，不声称真实教师验收、完整知识库或七步全部完成。
- 缺材料、识别未核清和待核对仍不能转为确定错题；心理档案禁止。

## Review Focus

- AI文字应用或图片重新转写不能丢失老师原批改；新的模型意见不能继承旧分歧确认。
- 原判与最终判定或AI候选冲突，须填写核对说明并明确核清后才以确定结果归档。
- 改成待核对可以暂存，不统计成确定错误；原有无新增字段记录仍兼容。
- 本地字段不自动随文字AI请求外发，也不能从模型返回写入教师确认。
- 页面编辑要撤销分歧勾选和整卷同意；确认失败不留部分事件，备份恢复及教师报告保留新字段。

### Task 1: 原判与分歧数据规则

**Files:** Create app/grading.py; Modify app/store.py, app/ai_service.py, app/vision.py, app/exporting.py; Test app/tests/test_teacher_grading.py.

**Interfaces:**
- Optional per-question fields: teacher_result (RESULTS or empty), teacher_mark (max1500), ai_result (RESULTS or empty), grading_note (max1500), grading_resolved (bool).
- grading.has_conflict(question) -> bool; grading.merge_suggestion(question, suggestion) -> dict; grading.preserve_teacher(previous, updated) -> dict.
- Store.confirm rejects unresolved evaluated-result conflict before any event insertion. AIService.apply keeps original teacher result and current teacher final result, records ai_result separately, resets grading_resolved. Vision replacement keeps teacher metadata but resets grading_resolved.

- [x] Add tests for roundtrip, confirmation block/explicit resolution, pending, old records, AI disagreement/payload exclusion, vision preservation and report/backup.
- [x] Run new tests and capture genuine missing-behavior failures.
- [x] Implement minimal validation/helpers and call sites; run new tests then existing Python suite.

### Task 2: 教师核对入口

**Files:** Create app/web/grading-panel.js; Modify app/web/app.js, app/web/index.html, app/server.py; Test docs/design/verify-teacher-review.mjs.

**Interfaces:** gradingHTML(question) -> HTML; gradingInput(element) updates current card warning and revokes acknowledgement. Normal data-field collection saves optional fields via existing draft API.

- [x] Browser checks first: raw marking retained, teacher final kept on mock AI apply, conflict block and visible explanation, teacher-only resolution, edits revoke consent, refresh/pending path.
- [x] Add local panel and approved source labels; retain current API/photo flows and avoid hidden network operations.
- [x] Run isolated browser checks and relevant prior browser regressions.

### Task 3: 可审阅交付

**Files:** app/老师主判使用说明.md, docs/design/TEACHER_REVIEW_DELIVERY.md, docs/design/teacher-review-progress.md; update app/README.md and stage progress.

- [x] Record baseline, source-copy location, RED/GREEN results and limitations.
- [x] Review complete source delta; fix substantive findings with regression checks.
- [x] Deliver step1 software capability and explicitly retain WAITING_TEACHER for real samples; do not auto-archive or publish.
