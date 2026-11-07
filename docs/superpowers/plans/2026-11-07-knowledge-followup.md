# 按知识点跟进补练复测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** 个人知识问题旁显示固定原题来源的补练/复测进展并定位完整过程。
**Architecture:** 共用知识身份函数，只读聚合现有learning_journeys；profile增加组内followup，不新增写API或数据表。
**Tech Stack:** Python/SQLite、原生JS/CSS，无新增依赖。
**Spec:** docs/design/KNOWLEDGE_FOLLOWUP_DESIGN.md

## Global Constraints

每生本地档案；老师主判；复测独立于原卷；一次正确不代表掌握；不自动外发/批准/发布；只本地Git提交，不合并main或推送。

## Review Focus

旧练习不能随原题新关联改知识归属；同名不同知识不能混并；一组答对不能覆盖另一组失败；旧版复测不能套当前待审题面；缺来源不倒推，定位不能串学生。

### Task 1: 知识关联与只读摘要

Files: app/learning_analysis.py、app/knowledge_followup.py、app/store.py、app/tests/test_knowledge_followup.py。
Interface: knowledge_group_id(question) -> stable str or None；attach_followup(analysis,journeys)原地附加followup/未匹配计数。
- [x] 专项先RED，覆盖空/待审/已批/各种复测、历史修订、固定知识身份和学生隔离。
- [x] 实现并运行专项及既有知识/过程相关检查，保留原卷计数不变。

### Task 2: 卡片与定位

Files: app/web/followup-panel.js、app/web/learning-panel.js、app/web/app.js、app/web/index.html、app/web/styles.css、app/server.py；docs/design/verify-knowledge-followup.mjs。
Interface: learningFollowupHTML(group)、followupHandle(action,element)。定位只选择当前档案知识组内的现有练习卡，不读外部服务或保存。
- [x] 浏览器先RED；检查摘要/最近条件、历史待审题面、定位身份/失败、空组、窄屏及无AI/写请求。
- [x] 完整Python与原档案/班级/连续审核回归，一次独立整轮审查；重要问题先复现再修复。

### Task 3: 本机与交付

Files: app/知识补练跟进说明.md、app/README.md、NEXT_STAGE_PLAN.md、DEVELOPMENT_ROADMAP.md；docs/design/KNOWLEDGE_FOLLOWUP_DELIVERY.md、本机验证/打包脚本。
- [x] 核实进程/无载入密钥/无活动任务、完整备份后更新0.21；只读检查业务摘要不变。
- [x] 白名单包CRC/逐文件SHA/源码核对，记录未验证项；显式暂存并本地提交。
