# 批次收件工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 老师能按批次找到待审核及有材料疑点的学生并准确打开整卷。

**Architecture:** 新建只读intake.py汇总现有papers/students；GET /api/intake接既有Host/Origin保护；独立intake-panel.js页面接现有审核台，不新建业务表。

**Tech Stack:** 现有Python/SQLite、原生JavaScript/CSS，沿用已安装依赖。

**Spec:** docs/design/BATCH_INTAKE_DESIGN.md

## Global Constraints

- 老师逐人整卷确认；不自动归属、确认、外发或修改真实档案。
- 未知应收人数、总页数不填0或推断完整；缺材料不记为不会。
- 参考答案排除重复作业提示；只按照片内容hash提示不同学生归属疑点。
- 本地Git、显式暂存本次文件并提交，不配置远端或推送。

## Review Focus

- 相同题干、不同笔迹不得误当重复；只有hash相同才提示。
- 参考照片和同学生不同批次不污染本批跨学生提示。
- 已确认但仍MISSING，不得显示“全部完成”。
- 迟到请求与切学生不串档。
- 不依赖题干/答案正文或外部模型，不新增自动确认路径。

### Task 1: 只读批次摘要

Files: app/intake.py, app/server.py, app/tests/test_intake.py。

Interface: intake_overview(store)->{batches:[{batch_id,paper_count,confirmed_papers,waiting_papers,issue_papers,papers:[...]}]}。

- [x] 写空库、混合状态、同hash重传/跨学生、参考排除、跨批次、零写入及最小响应测试，看到RED。
- [x] 实现只读摘要及GET保护路径，专项GREEN。

### Task 2: 批次页面及整卷衔接

Files: app/web/intake-panel.js, app/web/app.js, app/web/index.html, app/web/styles.css；验证脚本docs/design/verify-batch-intake.mjs。

Interface: intakePage(), intakeHandle(action,element), intakeSelect(element)；调用Task1 API，打开整卷重新加载并核准paper/student/batch归属。

- [x] 浏览器先验证入口缺失RED，再实现筛选、空态、整卷导航与迟到保护。
- [x] 用合成数据检查桌面/窄屏、转义、只读零写入；运行原档案回归和完整Python测试。

### Task 3: 审查与本机交付

- [x] 一次独立整项审查；Important修复先RED再GREEN，整套回归通过。
- [x] v0.17说明与白名单包；更新服务前备份并核对密钥/活动任务/进程身份，更新后9表业务摘要不变。
- [x] 检查敏感信息及差异，显式暂存本次文件，按AGENTS创建本地提交，报告短哈希及未验证项。
