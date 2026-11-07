# 补练复测待办 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** 集中看逐生练习处理线索，并安全打开所显示的那组练习。
**Architecture:** 新只读practice_queue_overview(store)调用现有learning_journey；queue-panel提供批次/类别筛选与受保护导航，复用practice页。
**Tech Stack:** Python/SQLite、原生JS/CSS，无新增依赖。
**Spec:** docs/design/PRACTICE_QUEUE_DESIGN.md

## Global Constraints

数学本地单用户；老师审核后处理；一次答对不认定掌握；不自动提醒、发布、确认或调用AI；无schema迁移；本地Git提交，不合并main或推送。

## Review Focus

旧版正确不能覆盖新题面待审；缺来源不按当前原题倒推；重复复测不生成多条待办；读取期间新增复测或改版必须拦截旧行；切页/筛选/开窗不允许迟到导航。

### Task 1: 只读清单

Files: app/practice_queue.py、app/learning_journey.py、app/server.py、app/tests/test_practice_queue.py、app/tests/test_http.py。
Interface: practice_queue_overview(store) -> batches/items/counts；GET /api/practice-queue。
- [x] 专项及HTTP先RED：空/所有处理类别、固定来源、旧版复测、新版待审、学生批次隔离、去重、只读与Origin保护。
- [x] 实现最小清单，只有元数据，无答案/讲解/资料全文；专项通过。

### Task 2: 工作台与安全导航

Files: app/web/queue-panel.js、app/web/app.js、app/web/index.html、app/web/styles.css；docs/design/verify-practice-queue.mjs。
Interface: queuePage、queueSelect、queueHandle；bootstrap的确切练习与来源卷验证后导航。
- [x] 浏览器先RED；筛选/空状态/精确学生练习/未自动写入、过期练习与新增复测拦截、切页/筛选/开窗、失败重试、窄屏。
- [x] 完整Python、6份Node及原档案/补练跟进/连续审核页面回归，独立整轮审查；重要发现先复现再修复。

### Task 3: 本机和交付

Files: app/补练复测待办说明.md、app/README.md、NEXT_STAGE_PLAN.md、DEVELOPMENT_ROADMAP.md；docs/design/PRACTICE_QUEUE_DELIVERY.md及打包/本机检查脚本。
- [x] 完整备份/进程/密钥/活动任务核对后更新0.22，实际只读检查与业务摘要一致。
- [x] 操作说明和白名单源码包CRC/SHA/源码比对，明确未验证项；显式暂存并本地提交。
