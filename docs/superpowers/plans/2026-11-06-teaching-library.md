# 本地数学教学参考库 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task; no live student/model writes during tests.

**Goal:** 完成7步第3步软件支持：本地导入老师资料、核对带出处的知识条目、明确审核后关联错题，并保留历史引用。

**Architecture:** 复用已有受限附件上传与PDF/DOCX文字提取；新增teaching.py负责资料当前版本、历史快照、教师审核和目录引用。学生题目只保存material_id/version/entry_id引用；确认资料才能关联，资料修订不改旧引用。新增教学资料页面与逐题关联对话框，无自动RAG/全库模型外发。

**Tech Stack:** 当前Python/SQLite/原生JS；不新增依赖。

**Spec:** docs/pilot/MATH_V1_MILESTONES.md第3步，用户已指示继续；资料未提供时用合成内容检查，不虚构真实教案或山西官方目录。

## Global Constraints

- 教学参考与学生学习证据分开；只做初中数学，禁止心理档案。
- 所有新资料默认DRAFT，教师显式核对正文/公式/适用范围后才能APPROVED。
- 页码/章节由老师核对填写，不将普通Word段落或OCR识读猜成准确页码。
- 原件本地保存，不执行文档指令，不产生外部模型请求或加载旧密钥。
- 只改独立项目；无Git，保留源码副本和v0.10源码包，不初始化父仓库。

## Review Focus

- 同文件重复导入不复制资料；外部数据不能带入APPROVED或代替教师同意。
- 历史已审核引用固定资料版本与条目；新草稿不能改变历史错题依据。
- 无效/未审核/跨资料条目引用必须拒绝；JSON导入、AI/OCR不能清除/伪造已选引用。
- 切换资料/题号/卷版本或编辑后旧响应、旧审核同意不得继续生效。
- 备份恢复包括教学资料和版本及其附件，缺附件/引用损坏必须在替换当前库前拒绝。

### Task 1: 资料版本与引用核心

**Files:** Create app/teaching.py, app/tests/test_teaching.py; modify app/store.py, app/grading.py, app/server.py.

**Interfaces:**
- teaching.Library(store): create(payload), list(), get(id,version=None), save(id,version,payload), approve(id,version,consent), catalog(), reference(ref), paper_links(paper_id).
- reference: {material_id:hex32,version:positive_int,entry_id:hex32}; checked_questions accepts null to explicitly clear.
- optional question.teaching_ref persists; selected knowledge label must match referenced approved entry. Imports cannot grant/replace references; AI/OCR preserves reference and knowledge pairing.
- GET/POST /api/teaching/materials; GET/POST /api/teaching/materials/{id}[/versions/{v}|/approve]; GET /api/teaching/catalog; GET /api/papers/{id}/teaching-links.

- [x] Write/run failing tests: draft import, repeated hash, explicit approval, incomplete citations, version CAS/history, valid/invalid paper link, AI/import/OCR preservation, source file integrity and backup recovery.
- [x] Implement additive schema and source checks, integrate current/historical question reference validation and restore checks; run targeted/full regression.

### Task 2: 导入、目录核对、逐题关联

**Files:** Create app/web/teaching-panel.js; modify app/web/app.js,index.html,styles.css,archive-panel.js.

**Interfaces:** teachingPage(), teachingHandle(action,el), teachingQuestionHTML(q), teachingRenderLinks(p), teachingInvalidate()。独立编辑脏标记与同意撤销；逐题引用写入现有待审草稿后仍需整卷确认。

- [x] Browser RED for new入口; then verify localDOCX import, immutable source preview, manual knowledge/locator/content edit, draft not selectable, approval, question binding, source revision retaining old reference, stale response/edit guard and XSS escaping.
- [x] Inspect desktop/mobile; regress teacher grading/archive, record synthetic vs real boundaries.

### Task 3: v0.11交付

**Files:** docs/design/TEACHING_LIBRARY_DELIVERY.md, app/教学资料使用说明.md, progress, source allowlist package, stage plan updates.

- [x] Independent review; fix substantive issues with failing regression checks.
- [x] After tests, local backup/no-active-task check, update loopback service and compare business hash; no live source/student import.
- [x] Mark第3步软件支持ready，真实教案/资料审核、完整初中覆盖仍待老师材料与验收。

交付证据：docs/design/TEACHING_LIBRARY_DELIVERY.md。软件任务完成，真实资料和教师业务验收仍待完成。
