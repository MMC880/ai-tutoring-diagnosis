# 整卷照片处理清单 Implementation Plan

> Use superpowers:executing-plans inline, TDD and one final independent reviewer. User requests continuous implementation.

**Goal:** 老师在本卷看清每张照片处理到了哪里，准确返回对应照片继续核对。
**Architecture:** photo_progress.py只读聚合；server GET；photo-panel.js局部异步渲染接既有visionOpen/aiShowJob。
**Tech Stack:** 现有Python/SQLite/原生JS，无新增依赖。
**Spec:** docs/design/PHOTO_PROGRESS_DESIGN.md。

## Global Constraints

- 作业图片仅本卷PNG/JPEG；不关联参考图或其他学生，顺序按附件。
- 最近任务和曾保存待审记录分开，模型成功未应用不算保存；不宣称处理完整或批准。
- 接口仅最小状态，不带payload/原图/题目/敏感内容；不受最近30条截断。
- 只读，不新增调用、草稿或确认。异步切换保护、未保存编辑保护。
- 无独立Git，延用白名单版本包留档；不改父仓库和WorkBuddy历史。

## Review Focus

- 同名照片/参考答案/跨卷任务与缺失metadata不得串学生或回退第一图。
- 最近失败与旧保存、人工保存与AI成功不能混淆，过期版本只当历史证据。
- 异步响应返回时学生已切换或页面刷新，不能把旧状态显示到新学生。
- 刷新/打开任务不得偷偷丢弃未保存字段、触发发送或确认。
- 旧库无AI表、任务超过30条或损坏metadata时只读状态依然可用。

### Task 1 只读聚合

- [x] test_photo_progress.py RED：附件范围/顺序、最小字段、返回未存、保存/失败分别、人工存、跨卷/30条/坏metadata、只读无AI表。
- [x] 实现photo_progress.py和GET路由，定向与全套Expected PASS。

### Task 2 操作界面

- [x] verify-photo-progress.mjs RED：多图清单、准确开第二张、对应任务、草稿保护、刷新不丢字段、失败旧保存分列、异步切换、窄屏/转义/无外发。
- [x] 实现photo-panel.js，接render与handle/static脚本，浏览器与照片/辅导/主流程回归Expected PASS。

### Task 3 交付

- [x] 一次独立审查，Important先RED后修，完整套件PASS。
- [x] 备份并启动v0.7，实际页面只读核验；更新说明和源码包，MANIFEST/SHA/旧包核验。
