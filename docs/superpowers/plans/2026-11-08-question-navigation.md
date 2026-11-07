# 整卷题目筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Inline, one independent review.

**Goal:** 老师筛选和定位本卷题目，保留全卷编辑与审核边界。
**Architecture:** question-navigation.js纯分类/文字过滤和本页DOM可见性；整卷始终保留全部编辑行。无数据库、接口或外发变更。
**Tech Stack:** 原生JS、现有Python工作台、Node/CDP合成测试。
**Spec:** docs/design/QUESTION_NAVIGATION_DESIGN.md

## Global Constraints

只隐藏不移除.question；collectQuestions收全卷。筛选不保存、不确认、不撤销未保存编辑。编辑时不自动藏掉正在写的题，计数即时更新、显式刷新再筛。切卷默认全部。定位先清除过滤。使用本地Git，不合并main或推送。

## Review Focus

隐藏题原答/批注不能丢；隐藏分歧仍阻止不合规整卷确认；编辑分类后不能失焦或误报零待审；旧工具条不能筛新学生；搜索/定位文本与题号安全转义。

### Task 1: 筛选规则

Files: app/web/question-navigation.js、app/tests/check_question_navigation.mjs。
Interface: questionNavigationMatches(q,filter,query)、questionNavigationCounts(questions)；复用gradingConflict。
- [x] Node RED，Expected:模块缺失失败。
- [x] 实现分类、多词查找、缺材料/待核对分列和提示规则；Expected:新Node全通过。

### Task 2: 整卷工具条

Files: question-navigation.js、app.js、index.html、styles.css、server.py；docs/design/verify-question-navigation.mjs。
Interfaces: questionNavigationHTML()、questionNavigationInit(p)、questionNavigationChanged()、questionNavigationHandle(action)。
- [x] 浏览器RED，Expected:工具条缺失。
- [x] 接入只隐藏、分类/搜索/定位/显式刷新，修改计数/添加题，版本0.26。
- [x] 新浏览器GREEN；完整Python、全部Node、审核/日期/知识关联/续录等受影响回归。Expected:全绿，无自动确认或外发。
- [x] 一次独审，重要项先RED后修复并完整回归，无遗留重要问题。

### Task 3: 本机及交付

- [x] 完整备份、身份/AI任务检查，更新本机0.26；Expected:只读通过、旧9表摘要和日期表0行不变。
- [x] 白名单包/CRC/哈希/源码核验，说明与两份进度，显式暂存本地提交；Expected:干净工作区、不合并或推送。
