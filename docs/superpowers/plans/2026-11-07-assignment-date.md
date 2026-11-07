# 作业日期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Inline, one independent review.

**Goal:** 老师可选填实际作业日期，档案保留各确认版本当时日期。
**Architecture:** assignment_dates.py版本生效日志及专用更新接口；Store只读组装时附日期；独立date-panel.js收件/整卷入口，复用现有确认与备份。
**Tech Stack:** 已有Python/SQLite、原生JS、本地DOCX/打印及Node/CDP合成测试。
**Spec:** docs/design/ASSIGNMENT_DATE_DESIGN.md

## Global Constraints

日期YYYY-MM-DD或空，不猜今天/标题/时间戳。旧确认不追填；日期变化触发原卷待审、不自动确认；同日期幂等。新表创建空，不改9张既有业务表；本地提交不合并main或推送。

## Review Focus

旧确认和固定补练不得套新日期；日期-only修改须使版本/报告/AI来源过期；普通修订/补页不能丢日期；旧备份和篡改新表恢复处理；保存期间换学生/关闭窗口不覆盖新编辑器或误报成功。

### Task 1: 日期存储与历史读取

Files: app/assignment_dates.py、store.py、learning_analysis.py、profile_report.py、exporting.py、tests/test_assignment_dates.py。
Interface: validate_date(value)、date_at(db,paper_id,version)、update(store,paper_id,payload)、validate_restored(db)。Payload {version,assignment_date}。
- [x] RED：创建/默认空/日期格式/仅日期修订/旧version拒绝/同日期幂等/原答历史不变/旧确认不追填/跨学生/普通保存与补页继承/固定来源/报告旧预览失效/新旧备份及篡改恢复。
- [x] 实现最小日志表及读取附加，Expected:全部专项通过。

### Task 2: HTTP与日期界面

Files: server.py、web/date-panel.js、app.js、index.html、archive-panel.js、learning-panel.js、tests/test_http.py、docs/design/verify-assignment-date.mjs。
Interfaces: dateHandle(action,element)、dateSummaryHTML(p)、dateFieldHTML()；专用POST /api/papers/<id>/assignment-date。
- [x] 新HTTP先RED再GREEN，Expected:令牌/Origin/旧版本拒绝，无自动确认。
- [x] 浏览器先RED，接入空日期、修改/清空/冲突/取消/迟到、历史与报告显示；保存输入锁定。Expected:合成测试通过且无模型调用。
- [x] 完整Python、七份Node及受影响教学/档案/报告/待办/连续审核回归；一次独审，重要项先RED再修复并全量回归。

### Task 3: 本机更新与交付

- [x] 完整备份、服务身份/密钥/活动任务核对后更新0.25；Expected:9表摘要不变，新日期表0行，实际只读检查通过。
- [x] 白名单包CRC/哈希/源码/私密路径核对，更新说明及两份进度；显式暂存并本地提交，保留分支。
