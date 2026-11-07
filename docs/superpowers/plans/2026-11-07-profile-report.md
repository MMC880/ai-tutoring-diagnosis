# 个人学情报告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** 从学生档案预览并按明确选择导出教师学情核对稿。
**Architecture:** 只读profile_report构建块和指纹；新路由复用word_bytes/print_html。report-panel独立预览与操作守卫，无新数据表。
**Tech Stack:** Python/SQLite、python-docx、原生JS/CSS及已有本地打印路径。
**Spec:** docs/design/PROFILE_REPORT_DESIGN.md

## Global Constraints

只教师核对稿，不自动学生发布、确认或外发；原卷与复测分开，当前版和旧版分开，一次正确不认定掌握；无schema迁移；本地Git提交，不合并main或推送。

## Review Focus

不能串学生；旧预览不能导出变更后档案；新题面未测不能套旧复测；改关联不能改写补练来源；迟到预览/下载不能在新学生或新窗口生效。

### Task 1: 只读报告与输出接口

Files: app/profile_report.py、app/server.py、app/tests/test_profile_report.py、app/tests/test_http.py。
Interfaces: build_profile_report(store,student_id)返回指纹/块；report_content(store,student_id,fingerprint,audience='teacher')验证后返回title/blocks。
- [x] 先RED：当前确认/空记录/去重/隔离/历史来源与当前版本复测、确定指纹/变化冲突、只读及参数拒绝。
- [x] 新HTTP接口先RED，再实现DOCX/打印/Origin和冲突检查。运行专项。

### Task 2: 预览和导出交互

Files: app/web/report-panel.js、app/web/archive-panel.js、app/web/app.js、app/web/index.html、app/web/styles.css；docs/design/verify-profile-report.mjs。
Interfaces: reportHandle(action,element)、reportChoiceChanged。
- [x] 新浏览器先RED；预览文本、默认不导出、选项/勾选、下载/打印、变更拒绝、学生/窗口变化拦截、窄屏；合成Word结构和打印PDF渲染检查。
- [x] 完整Python、6份Node、原档案/知识跟进/待办页面回归，独立整轮审查；重要问题先复现后修复。

### Task 3: 本机与交付

Files: app/个人学情报告说明.md、app/README.md、NEXT_STAGE_PLAN.md、DEVELOPMENT_ROADMAP.md；docs/design/PROFILE_REPORT_DELIVERY.md及打包/本机检查脚本。
- [x] 完整备份与服务身份/密钥/活动任务核对后更新0.23，实际只读验收且业务摘要不变。
- [x] 白名单包CRC/SHA/源码比对，记录实测限制；显式暂存并本地提交。
