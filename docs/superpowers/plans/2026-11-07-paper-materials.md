# 原卷材料补交与整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 老师在正确学生原卷上补交和排序材料，保留历史并重新审核。
**Architecture:** 独立paper_materials.py处理现有Store上的附件更新事务；新增受保护POST，独立materials-panel.js弹窗复用upload及原审核台。
**Tech Stack:** 现有Python/SQLite、原生JS/CSS，无新增依赖。
**Spec:** docs/design/PAPER_MATERIALS_DESIGN.md

## Global Constraints

同卷/同学生/同来源版本核准；旧原件保留、用途不变；不自动补题、判题、确认、外发；最多20附件、每文件15MB；只有本地Git提交，不推送或合并main。

## Review Focus

- 补交使确认版本过期但不删除旧事件，也不自动解除MISSING。
- 全顺序不变为无操作；重放旧版本失败且不重复挂载。
- 旧文件不能通过ID替换、用途切换或删除被静默移除。
- 上传/保存失败、取消、切学生及迟到回调保持正确目标。
- 参考文件与作业原件用途清楚，页面转义且窄屏可用。

### Task 1: 版本化附件更新

Files: app/paper_materials.py, app/server.py, app/tests/test_paper_materials.py, app/tests/test_http.py，app/store.py和app/learning_analysis.py的事件版本附件读取。
Interface: update_documents(store,paper_id,payload)->paper。

- [x] 测试新增、排序、无操作、历史/缺材料保留、学生和严格版本/同意、重复ID/删除/改用途/上限/不存在文件拒绝，先RED。
- [x] 实现事务更新、受保护POST，专项GREEN。

### Task 2: 老师材料编辑入口

Files: app/web/materials-panel.js, app/web/app.js, app/web/index.html, app/web/styles.css；docs/design/verify-paper-materials.mjs。
Interface: materialsOpen(), materialsHandle(action,el), materialsChanged(el)。

- [x] 浏览器入口先RED，再实现原件/新增文件/用途/排序与目标确认。
- [x] 隔离验证取消、失败恢复、旧来源、同意撤销、重复ID不挂载、补交后待审，原档案和批次页回归。

### Task 3: 审查与交付

- [x] 独立一次审查；问题先复现后修，完整回归。
- [x] 备份后更新本机0.18，业务摘要不变；说明、白名单包和实际只读检查。
- [x] 按AGENTS敏感检查和显式暂存，本地功能提交，报告结果与未验证项。

实现补充：paper_document_versions保留0号原始锚点及变化前后附件元数据，历史回看及重复证据选择当次附件；旧备份加表迁移，恢复校验锚点、版本连续变化、原件归属及当前一致性。取消只阻断尚未提交的挂卷，不撤销已获明确同意且可能已提交的请求。
