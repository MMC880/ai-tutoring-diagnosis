# 班级共性知识证据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** 本批知识问题按独立学生计数并追溯原题。
**Architecture:** 只读class_analysis组合既有个人去重；summary保留旧字段。class-panel渲染并保护证据/档案读取。
**Tech Stack:** 原生JS/CSS、Python/SQLite，无新增依赖。
**Spec:** docs/design/CLASS_KNOWLEDGE_DESIGN.md

## Global Constraints

数学本地单用户，老师主判；不自动诊断、确认、发布或外发；不改业务库schema；本地提交不推送、不合并main。

## Review Focus

同名不同条目及标签不能误并；一人多错不能冒充多人；重复文件逐生去重不能跨学生消失；改判与待审修订不能混用；延迟响应不能切错学生/批次。

### Task 1: 只读知识汇总

Files: app/class_analysis.py、app/store.py、app/tests/test_class_analysis.py。
Interface: build_class_analysis(latest,papers,event_documents) -> groups/unclassified_count/duplicate_count；summary追加class_analysis。
- [x] 写并运行测试，先观察summary缺失class_analysis的RED。
- [x] 实现逐生build_learning_analysis与跨学生稳定知识合并，人数只计INCORRECT/PARTIAL；空/缺/未知单列。运行专项与完整Python。

### Task 2: 页面与证据

Files: app/web/class-panel.js、app/web/app.js、app/web/index.html、app/web/styles.css、app/server.py；docs/design/verify-class-knowledge.mjs。
Interface: classKnowledgeHTML(summary)、classHandle(action,element)；原classPage插入知识区，复用profiles证据读取，档案跳转验证最新bootstrap归属。
- [x] 浏览器先RED；验证人数/状态、原证据只读、本地学生归属及跳转、失败重试、切页/换批/开窗取消、390px。
- [x] 接入并通过检查；原连续审核/档案/批次/材料关键回归；一次独立审查并对重要缺陷先复现后修复。

### Task 3: 本机与交付

Files: app/班级共性使用说明.md、app/README.md、NEXT_STAGE_PLAN.md、DEVELOPMENT_ROADMAP.md；docs/design/CLASS_KNOWLEDGE_DELIVERY.md和验证/打包脚本。
- [x] 更新前备份，核实服务路径/无密钥/无活动AI；更新0.20，实际只读检查业务摘要不变。
- [x] 显式源码白名单打包、CRC/逐文件SHA及源码比对，记录未验证项；显式暂存并本地提交。
