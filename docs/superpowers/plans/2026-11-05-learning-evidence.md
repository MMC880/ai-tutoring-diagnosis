# 持续问题证据与补练衔接 Implementation Plan

> 按superpowers:executing-plans连续实施，TDD先RED后GREEN，一次最终独立审查。用户持续授权开发。

**Goal:** 让老师从已确认照片作业看到跨次同类问题，并准确选择原题安排补练。
**Architecture:** learning_analysis.py只读聚合最新确认记录；可选question_type保存在既有JSON；Store.profile加analysis，learning-panel.js接现有补练。
**Tech Stack:** 既有Python/SQLite/原生JS/Chrome，不安装新依赖。
**Spec:** docs/design/LEARNING_EVIDENCE_DESIGN.md、PRD.md R18/R30、DEVELOPMENT_ROADMAP.md。

## Global Constraints

- 草稿不入统计，同卷改判不重复；PENDING/MISSING不作错误；复测独立。
- knowledge与question_type标签精确归组，仅折叠空白，不猜近义词；题型最多200字，空值保持旧格式。
- 同一学生相同作业PNG/JPEG原图组及同题号保守去重，取最后确认；参考答案不参与。其他原档案、班级计数不改。
- 练习来源须当前整卷已确认且原题错误/部分正确，未确认修订先复核。三档按需，旧审批不迁移。
- 不判断心理或掌握概率，不真实AI外发，不伪造本机教师确认。
- 无独立Git，沿用文档/证据/白名单包，不改父仓库和WorkBuddy62条记录。

## Review Focus

- 改判、标签修订或未确认新版本不得悄悄增加/转移已确认次数。
- 相同照片、参考答案共用、没有图片的多次记录应采用明确且保守口径。
- 多题同卷不能标成多个独立复测；正确/部分正确/待核对分开。
- 分组跳到具体原卷题号时不能错选另一题或沿用另一题的练习审批。
- 标签和原题可能含HTML字符，渲染必须转义；空标签旧记录仍可读且不能误合为一个薄弱点。

### Task 1 标签与聚合

Files: store.py、learning_analysis.py、ai_service.py、tests/test_learning.py。
Interfaces: build_learning_analysis(latest,papers)→groups/unclassified_count/duplicate_count；Store.profile.learning_analysis。
- [x] 测草稿排除、两卷复错、同卷多题、改判、学生隔离、不同题型、空标签、同图去重/参考图排除、复测单列、来源修订阻断，Expected RED。
- [x] 实现可选question_type校验/候选解析，纯只读聚合与profile，Expected全套PASS。

### Task 2 老师入口

Files: web/learning-panel.js、app.js、index.html、server.py、exporting.py、docs/design/verify-learning-evidence.mjs。
- [x] 浏览器先RED：题型字段、跨次卡片、证据链接、准确原题补练及无自动审批。
- [x] 实现当前原题聚焦及返回原卷；未确认修订不开放安排；转义外来文字。
- [x] 全套与新浏览器PASS，既有34项主流程及照片清单回归。

### Task 3 审查与交付

- [x] 最终独立审查，Important先RED复现后修正；全套PASS。
- [x] 本机备份/启动升级、只读验收，不新增确认；v0.5白名单源码包哈希核验。

工程动作完成，Minor旧知识点字段标题待统一，真实识别/诊断/省时不由本轮合成检查证明；以LEARNING_EVIDENCE_DELIVERY.md为准。
