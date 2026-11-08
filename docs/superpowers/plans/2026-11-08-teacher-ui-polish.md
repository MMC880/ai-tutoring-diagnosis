# 教师工作台界面收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修复已授权UI测评中的首屏、核对空间、统计文案和新作业表单问题。

**Architecture:** 保留Python＋SQLite后台与HTML/CSS/原生JavaScript界面。仅调整已有数据呈现、浏览定位和弹窗布局，不变更业务API或档案算法。

**Tech Stack:** 既有原生前端、隔离合成服务、Chrome/CDP浏览器验证。

**Spec:** `docs/design/UI_EVALUATION_20261108.md`及`docs/research/UI_WORKFLOW_REFERENCES_20261108.md`；用户明确“就去把这些问题修修”。

## Global Constraints

- 延用当前独立工作区，基线`7a96ac9`，分支`feature/teacher-ui-polish`；只本地Git。
- 不新增依赖、插件、数据库、自动归档、外发或EXE；不读真实库。
- 单次错题不判长期薄弱；标签不冒充已关联知识；缺材料和待核对保持单列。
- 学生／原卷／版本切换守卫、未保存保护和明确确认保持。
- 同次作业编号仍明确填写，不自动把不同原题集合合并；可选日期不推测。

## Review Focus

- 同名学生、切换或迟到响应：摘要、定位和证据必须对应当前学生。
- 没有错误、没有知识归组或没有复测：清楚显示未知，不伪造复习或掌握结论。
- 长学生名／作业名／知识点与窄屏：不截断关键身份，不遮挡操作或焦点。
- 待核对、缺材料、零分母：不显示误导的零错误率，不改变统计计数。
- 新作业选填项展开／取消：字段各一份，日期校验、文件多选和取消不写入保持。

### Task 1: 关注摘要与档案首屏

**Files:** `app/web/archive-panel.js`、`app/web/learning-panel.js`、`app/web/styles.css`；新增浏览器验证`docs/design/verify-teacher-ui-polish.mjs`。

**Interfaces:** 读取既有`profile.learning_analysis.groups`与`archive_summary`；摘要跳转已有知识组，不创建学习记录。

- [x] 首先通过实际浏览器确认重复知识问题与证据入口在首屏可见的检查失败。
- [x] 提供前置摘要、明确标签依据、补练状态和安全定位；压缩历史计数，保留完整细节。
- [x] 验证空档案、正确／待核对、切换学生及旧档案／报告／补练回归。

### Task 2: 核对空间与统计表达

**Files:** `app/web/app.js`、`app/web/registration-panel.js`、`app/web/workspace-navigation.js`、`app/web/styles.css`。

**Interfaces:** 保留`#paper-select`和既有`summary?batch=`；页面按当前卷对应批次说明范围。

- [x] 先检查1366×768中第一道题位于固定底栏上方、统计口径可读的失败结果。
- [x] 收拢重复页头，保留身份／日期／范围；班级计数改完整中文，不改变分子分母。
- [x] 检查首题、固定底栏、疑点展开、0分母、部分正确／待核对／缺材料及选卷对应关系。

### Task 3: 表单减负与收尾

**Files:** `app/web/app.js`、`app/web/styles.css`；更新交付与路线文档。

**Interfaces:** 原`new-ref/new-name/new-batch/new-title/new-assignment-date/new-files/new-references`各保留一份，沿用`createPaper()`。

- [x] 先检查新建弹窗主操作可见、选填项可展开、取消不写入的失败结果。
- [x] 改中文标签、按需展开选填项和可达的操作栏，不自动猜编号／日期。
- [x] 运行新增浏览器验证、登记／导航／档案／知识／班级／日期相关既有回归，必要时全量回归。
- [x] 逐页查看桌面与窄屏截图；按Matt code-review作规范与需求两路审查，修复实际发现的问题。
- [x] 检查差异、敏感信息与数据边界；完成本地提交，报告截图、实测和未验证项。

## 执行记录

- 已在原独立工作区执行，无新建嵌套工作树；测试与交付见 `docs/design/UI_POLISH_DELIVERY.md`。
- Ruling: 新表单不自动生成同次作业编号，只澄清标签并收起选填项；避免拆散原有同次学生统计。
- Ruling: 证据弹窗与跨学生选卷补编号，属于原身份约束的界面修复，不改变学生选择或归档关系。
- 规范／需求审查各发现同一项补练身份P2，已修复并复审；全量回归通过后完成本地提交。
